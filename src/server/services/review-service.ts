import { prisma } from '@/lib/prisma'
import { can } from '@/server/authz/can'
import { parsePtDate } from '@/lib/dates'
import { decimalStringFromCents } from '@/lib/money'
import { normalizeDocumentNumber } from './extraction'
import type { DocumentStatus, DocumentType, UserRole } from '@prisma/client'

/**
 * Document review queue (S3.1) with optimistic locking (A7).
 * Every state transition is a conditional UPDATE on (id, version, status) —
 * never read-then-write. Losers of a race get 409 with the current state.
 * Every decision creates a DocumentReview (full history) + AuditLog.
 */

export interface ReviewCorrections {
  type?: DocumentType
  supplierName?: string
  supplierNif?: string
  documentNumber?: string
  issueDate?: string // DD/MM/YYYY
  totalCents?: number
  accountCode?: string
  vatTreatment?: string
  clientId?: string
}

export type ReviewResult =
  | { ok: true; status: DocumentStatus; version: number }
  | { ok: false; httpStatus: 400 | 403 | 404 | 409; error: string; currentStatus?: DocumentStatus }

const REVIEWABLE_FROM: DocumentStatus[] = [
  'PENDING_CLASSIFICATION', 'CLASSIFIED', 'NEEDS_REVIEW', 'REVIEWED', 'PRE_VALIDATED', 'VALIDATED',
]

const REVIEW_FIELDS = [
  'type', 'supplierName', 'supplierNif', 'documentNumber', 'issueDate',
  'totalAmount', 'accountCode', 'vatTreatment', 'clientId', 'status', 'flags',
] as const

function snapshot(doc: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(REVIEW_FIELDS.map((f) => [f, doc[f] ?? null]))
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

  const before = snapshot(doc as unknown as Record<string, unknown>)
  const c = params.corrections ?? {}

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
    if (c.totalCents !== undefined) data.totalAmount = decimalStringFromCents(c.totalCents)
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
      status: { in: REVIEWABLE_FROM },
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
