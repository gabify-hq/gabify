import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { anthropic, CLAUDE_MODEL } from '@/lib/anthropic'
import { parseATFiscalQR, atQRDocTypeToDocumentType, atQRDateToPT, type ATQRData } from '@/lib/at-fiscal-qr'
import { extractQRCodeFromImage, extractQRCodeFromPDF } from '@/lib/qr-reader'
import { extractText } from '@/lib/text-extractor'
import { parsePtDate } from '@/lib/dates'
import { decimalStringFromCents, COHERENCE_TOLERANCE_CENTS } from '@/lib/money'
import type { Document, DocumentType } from '@prisma/client'

/**
 * Unified extraction cascade (S2.3): AT QR (authoritative, zero AI) →
 * CIUS-PT/UBL XML (deterministic) → Claude with a strict Zod-validated schema.
 * Both the email-attachment path and manual uploads run through here —
 * one pipeline, one set of invariants.
 */

const CONFIDENCE_CLASSIFIED = 0.85

// ── Document number normalization (A8) ──────────────────────────────────────

export function normalizeDocumentNumber(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toUpperCase()
}

// ── AI response schema (strict — invented/malformed fields are rejected) ────

const VAT_BAND_SCHEMA = z.object({
  region: z.string().default('PT'),
  rate: z.number().min(0).max(100),
  baseCents: z.number().int(),
  vatCents: z.number().int(),
})

