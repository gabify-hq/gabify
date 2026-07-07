import { prisma } from '@/lib/prisma'
import { can } from '@/server/authz/can'
import { parsePtDate } from '@/lib/dates'
import { decimalStringFromCents, centsFromDecimalString, COHERENCE_TOLERANCE_CENTS } from '@/lib/money'
import { normalizeDocumentNumber } from './extraction'
import type { DocumentStatus, DocumentType, Prisma, UserRole } from '@prisma/client'

/**
 * Document review queue (S3.1) with optimistic locking (A7).
 * Every state transition is a conditional UPDATE on (id, version, status) —
 * never read-then-write. Losers of a race get 409 with the current state.
 * Every decision creates a DocumentReview (full history) + AuditLog.
 */

export interface CorrectionVatBand {
  region?: string
  rate: number
  baseCents: number
  vatCents: number
}

export interface ReviewCorrections {
  type?: DocumentType
  supplierName?: string
  supplierNif?: string
  documentNumber?: string
  issueDate?: string // DD/MM/YYYY
  dueDate?: string // DD/MM/YYYY
  totalCents?: number
  withholdingCents?: number
  currency?: string // ISO 4217
  vatBreakdown?: CorrectionVatBand[]
  accountCode?: string
  vatTreatment?: string
  clientId?: string
}

export type ReviewResult =
  | { ok: true; status: DocumentStatus; version: number }
  | {
      ok: false
      httpStatus: 400 | 403 | 404 | 409 | 422
      error: string
      currentStatus?: DocumentStatus
      details?: Record<string, string>
    }

/**
 * VALIDATED is intentionally absent: a validated document is immutable except
 * through the reopen escape valve (A9) — see reopenWindowIsOpen().
 */
const REVIEWABLE_FROM: DocumentStatus[] = [
  'PENDING_CLASSIFICATION', 'CLASSIFIED', 'NEEDS_REVIEW', 'REVIEWED', 'PRE_VALIDATED',
]

/** Valid PT VAT rates per fiscal region (mainland, Açores, Madeira). */
export const VALID_VAT_RATES: Record<string, readonly number[]> = {
  PT: [0, 6, 13, 23],
  'PT-AC': [0, 4, 9, 16],
  'PT-MA': [0, 5, 12, 22],
}

const REVIEW_FIELDS = [
  'type', 'supplierName', 'supplierNif', 'documentNumber', 'issueDate', 'dueDate',
  'totalAmount', 'withholdingAmount', 'currency', 'vatBreakdown',
  'accountCode', 'vatTreatment', 'clientId', 'status', 'flags',
] as const

function snapshot(doc: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(REVIEW_FIELDS.map((f) => [f, doc[f] ?? null]))
}

function centsOfDecimal(value: Prisma.Decimal | null): number | null {
  return value === null ? null : centsFromDecimalString(String(value))
}

/**
 * Server-side validation of the extended corrections (S5.1). The client-side
 * coherence hint is advisory only — THIS is the authority. Returns per-field
 * errors; empty object means valid.
 */
