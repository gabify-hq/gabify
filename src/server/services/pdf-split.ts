import { PDFDocument } from 'pdf-lib'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { anthropic, CLAUDE_MODEL } from '@/lib/anthropic'
import { uploadToR2 } from '@/lib/r2'
import { extractQRCodeFromPDF } from '@/lib/qr-reader'
import { parseATFiscalQR } from '@/lib/at-fiscal-qr'
import { getDocumentParseQueue, DEFAULT_JOB_OPTIONS } from '@/lib/redis'
import { sha256 } from './upload-service'
import type { Document } from '@prisma/client'

/**
 * Multi-invoice PDF split (S2.2 + A6).
 * Deterministic first (distinct AT QRs per page — zero AI cost), Claude
 * boundary detection as fallback with a hard 50-page cap and a sha256 cache.
 */

export const AUTOSPLIT_MAX_PAGES_FOR_AI = 50
const AI_SPLIT_MIN_CONFIDENCE = 0.8

interface Boundary {
  startPage: number
  endPage: number
}

interface SplitDecision {
  action: 'split' | 'none' | 'too-large' | 'low-confidence'
  boundaries: Boundary[]
  method: 'qr-deterministic' | 'ai' | 'cache' | 'none'
  confidence?: number
}

const AI_BOUNDARIES_SCHEMA = z.object({
  confidence: z.number().min(0).max(1),
  invoices: z.array(z.object({ startPage: z.number().int().min(1), endPage: z.number().int().min(1) })),
})

async function extractPageQrPayloads(buffer: Buffer, pageCount: number): Promise<Array<string | null>> {
  const source = await PDFDocument.load(buffer)
  const payloads: Array<string | null> = []
  for (let i = 0; i < pageCount; i++) {
    const single = await PDFDocument.create()
    const [page] = await single.copyPages(source, [i])
    single.addPage(page)
    const pageBuffer = Buffer.from(await single.save())
    const qr = await extractQRCodeFromPDF(pageBuffer)
    payloads.push(qr && parseATFiscalQR(qr) ? qr : null)
  }
  return payloads
}

function boundariesFromQrPages(payloads: Array<string | null>): Boundary[] {
  const boundaries: Boundary[] = []
  let current: Boundary | null = null
  for (let i = 0; i < payloads.length; i++) {
    const page = i + 1
    if (payloads[i] !== null) {
      if (current) boundaries.push(current)
      current = { startPage: page, endPage: page }
    } else if (current) {
      current.endPage = page
    } else {
      current = { startPage: page, endPage: page }
    }
  }
  if (current) boundaries.push(current)
  return boundaries
}

async function detectBoundariesWithAi(pageCount: number, textSample: string): Promise<{ confidence: number; boundaries: Boundary[] } | null> {
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `Um PDF de ${pageCount} páginas pode conter várias faturas. Analisa o texto e devolve APENAS JSON: {"confidence":0.0-1.0,"invoices":[{"startPage":1,"endPage":2}]}. Se for um documento único, devolve um só intervalo.\n\nTexto:\n${textSample.slice(0, 20_000)}`,
        },
      ],
    })
    const raw = (response.content[0] as { text: string }).text
    const parsed = AI_BOUNDARIES_SCHEMA.parse(JSON.parse(raw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '')))
    return { confidence: parsed.confidence, boundaries: parsed.invoices }
  } catch (error) {
    console.warn('[pdf-split] AI boundary detection failed:', error)
    return null
  }
}

/**
 * Decides whether/how to split. Consults the sha256 cache first (A6) so the
 * same binary never triggers repeated AI calls.
 */
