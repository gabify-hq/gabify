import { prisma } from '@/lib/prisma'
import { DOCUMENT_TYPE_LABELS, DOCUMENT_SOURCE_LABELS } from '@/lib/document-types'
import type { Document, DocumentSource, DocumentStatus, DocumentType } from '@prisma/client'

export type AssignClientResult =
  | { ok: true }
  | { ok: false; reason: 'DOCUMENT_NOT_FOUND' | 'CLIENT_NOT_FOUND' }

/**
 * Assigns a client to a document with strict office scoping (AC-1.4.e):
 * both the document and the client must belong to `officeId`, otherwise the
 * write is refused. Scoped by Document.officeId directly (audit F1.2) — the
 * legacy attachment→inboundEmail path excluded every non-email source.
 */
export async function assignClientToDocument(params: {
  documentId: string
  clientId: string
  officeId: string
}): Promise<AssignClientResult> {
  const document = await prisma.document.findFirst({
    where: { id: params.documentId, officeId: params.officeId, deletedAt: null },
    select: { id: true },
  })
  if (!document) return { ok: false, reason: 'DOCUMENT_NOT_FOUND' }

  const client = await prisma.client.findFirst({
    where: { id: params.clientId, officeId: params.officeId, deletedAt: null },
    select: { id: true },
  })
  if (!client) return { ok: false, reason: 'CLIENT_NOT_FOUND' }

  await prisma.document.update({
    where: { id: document.id },
    data: { clientId: client.id },
  })
  return { ok: true }
}

// ── Office/client document listings (audit F1.2 — C-2) ───────────────────────
// Every intake source (EMAIL, MANUAL_UPLOAD, IMPORT, PORTAL_UPLOAD, API_PULL)
// appears here; scoping is Document.officeId, never the attachment chain.

export interface DocumentListRow {
  id: string
  clientId: string | null
  clientName: string | null
  filename: string
  type: DocumentType
  typeLabel: string
  status: DocumentStatus
  source: DocumentSource
  sourceLabel: string
  confidence: number
  extractedDate: Date | null
  extractedAmount: number | null
  extractedVATNumber: string | null
  classificationSource: string | null
  r2Key: string | null
  createdAt: Date
}

const LIST_SELECT = {
  id: true,
  clientId: true,
  client: { select: { name: true } },
  originalFilename: true,
  type: true,
  status: true,
  source: true,
  confidence: true,
  extractedDate: true,
  extractedAmount: true,
  extractedVATNumber: true,
  classificationSource: true,
  r2Key: true,
  createdAt: true,
  attachment: { select: { filename: true } },
} as const

type ListRowSource = {
  id: string
  clientId: string | null
  client: { name: string } | null
  originalFilename: string | null
  type: DocumentType
  status: DocumentStatus
  source: DocumentSource
  confidence: number | null
  extractedDate: Date | null
  extractedAmount: number | null
  extractedVATNumber: string | null
  classificationSource: string | null
  r2Key: string | null
  createdAt: Date
  attachment: { filename: string } | null
}

function toListRow(doc: ListRowSource): DocumentListRow {
  return {
    id: doc.id,
    clientId: doc.clientId,
    clientName: doc.client?.name ?? null,
    filename: doc.originalFilename ?? doc.attachment?.filename ?? doc.id,
    type: doc.type,
    typeLabel: DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type,
    status: doc.status,
    source: doc.source,
    sourceLabel: DOCUMENT_SOURCE_LABELS[doc.source] ?? doc.source,
    confidence: doc.confidence ?? 0,
    extractedDate: doc.extractedDate,
    extractedAmount: doc.extractedAmount,
    extractedVATNumber: doc.extractedVATNumber,
    classificationSource: doc.classificationSource,
    r2Key: doc.r2Key,
    createdAt: doc.createdAt,
  }
}

/** All non-deleted documents of the office, newest first — every source. */
export async function listOfficeDocuments(
  officeId: string,
  options: { limit?: number } = {},
): Promise<DocumentListRow[]> {
  const docs = await prisma.document.findMany({
    where: { officeId, deletedAt: null, status: { not: 'SPLIT' } },
    orderBy: { createdAt: 'desc' },
    take: options.limit ?? 200,
    select: LIST_SELECT,
  })
  return docs.map(toListRow)
}

/** All non-deleted documents of one client (office-scoped) — every source. */
export async function listClientDocuments(
  officeId: string,
  clientId: string,
  options: { limit?: number } = {},
): Promise<DocumentListRow[]> {
  const docs = await prisma.document.findMany({
    where: { officeId, clientId, deletedAt: null, status: { not: 'SPLIT' } },
    orderBy: { createdAt: 'desc' },
    take: options.limit ?? 500,
    select: LIST_SELECT,
  })
  return docs.map(toListRow)
}

export type { Document }