export function validateCorrections(
  doc: {
    issueDate: Date | null
    totalAmount: Prisma.Decimal | null
    withholdingAmount: Prisma.Decimal | null
    vatBreakdown: unknown
  },
  c: ReviewCorrections,
): Record<string, string> {
  const errors: Record<string, string> = {}

  if (c.vatBreakdown !== undefined) {
    for (const [i, band] of c.vatBreakdown.entries()) {
      const region = band.region ?? 'PT'
      const allowed = VALID_VAT_RATES[region]
      if (!allowed) {
        errors[`vatBreakdown.${i}.region`] = `Região desconhecida: ${region}`
      } else if (!allowed.includes(band.rate)) {
        errors[`vatBreakdown.${i}.rate`] =
          `Taxa de IVA inválida para ${region}: ${band.rate} (válidas: ${allowed.join(', ')})`
      }
      if (!Number.isInteger(band.baseCents) || band.baseCents < 0) {
        errors[`vatBreakdown.${i}.baseCents`] = 'Base deve ser cêntimos inteiros ≥ 0'
      }
      if (!Number.isInteger(band.vatCents) || band.vatCents < 0) {
        errors[`vatBreakdown.${i}.vatCents`] = 'IVA deve ser cêntimos inteiros ≥ 0'
      }
    }
  }
  if (c.withholdingCents !== undefined && (!Number.isInteger(c.withholdingCents) || c.withholdingCents < 0)) {
    errors.withholdingCents = 'Retenção deve ser cêntimos inteiros ≥ 0'
  }
  if (c.currency !== undefined && !/^[A-Z]{3}$/.test(c.currency)) {
    errors.currency = 'Moeda deve ser um código ISO 4217 (ex: EUR)'
  }

  const issueDate = c.issueDate !== undefined ? parsePtDate(c.issueDate) : doc.issueDate
  if (c.issueDate !== undefined && !issueDate) {
    errors.issueDate = 'Data de emissão inválida (DD/MM/AAAA)'
  }
  if (c.dueDate !== undefined) {
    const dueDate = parsePtDate(c.dueDate)
    if (!dueDate) {
      errors.dueDate = 'Data de vencimento inválida (DD/MM/AAAA)'
    } else if (issueDate && dueDate.getTime() < issueDate.getTime()) {
      errors.dueDate = 'Data de vencimento anterior à data de emissão'
    }
  }

  // Arithmetic coherence (A1) — only when the correction touches money and the
  // effective values are computable. Both PT conventions accepted: gross total
  // (AT QR field O) or total net of withholding.
  const touchesMoney =
    c.vatBreakdown !== undefined || c.withholdingCents !== undefined || c.totalCents !== undefined
  if (touchesMoney && Object.keys(errors).length === 0) {
    const bands =
      c.vatBreakdown ?? ((doc.vatBreakdown as CorrectionVatBand[] | null) ?? [])
    const withholding = c.withholdingCents ?? centsOfDecimal(doc.withholdingAmount) ?? 0
    const total = c.totalCents ?? centsOfDecimal(doc.totalAmount)
    if (bands.length > 0 && total !== null) {
      const bases = bands.reduce((acc, b) => acc + b.baseCents, 0)
      const vats = bands.reduce((acc, b) => acc + b.vatCents, 0)
      const grossDelta = Math.abs(bases + vats - total)
      const netDelta = Math.abs(bases + vats - withholding - total)
      if (Math.min(grossDelta, netDelta) > COHERENCE_TOLERANCE_CENTS) {
        errors.totalCents =
          `Σbases+ΣIVA−retenção não corresponde ao total (desvio ${Math.min(grossDelta, netDelta)} cêntimos, tolerância ${COHERENCE_TOLERANCE_CENTS})`
      }
    }
  }

  return errors
}

/**
 * A VALIDATED document can only be reviewed inside the post-reopen window:
 * the latest DocumentReview entry is a `reopen` (A9). The window closes with
 * the next review decision.
 */
async function reopenWindowIsOpen(documentId: string): Promise<boolean> {
  const last = await prisma.documentReview.findFirst({
    where: { documentId },
    orderBy: [{ reviewedAt: 'desc' }, { id: 'desc' }],
    select: { decision: true },
  })
  return last?.decision === 'reopen'
}