export async function decideSplit(params: {
  document: Document
  buffer: Buffer
  pageCount: number
}): Promise<SplitDecision> {
  const { document, buffer, pageCount } = params
  if (pageCount <= 1) return { action: 'none', boundaries: [], method: 'none' }

  const hash = document.contentSha256 ?? sha256(buffer)

  const cached = await prisma.documentSplitCache.findUnique({
    where: { officeId_sha256: { officeId: document.officeId, sha256: hash } },
  })
  if (cached) {
    const stored = cached.boundaries as unknown as { confidence?: number; invoices: Boundary[] }
    const splittable =
      stored.invoices.length > 1 &&
      (cached.method === 'qr-deterministic' || (stored.confidence ?? 0) >= AI_SPLIT_MIN_CONFIDENCE)
    return {
      action: splittable ? 'split' : 'low-confidence',
      boundaries: stored.invoices,
      method: 'cache',
      confidence: stored.confidence,
    }
  }

  // Deterministic: distinct AT QRs per page (zero cost, no page cap)
  const payloads = await extractPageQrPayloads(buffer, pageCount)
  const distinctQrs = new Set(payloads.filter((p): p is string => p !== null))
  if (distinctQrs.size >= 2) {
    const boundaries = boundariesFromQrPages(payloads)
    await prisma.documentSplitCache.create({
      data: {
        officeId: document.officeId,
        sha256: hash,
        boundaries: { invoices: boundaries } as unknown as object,
        method: 'qr-deterministic',
      },
    })
    return { action: 'split', boundaries, method: 'qr-deterministic' }
  }
  if (distinctQrs.size === 1) {
    return { action: 'none', boundaries: [], method: 'qr-deterministic' }
  }

  // AI fallback — hard page cap (A6: a 500-page PDF would cost real money)
  if (pageCount > AUTOSPLIT_MAX_PAGES_FOR_AI) {
    return { action: 'too-large', boundaries: [], method: 'none' }
  }

  const ai = await detectBoundariesWithAi(pageCount, document.textContent ?? '')
  if (!ai) return { action: 'none', boundaries: [], method: 'ai' }

  await prisma.documentSplitCache.create({
    data: {
      officeId: document.officeId,
      sha256: hash,
      boundaries: { confidence: ai.confidence, invoices: ai.boundaries } as unknown as object,
      method: 'ai',
    },
  })

  if (ai.confidence >= AI_SPLIT_MIN_CONFIDENCE && ai.boundaries.length > 1) {
    return { action: 'split', boundaries: ai.boundaries, method: 'ai', confidence: ai.confidence }
  }
  return { action: 'low-confidence', boundaries: ai.boundaries, method: 'ai', confidence: ai.confidence }
}

/**
 * Executes the split: N child documents with sliced PDFs in R2, parent → SPLIT,
 * one parse job per child.
 */
export async function executeSplit(params: {
  document: Document
  buffer: Buffer
  boundaries: Boundary[]
}): Promise<string[]> {
  const { document, buffer, boundaries } = params
  const source = await PDFDocument.load(buffer)
  const queue = getDocumentParseQueue()
  const childIds: string[] = []

  for (const boundary of boundaries) {
    const child = await PDFDocument.create()
    const indices = Array.from(
      { length: boundary.endPage - boundary.startPage + 1 },
      (_, i) => boundary.startPage - 1 + i
    )
    const pages = await child.copyPages(source, indices)
    for (const page of pages) child.addPage(page)
    const childBuffer = Buffer.from(await child.save())

    const childDoc = await prisma.document.create({
      data: {
        officeId: document.officeId,
        source: document.source,
        clientId: document.clientId,
        status: 'PENDING_CLASSIFICATION',
        parentDocumentId: document.id,
        pageStart: boundary.startPage,
        pageEnd: boundary.endPage,
        originalFilename: `${document.originalFilename ?? document.id}-p${boundary.startPage}-${boundary.endPage}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: childBuffer.length,
        contentSha256: sha256(childBuffer),
        uploadedByUserId: document.uploadedByUserId,
      },
    })

    const r2Key = `${document.officeId}/splits/${document.id}/${childDoc.id}.pdf`
    await uploadToR2(r2Key, childBuffer, 'application/pdf')
    await prisma.document.update({ where: { id: childDoc.id }, data: { r2Key } })

    await queue.add(
      'parse-document',
      { documentId: childDoc.id, officeId: document.officeId },
      DEFAULT_JOB_OPTIONS
    )
    childIds.push(childDoc.id)
  }

  await prisma.document.update({
    where: { id: document.id },
    data: { status: 'SPLIT' },
  })

  return childIds
}