const AI_EXTRACTION_SCHEMA = z.object({
  type: z.enum([
    'INVOICE_RECEIVED', 'INVOICE_ISSUED', 'INVOICE_RECEIPT', 'RECEIPT',
    'BANK_STATEMENT', 'PAYROLL', 'TAX_DOCUMENT', 'AT_COMMUNICATION',
    'SOCIAL_SECURITY', 'CONTRACT', 'BALANCE_SHEET', 'INCOME_STATEMENT', 'OTHER',
  ]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().nullish(),
  supplierName: z.string().nullish(),
  supplierNif: z.string().regex(/^\d{9}$/).nullish(),
  buyerNif: z.string().regex(/^\d{9}$/).nullish(),
  documentNumber: z.string().nullish(),
  issueDate: z.string().nullish(),
  dueDate: z.string().nullish(),
  currency: z.string().default('EUR'),
  vatBreakdown: z.array(VAT_BAND_SCHEMA).nullish(),
  netCents: z.number().int().nullish(),
  vatCents: z.number().int().nullish(),
  withholdingCents: z.number().int().nullish(),
  totalCents: z.number().int().nullish(),
  documentLines: z
    .array(
      z.object({
        description: z.string(),
        qty: z.number().nullish(),
        unitPriceCents: z.number().int().nullish(),
        vatRate: z.number().nullish(),
        totalCents: z.number().int().nullish(),
      })
    )
    .nullish(),
})

export type AiExtraction = z.infer<typeof AI_EXTRACTION_SCHEMA>

// ── Public entry point ───────────────────────────────────────────────────────

export interface ExtractionOutcome {
  type: DocumentType
  confidence: number
  extractionSource: string
}

const VISION_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

/**
 * Runs the extraction cascade for a document and persists the result.
 * QR-sourced fields are authoritative and never overwritten by later AI runs
 * (AC-3.1.b): a document already extracted from QR/XML is left untouched.
 */
export async function runExtractionCascade(params: {
  document: Document
  buffer: Buffer
  filename: string
  mimeType: string
}): Promise<ExtractionOutcome> {
  const { document, buffer, filename, mimeType } = params

  // Authoritative sources are final — re-parses never downgrade them (AC-3.1.b)
  if (document.extractionSource === 'QR' || document.extractionSource === 'XML') {
    return {
      type: document.type,
      confidence: document.confidence ?? 0.99,
      extractionSource: document.extractionSource,
    }
  }

  const isImage = VISION_MIME_TYPES.has(mimeType)
  const isPdf = mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')
  const isXml = filename.toLowerCase().endsWith('.xml') || mimeType.includes('xml')

  // 1) AT fiscal QR — authoritative, zero AI cost
  let qrPayload: string | null = null
  if (isImage) qrPayload = await extractQRCodeFromImage(buffer)
  else if (isPdf) qrPayload = await extractQRCodeFromPDF(buffer)

  if (qrPayload) {
    const atData = parseATFiscalQR(qrPayload)
    if (atData) {
      return applyQrExtraction(document, atData)
    }
  }

  // 2) Deterministic UBL/CIUS-PT XML
  if (isXml) {
    const xmlResult = tryXmlExtraction(buffer.toString('utf-8'))
    if (xmlResult) {
      return applyStructuredExtraction(document, xmlResult, 'XML', 0.97, 'INVOICE_RECEIVED')
    }
  }

  // 3) Claude with the strict extraction schema
  return runAiExtraction({ document, buffer, filename, mimeType, isImage, isPdf })
}

// ── QR path ──────────────────────────────────────────────────────────────────

interface StructuredFields {
  supplierName?: string | null
  supplierNif?: string | null
  buyerNif?: string | null
  documentNumber?: string | null
  issueDate?: Date | null
  dueDate?: Date | null
  currency?: string
  vatBreakdown?: Array<{ region: string; rate: number; baseCents: number; vatCents: number }> | null
  netCents?: number | null
  vatCents?: number | null
  withholdingCents?: number | null
  totalCents?: number | null
  documentLines?: unknown | null
  atcud?: string | null
  reasoning?: string | null
}

async function applyQrExtraction(document: Document, atData: ATQRData): Promise<ExtractionOutcome> {
  const type = atQRDocTypeToDocumentType(atData.docTypeCode) as DocumentType
  const datePT = atQRDateToPT(atData.dateRaw)
  const baseCentsSum = atData.vatBands.reduce((acc, b) => acc + b.baseCents, 0)
  const vatCentsSum = atData.vatBands.reduce((acc, b) => acc + b.vatCents, 0)

  const fields: StructuredFields = {
    supplierNif: atData.nifEmitter,
    buyerNif: atData.nifBuyer && atData.nifBuyer !== '999999990' ? atData.nifBuyer : null,
    documentNumber: atData.docId || null,
    issueDate: datePT ? parsePtDate(datePT) : null,
    vatBreakdown: atData.vatBands.length > 0 ? atData.vatBands : null,
    netCents: atData.vatBands.length > 0 ? baseCentsSum : null,
    vatCents: atData.totalVatCents ?? (atData.vatBands.length > 0 ? vatCentsSum : null),
    withholdingCents: atData.withholdingCents,
    totalCents: atData.totalCents,
    atcud: atData.atcud,
    reasoning: `QR fiscal AT (${atData.docTypeCode})`,
  }

  return applyStructuredExtraction(document, fields, 'QR', 0.99, type)
}

// ── XML path (lightweight UBL field extraction — full CIUS-PT validation is out of scope §7) ──

export function tryXmlExtraction(xml: string): StructuredFields | null {
  if (!/urn:oasis:names:specification:ubl/.test(xml)) return null

  const pick = (re: RegExp): string | null => {
    const m = xml.match(re)
    return m ? m[1].trim() : null
  }
  const cents = (v: string | null): number | null =>
    v === null ? null : Math.round(parseFloat(v) * 100)

  const id = pick(/<cbc:ID>([^<]+)<\/cbc:ID>/)
  const issueDate = pick(/<cbc:IssueDate>([^<]+)<\/cbc:IssueDate>/)
  const total = cents(pick(/<cbc:TaxInclusiveAmount[^>]*>([^<]+)<\/cbc:TaxInclusiveAmount>/))
  const net = cents(pick(/<cbc:TaxExclusiveAmount[^>]*>([^<]+)<\/cbc:TaxExclusiveAmount>/))
  const vat = cents(pick(/<cbc:TaxAmount[^>]*>([^<]+)<\/cbc:TaxAmount>/))
  const nifs = [...xml.matchAll(/<cbc:CompanyID>(?:PT)?(\d{9})<\/cbc:CompanyID>/g)].map((m) => m[1])
  const supplierName = pick(/<cbc:Name>([^<]+)<\/cbc:Name>/)
  const rate = pick(/<cbc:Percent>([^<]+)<\/cbc:Percent>/)

  if (!id || total === null) return null

  return {
    supplierName,
    supplierNif: nifs[0] ?? null,
    buyerNif: nifs[1] ?? null,
    documentNumber: id,
    issueDate: issueDate ? parsePtDate(issueDate) : null,
    vatBreakdown:
      net !== null && vat !== null
        ? [{ region: 'PT', rate: rate ? Number(rate) : 23, baseCents: net, vatCents: vat }]
        : null,
    netCents: net,
    vatCents: vat,
    totalCents: total,
    reasoning: 'Fatura eletrónica UBL/CIUS-PT (extração determinística)',
  }
}

// ── AI path ──────────────────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `És um assistente de contabilidade portuguesa. Analisa o documento e devolve APENAS um objeto JSON válido (sem markdown) com este schema exato:
{
  "type": "INVOICE_RECEIVED|INVOICE_ISSUED|INVOICE_RECEIPT|RECEIPT|BANK_STATEMENT|PAYROLL|TAX_DOCUMENT|AT_COMMUNICATION|SOCIAL_SECURITY|CONTRACT|BALANCE_SHEET|INCOME_STATEMENT|OTHER",
  "confidence": 0.0-1.0,
  "reasoning": "uma frase em português",
  "supplierName": string|null, "supplierNif": "9 dígitos"|null, "buyerNif": "9 dígitos"|null,
  "documentNumber": string|null, "issueDate": "DD/MM/YYYY"|null, "dueDate": "DD/MM/YYYY"|null,
  "currency": "EUR",
  "vatBreakdown": [{"region":"PT","rate":23,"baseCents":10000,"vatCents":2300}]|null,
  "netCents": int|null, "vatCents": int|null, "withholdingCents": int|null, "totalCents": int|null,
  "documentLines": [{"description":string,"qty":num|null,"unitPriceCents":int|null,"vatRate":num|null,"totalCents":int|null}]|null
}
Valores monetários SEMPRE em cêntimos inteiros. Campos que não constam do documento ficam null — NUNCA inventes valores. Deteta menções de retenção na fonte (IRS/IRC) e preenche withholdingCents.`

async function runAiExtraction(params: {
  document: Document
  buffer: Buffer
  filename: string
  mimeType: string
  isImage: boolean
  isPdf: boolean
}): Promise<ExtractionOutcome> {
  const { document, buffer, filename, mimeType, isImage, isPdf } = params

  let content: unknown
  let extractionSource: string
  if (isImage) {
    extractionSource = 'AI_VISION'
    content = [
      { type: 'image', source: { type: 'base64', media_type: mimeType, data: buffer.toString('base64') } },
      { type: 'text', text: EXTRACTION_PROMPT },
    ]
  } else if (isPdf) {
    const text = document.textContent ?? (await extractText(buffer, filename))
    if (text) {
      extractionSource = 'AI_TEXT'
      content = [{ type: 'text', text: `${EXTRACTION_PROMPT}\n\nDocumento:\n${text.slice(0, 30_000)}` }]
    } else {
      extractionSource = 'AI_PDF'
      content = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } },
        { type: 'text', text: EXTRACTION_PROMPT },
      ]
    }
  } else {
    extractionSource = 'AI_TEXT'
    const text = document.textContent ?? (await extractText(buffer, filename)) ?? ''
    content = [{ type: 'text', text: `${EXTRACTION_PROMPT}\n\nDocumento:\n${text.slice(0, 30_000)}` }]
  }

  let parsed: AiExtraction
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1500,
      messages: [{ role: 'user', content: content as never }],
    })
    const raw = (response.content[0] as { text: string }).text
    const jsonText = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '')
    parsed = AI_EXTRACTION_SCHEMA.parse(JSON.parse(jsonText))
  } catch (error) {
    // Malformed / schema-violating AI output: NEEDS_REVIEW, ZERO partial persistence (AC-3.2.b)
    console.warn(`[extraction] AI output rejected for document ${document.id}:`, error)
    await prisma.document.update({
      where: { id: document.id },
      data: { status: 'NEEDS_REVIEW', reasoning: 'Extração automática falhou — revisão manual necessária' },
    })
    return { type: document.type, confidence: 0, extractionSource }
  }

  const fields: StructuredFields = {
    supplierName: parsed.supplierName ?? null,
    supplierNif: parsed.supplierNif ?? null,
    buyerNif: parsed.buyerNif ?? null,
    documentNumber: parsed.documentNumber ?? null,
    issueDate: parsed.issueDate ? parsePtDate(parsed.issueDate) : null,
    dueDate: parsed.dueDate ? parsePtDate(parsed.dueDate) : null,
    currency: parsed.currency,
    vatBreakdown: parsed.vatBreakdown ?? null,
    netCents: parsed.netCents ?? null,
    vatCents: parsed.vatCents ?? null,
    withholdingCents: parsed.withholdingCents ?? null,
    totalCents: parsed.totalCents ?? null,
    documentLines: parsed.documentLines ?? null,
    reasoning: parsed.reasoning ?? null,
  }

  return applyStructuredExtraction(document, fields, extractionSource, parsed.confidence, parsed.type)
}

// ── Persistence + invariants ─────────────────────────────────────────────────

function coherenceDeltaCents(fields: StructuredFields): number | null {
  if (fields.totalCents == null || !fields.vatBreakdown || fields.vatBreakdown.length === 0) {
    return null
  }
  const bases = fields.vatBreakdown.reduce((acc, b) => acc + b.baseCents, 0)
  const vats = fields.vatBreakdown.reduce((acc, b) => acc + b.vatCents, 0)
  const withholding = fields.withholdingCents ?? 0
  // Both conventions are coherent: gross total (AT QR field O) OR net-of-withholding
  // total (recibos verdes state the amount actually received)
  const grossDelta = Math.abs(bases + vats - fields.totalCents)
  const netDelta = Math.abs(bases + vats - withholding - fields.totalCents)
  return Math.min(grossDelta, netDelta)
}

async function applyStructuredExtraction(
  document: Document,
  fields: StructuredFields,
  extractionSource: string,
  confidence: number,
  type: DocumentType
): Promise<ExtractionOutcome> {
  const flags = new Set(document.flags)
  // S3.1 state mapping: high confidence + coherent + no flags → PRE_VALIDATED
  let status: 'PRE_VALIDATED' | 'NEEDS_REVIEW' =
    confidence >= CONFIDENCE_CLASSIFIED && flags.size === 0 ? 'PRE_VALIDATED' : 'NEEDS_REVIEW'

  // Arithmetic coherence: Σbases + ΣIVA − retenção = total, tolerance 2 cents (A1)
  const delta = coherenceDeltaCents(fields)
  if (delta !== null && delta > COHERENCE_TOLERANCE_CENTS) {
    flags.add('ARITHMETIC_MISMATCH')
    status = 'NEEDS_REVIEW'
  }

  const normalizedNumber = fields.documentNumber
    ? normalizeDocumentNumber(fields.documentNumber)
    : null

  const data: Prisma.DocumentUpdateInput = {
    type,
    status,
    confidence,
    reasoning: fields.reasoning ?? undefined,
    extractionSource,
    supplierName: fields.supplierName ?? null,
    supplierNif: fields.supplierNif ?? null,
    buyerNif: fields.buyerNif ?? null,
    documentNumber: normalizedNumber,
    documentNumberRaw:
      fields.documentNumber && normalizedNumber !== fields.documentNumber
        ? fields.documentNumber
        : null,
    issueDate: fields.issueDate ?? null,
    dueDate: fields.dueDate ?? null,
    currency: fields.currency ?? 'EUR',
    vatBreakdown: (fields.vatBreakdown ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    documentLines: (fields.documentLines ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    netAmount: fields.netCents != null ? decimalStringFromCents(fields.netCents) : null,
    vatAmount: fields.vatCents != null ? decimalStringFromCents(fields.vatCents) : null,
    withholdingAmount:
      fields.withholdingCents != null ? decimalStringFromCents(fields.withholdingCents) : null,
    totalAmount: fields.totalCents != null ? decimalStringFromCents(fields.totalCents) : null,
    atcud: fields.atcud ?? null,
    flags: Array.from(flags),
    // Legacy display fields kept in sync
    extractedDate: fields.issueDate ?? null,
    extractedAmount: fields.totalCents != null ? fields.totalCents / 100 : null,
    extractedVATNumber: fields.supplierNif ?? null,
    aiModel: extractionSource.startsWith('AI_') ? CLAUDE_MODEL : extractionSource === 'QR' ? 'at-qr-code' : 'xml-ubl',
    classificationSource:
      extractionSource === 'QR' ? 'at-qr-code'
      : extractionSource === 'XML' ? 'xml-ubl'
      : extractionSource === 'AI_VISION' ? 'claude-vision'
      : extractionSource === 'AI_PDF' ? 'claude-pdf'
      : 'claude-text',
  }

  try {
    await prisma.document.update({ where: { id: document.id }, data })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // A8: collision on the partial unique index (authoritative duplicates)
      // — persist as DUPLICATE_SUSPECT, never a 500
      flags.add('DUPLICATE_SUSPECT')
      const winner = await prisma.document.findFirst({
        where: {
          officeId: document.officeId,
          supplierNif: fields.supplierNif ?? undefined,
          documentNumber: normalizedNumber ?? undefined,
          id: { not: document.id },
        },
        select: { id: true },
      })
      await prisma.document.update({
        where: { id: document.id },
        data: {
          ...data,
          status: 'NEEDS_REVIEW',
          flags: Array.from(flags),
          duplicateOfId: winner?.id ?? null,
        },
      })
      return { type, confidence, extractionSource }
    }
    throw error
  }

  await runPostExtractionChecks(document.id)
  return { type, confidence, extractionSource }
}

/**
 * Post-extraction checks (S2.5): duplicate detection, wrong-client detection
 * and buyer-NIF auto-association.
 */
export async function runPostExtractionChecks(documentId: string): Promise<void> {
  const doc = await prisma.document.findUniqueOrThrow({ where: { id: documentId } })
  const flags = new Set(doc.flags)
  const updates: Prisma.DocumentUpdateInput = {}
  let statusToReview = false

  // Duplicates: (supplierNif, documentNumber) OR (supplierNif, issueDate, totalAmount)
  if (!flags.has('DUPLICATE_SUSPECT') && doc.supplierNif) {
    const conditions: Prisma.DocumentWhereInput[] = []
    if (doc.documentNumber) {
      conditions.push({ supplierNif: doc.supplierNif, documentNumber: doc.documentNumber })
    }
    if (doc.issueDate && doc.totalAmount != null) {
      conditions.push({
        supplierNif: doc.supplierNif,
        issueDate: doc.issueDate,
        totalAmount: doc.totalAmount,
      })
    }
    if (conditions.length > 0) {
      const twin = await prisma.document.findFirst({
        where: {
          officeId: doc.officeId,
          id: { not: doc.id },
          status: { not: 'SPLIT' },
          createdAt: { lte: doc.createdAt },
          OR: conditions,
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      })
      if (twin) {
        flags.add('DUPLICATE_SUSPECT')
        updates.duplicateOfId = twin.id
        statusToReview = true
      }
    }
  }

  // Buyer NIF ↔ client checks
  if (doc.buyerNif) {
    const buyerClient = await prisma.client.findFirst({
      where: { officeId: doc.officeId, nif: doc.buyerNif, deletedAt: null },
      select: { id: true },
    })
    if (doc.clientId === null && buyerClient) {
      // Auto-associate (AC-2.1.f)
      updates.client = { connect: { id: buyerClient.id } }
    } else if (doc.clientId && buyerClient && buyerClient.id !== doc.clientId) {
      // Delivered to X's box but addressed to Y (AC-2.4.a)
      flags.add('WRONG_CLIENT_SUSPECT')
      updates.suggestedClientId = buyerClient.id
      statusToReview = true
    } else if (doc.clientId && !buyerClient) {
      const assigned = await prisma.client.findFirst({
        where: { id: doc.clientId, deletedAt: null },
        select: { nif: true },
      })
      if (assigned?.nif && assigned.nif !== doc.buyerNif) {
        flags.add('WRONG_CLIENT_SUSPECT')
        statusToReview = true
      }
    }
  }

  const flagsChanged = flags.size !== doc.flags.length
  if (flagsChanged || Object.keys(updates).length > 0) {
    await prisma.document.update({
      where: { id: doc.id },
      data: {
        ...updates,
        flags: Array.from(flags),
        ...(statusToReview ? { status: 'NEEDS_REVIEW' } : {}),
      },
    })
  }

  // Supplier registry upsert (AC-3.5) + explicit supplier rules (S3.2)
  if (doc.supplierNif) {
    await prisma.supplier.upsert({
      where: { officeId_nif: { officeId: doc.officeId, nif: doc.supplierNif } },
      create: {
        officeId: doc.officeId,
        nif: doc.supplierNif,
        name: doc.supplierName,
        documentCount: 1,
        lastSeenAt: new Date(),
      },
      update: {
        name: doc.supplierName ?? undefined,
        documentCount: { increment: 1 },
        lastSeenAt: new Date(),
      },
    })

    await applySupplierRule(doc.id)
  }
}

/**
 * Applies the most specific active SupplierRule (S3.2): defaults for type,
 * account and VAT treatment. With `autoValidate`, confidence ≥ 0.85 and NO
 * flags, the document goes straight to VALIDATED with an audit entry — a
 * flagged document (duplicate, DMARC, arithmetic) NEVER skips the queue.
 */
async function applySupplierRule(documentId: string): Promise<void> {
  const { findRuleForSupplier } = await import('./supplier-rule-service')
  const doc = await prisma.document.findUniqueOrThrow({ where: { id: documentId } })
  if (!doc.supplierNif) return

  const rule = await findRuleForSupplier(doc.officeId, doc.supplierNif, doc.clientId)
  if (!rule) return

  const canAutoValidate =
    rule.autoValidate &&
    (doc.confidence ?? 0) >= CONFIDENCE_CLASSIFIED &&
    doc.flags.length === 0 &&
    doc.status === 'PRE_VALIDATED'

  await prisma.document.update({
    where: { id: doc.id },
    data: {
      ...(rule.defaultDocumentType ? { type: rule.defaultDocumentType } : {}),
      ...(rule.defaultAccountCode
        ? { accountCode: rule.defaultAccountCode, sncSource: 'RULE' }
        : {}),
      ...(rule.defaultVatTreatment ? { vatTreatment: rule.defaultVatTreatment } : {}),
      appliedRuleId: rule.id,
      ...(canAutoValidate ? { status: 'VALIDATED', version: { increment: 1 } } : {}),
    },
  })

  if (canAutoValidate) {
    await prisma.auditLog.create({
      data: {
        officeId: doc.officeId,
        action: 'AUTO_VALIDATED_BY_RULE',
        entityType: 'Document',
        entityId: doc.id,
        metadata: { ruleId: rule.id, supplierNif: doc.supplierNif },
      },
    })
  }
}