export async function reviewDocument(params: {
  documentId: string
  officeId: string
  userId: string
  role: UserRole
  decision: 'validate' | 'correct' | 'reject'
  corrections?: ReviewCorrections
  expectedVersion: number
  notes?: string
}): Promise<ReviewResult> {
  if (!can(params.role, 'document:review')) {
    return { ok: false, httpStatus: 404, error: 'Não encontrado' }
  }

  const doc = await prisma.document.findFirst({
    where: { id: params.documentId, officeId: params.officeId, deletedAt: null },
    include: { client: { select: { name: true } } },
  })
  if (!doc) return { ok: false, httpStatus: 404, error: 'Documento não encontrado' }

  if (doc.status === 'EXPORTED' || doc.status === 'SPLIT') {
    return {
      ok: false, httpStatus: 409,
      error: 'Documento exportado — use a reabertura (apenas proprietário)',
      currentStatus: doc.status,
    }
  }

  // VALIDATED is immutable except inside the post-reopen window (A9/S5.1)
  const fromStatuses: DocumentStatus[] =
    doc.status === 'VALIDATED'
      ? (await reopenWindowIsOpen(doc.id)) ? ['VALIDATED'] : []
      : REVIEWABLE_FROM
  if (fromStatuses.length === 0) {
    return {
      ok: false, httpStatus: 409,
      error: 'Documento validado — imutável sem reabertura',
      currentStatus: doc.status,
    }
  }

  const before = snapshot(doc as unknown as Record<string, unknown>)
  const c = params.corrections ?? {}

  if (params.decision === 'correct') {
    const fieldErrors = validateCorrections(doc, c)
    if (Object.keys(fieldErrors).length > 0) {
      return { ok: false, httpStatus: 422, error: 'Correções inválidas', details: fieldErrors }
    }
  }

  // Validate cross-office client assignment (AC-1.4.e applies here too)
  if (c.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: c.clientId, officeId: params.officeId, deletedAt: null },
      select: { id: true },
    })
    if (!client) return { ok: false, httpStatus: 404, error: 'Cliente não encontrado' }
  }

  const targetStatus: DocumentStatus =
    params.decision === 'reject' ? doc.status : 'VALIDATED'

  const data: Record<string, unknown> = {
    status: targetStatus,
    version: { increment: 1 },
  }
  if (params.decision === 'reject') {
    data.deletedAt = new Date() // rejected documents leave every queue/export
  }
  if (params.decision === 'correct') {
    if (c.type) data.type = c.type
    if (c.supplierName !== undefined) data.supplierName = c.supplierName
    if (c.supplierNif !== undefined) data.supplierNif = c.supplierNif
    if (c.documentNumber !== undefined) {
      data.documentNumber = normalizeDocumentNumber(c.documentNumber)
    }
    if (c.issueDate !== undefined) data.issueDate = parsePtDate(c.issueDate)
    if (c.dueDate !== undefined) data.dueDate = parsePtDate(c.dueDate)
    if (c.totalCents !== undefined) data.totalAmount = decimalStringFromCents(c.totalCents)
    if (c.withholdingCents !== undefined) {
      data.withholdingAmount = decimalStringFromCents(c.withholdingCents)
    }
    if (c.currency !== undefined) data.currency = c.currency
    if (c.vatBreakdown !== undefined) {
      data.vatBreakdown = c.vatBreakdown.map((b) => ({
        region: b.region ?? 'PT',
        rate: b.rate,
        baseCents: b.baseCents,
        vatCents: b.vatCents,
      }))
    }
    if (c.accountCode !== undefined) {
      data.accountCode = c.accountCode
      data.sncSource = 'RULE' === doc.sncSource ? doc.sncSource : 'HUMAN'
    }
    if (c.vatTreatment !== undefined) data.vatTreatment = c.vatTreatment
    if (c.clientId !== undefined) data.clientId = c.clientId
    // A human decision clears review flags
    data.flags = []
    data.duplicateOfId = null
  }

  // Optimistic conditional transition (A7)
  const won = await prisma.document.updateMany({
    where: {
      id: doc.id,
      officeId: params.officeId,
      version: params.expectedVersion,
      status: { in: fromStatuses },
    },
    data: data as never,
  })
  if (won.count === 0) {
    const fresh = await prisma.document.findUnique({
      where: { id: doc.id },
      select: { status: true },
    })
    return {
      ok: false, httpStatus: 409,
      error: 'Documento atualizado por outro utilizador',
      currentStatus: fresh?.status,
    }
  }

  const updated = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })

  await prisma.documentReview.create({
    data: {
      documentId: doc.id,
      reviewerId: params.userId,
      decision: params.decision,
      confirmedType: updated.type,
      before: before as object,
      after: snapshot(updated as unknown as Record<string, unknown>) as object,
      notes: params.notes ?? null,
    },
  })
  await prisma.auditLog.create({
    data: {
      officeId: params.officeId,
      userId: params.userId,
      action: `DOCUMENT_REVIEW_${params.decision.toUpperCase()}`,
      entityType: 'Document',
      entityId: doc.id,
      approvedById: params.userId,
      approvedAt: new Date(),
      metadata: { decision: params.decision, corrections: (params.corrections ?? null) as object },
    },
  })

  return { ok: true, status: updated.status, version: updated.version }
}

export interface BulkItemResult {
  documentId: string
  result: 'OK' | 'CONFLICT' | 'FORBIDDEN' | 'NOT_FOUND'
}

/** Bulk validate — each item checked independently; one failure never rolls back the others (A7). */
export async function bulkValidate(params: {
  officeId: string
  userId: string
  role: UserRole
  items: Array<{ documentId: string; expectedVersion: number }>
}): Promise<BulkItemResult[]> {
  const results: BulkItemResult[] = []
  for (const item of params.items) {
    if (!can(params.role, 'document:review')) {
      results.push({ documentId: item.documentId, result: 'FORBIDDEN' })
      continue
    }
    const exists = await prisma.document.findFirst({
      where: { id: item.documentId, officeId: params.officeId, deletedAt: null },
      select: { id: true },
    })
    if (!exists) {
      results.push({ documentId: item.documentId, result: 'NOT_FOUND' })
      continue
    }
    const outcome = await reviewDocument({
      documentId: item.documentId,
      officeId: params.officeId,
      userId: params.userId,
      role: params.role,
      decision: 'validate',
      expectedVersion: item.expectedVersion,
    })
    results.push({
      documentId: item.documentId,
      result: outcome.ok ? 'OK' : outcome.httpStatus === 409 ? 'CONFLICT' : 'FORBIDDEN',
    })
  }
  return results
}

/**
 * Reopens an EXPORTED document back to VALIDATED (A9): OWNER only, mandatory
 * reason, fully audited. The escape valve for errors found after export.
 */
export async function reopenDocument(params: {
  documentId: string
  officeId: string
  userId: string
  role: UserRole
  reason: string
}): Promise<ReviewResult> {
  if (params.role !== 'OWNER') {
    return { ok: false, httpStatus: 403, error: 'Apenas o proprietário pode reabrir documentos exportados' }
  }
  if (!params.reason || params.reason.trim() === '') {
    return { ok: false, httpStatus: 400, error: 'Motivo obrigatório' }
  }

  const won = await prisma.document.updateMany({
    where: { id: params.documentId, officeId: params.officeId, status: 'EXPORTED' },
    data: { status: 'VALIDATED', version: { increment: 1 } },
  })
  if (won.count === 0) {
    return { ok: false, httpStatus: 409, error: 'Documento não está exportado' }
  }

  const updated = await prisma.document.findUniqueOrThrow({ where: { id: params.documentId } })
  await prisma.documentReview.create({
    data: {
      documentId: params.documentId,
      reviewerId: params.userId,
      decision: 'reopen',
      confirmedType: updated.type,
      notes: params.reason,
    },
  })
  await prisma.auditLog.create({
    data: {
      officeId: params.officeId,
      userId: params.userId,
      action: 'DOCUMENT_REOPENED',
      entityType: 'Document',
      entityId: params.documentId,
      metadata: { reason: params.reason },
    },
  })
  return { ok: true, status: updated.status, version: updated.version }
}

/** Duplicate resolution (AC-4.1.f): keep = archive as duplicate; delete = soft-delete; distinct = clear flag. */
export async function resolveDuplicate(params: {
  documentId: string
  officeId: string
  userId: string
  role: UserRole
  resolution: 'keep' | 'delete' | 'distinct'
  expectedVersion: number
}): Promise<ReviewResult> {
  if (!can(params.role, 'document:review')) {
    return { ok: false, httpStatus: 404, error: 'Não encontrado' }
  }
  const doc = await prisma.document.findFirst({
    where: { id: params.documentId, officeId: params.officeId, deletedAt: null },
  })
  if (!doc) return { ok: false, httpStatus: 404, error: 'Documento não encontrado' }
  if (!doc.flags.includes('DUPLICATE_SUSPECT')) {
    return { ok: false, httpStatus: 409, error: 'Documento não está marcado como duplicado' }
  }

  const data: Record<string, unknown> = { version: { increment: 1 } }
  if (params.resolution === 'distinct') {
    data.flags = doc.flags.filter((f) => f !== 'DUPLICATE_SUSPECT')
    data.duplicateOfId = null
    data.status = (doc.confidence ?? 0) >= 0.85 ? 'PRE_VALIDATED' : 'NEEDS_REVIEW'
  } else if (params.resolution === 'delete') {
    data.deletedAt = new Date()
  } else {
    data.status = 'REVIEWED' // archived as confirmed duplicate — out of queues/exports
  }

  const won = await prisma.document.updateMany({
    where: { id: doc.id, version: params.expectedVersion },
    data: data as never,
  })
  if (won.count === 0) {
    return { ok: false, httpStatus: 409, error: 'Documento atualizado por outro utilizador' }
  }

  const updated = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
  await prisma.documentReview.create({
    data: {
      documentId: doc.id,
      reviewerId: params.userId,
      decision: 'resolve-duplicate',
      confirmedType: updated.type,
      notes: params.resolution,
    },
  })
  await prisma.auditLog.create({
    data: {
      officeId: params.officeId,
      userId: params.userId,
      action: 'DUPLICATE_RESOLVED',
      entityType: 'Document',
      entityId: doc.id,
      metadata: { resolution: params.resolution },
    },
  })
  return { ok: true, status: updated.status, version: updated.version }
}

/** Applies a low-confidence split suggestion after human approval (AC-4.1.f). */
export async function approveSplit(params: {
  documentId: string
  officeId: string
  userId: string
  role: UserRole
}): Promise<ReviewResult> {
  if (!can(params.role, 'document:review')) {
    return { ok: false, httpStatus: 404, error: 'Não encontrado' }
  }
  const doc = await prisma.document.findFirst({
    where: { id: params.documentId, officeId: params.officeId, deletedAt: null },
  })
  if (!doc || !doc.contentSha256 || !doc.r2Key) {
    return { ok: false, httpStatus: 404, error: 'Documento não encontrado' }
  }
  const cache = await prisma.documentSplitCache.findUnique({
    where: { officeId_sha256: { officeId: params.officeId, sha256: doc.contentSha256 } },
  })
  const stored = cache?.boundaries as { invoices?: Array<{ startPage: number; endPage: number }> } | undefined
  if (!stored?.invoices || stored.invoices.length < 2) {
    return { ok: false, httpStatus: 409, error: 'Sem sugestão de divisão para este documento' }
  }

  const { downloadFromR2 } = await import('@/lib/r2')
  const { executeSplit } = await import('./pdf-split')
  const buffer = await downloadFromR2(doc.r2Key)
  await executeSplit({ document: doc, buffer, boundaries: stored.invoices })

  await prisma.auditLog.create({
    data: {
      officeId: params.officeId,
      userId: params.userId,
      action: 'SPLIT_APPROVED',
      entityType: 'Document',
      entityId: doc.id,
      metadata: { boundaries: stored.invoices as object },
    },
  })
  return { ok: true, status: 'SPLIT', version: doc.version }
}
