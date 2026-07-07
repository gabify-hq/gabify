import { prisma } from '@/lib/prisma'
import type { Document, DocumentSource, DocumentStatus } from '@prisma/client'

/**
 * Portal do cliente final (fase P2) — read model with MANDATORY masking.
 *
 * External users (role CLIENT) only ever see this DTO. Internal statuses, AI
 * confidence, duplicate/wrong-client flags, SNC accounts and rules NEVER leave
 * the office boundary. The DTO is built field by field — never by spreading a
 * Document row — so future schema fields cannot leak by accident.
 *
 * Public status codes are English (house rule; UI renders pt-PT labels):
 *   PROCESSING → "Em processamento"  (any internal pre-validation state/flag)
 *   PROCESSED  → "Processado"        (VALIDATED | EXPORTED)
 *   RETURNED   → "Devolvido"         (rejected — soft-deleted by review)
 */

export type PortalDocumentStatus = 'PROCESSING' | 'PROCESSED' | 'RETURNED'
export type PortalDocumentOrigin = 'UPLOAD' | 'EMAIL'

export interface PortalDocumentDTO {
  id: string
  filename: string
  submittedAt: string // ISO
  origin: PortalDocumentOrigin
  status: PortalDocumentStatus
}

const PROCESSED_STATUSES: DocumentStatus[] = ['VALIDATED', 'EXPORTED']

export function toPublicStatus(doc: Pick<Document, 'status' | 'deletedAt'>): PortalDocumentStatus {
  // Rejection is a review soft-delete (S3.1) — surfaces to the client as
  // "returned", never as silence
  if (doc.deletedAt) return 'RETURNED'
  if (PROCESSED_STATUSES.includes(doc.status)) return 'PROCESSED'
  // Everything else (A_REVER/PRE_VALIDATED/duplicate/wrong-client/pending…) is
  // masked as "in processing" — deny-by-default for any future status too
  return 'PROCESSING'
}

export function toPublicOrigin(source: DocumentSource): PortalDocumentOrigin {
  return source === 'EMAIL' ? 'EMAIL' : 'UPLOAD'
}

interface PortalDocumentRow {
  id: string
  status: DocumentStatus
  deletedAt: Date | null
  source: DocumentSource
  createdAt: Date
  originalFilename: string | null
  attachment: { filename: string } | null
}

/** Field-by-field DTO construction — the only sanctioned portal serializer. */
export function toPortalDocumentDTO(doc: PortalDocumentRow): PortalDocumentDTO {
  return {
    id: doc.id,
    filename: doc.originalFilename ?? doc.attachment?.filename ?? 'documento',
    submittedAt: doc.createdAt.toISOString(),
    origin: toPublicOrigin(doc.source),
    status: toPublicStatus(doc),
  }
}

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200

export interface PortalDocumentsPage {
  items: PortalDocumentDTO[]
  nextCursor: string | null
  total: number
}

/**
 * Lists the documents of ONE end-client — the caller's clientId is forced by
 * the route (never read from input). Includes review-rejected documents
 * (RETURNED) so the client knows to resubmit; excludes SPLIT parents (internal
 * artifact — the child invoices appear individually).
 */
export async function listPortalDocuments(params: {
  officeId: string
  clientId: string
  q?: string | null
  limit?: number | null
  cursor?: string | null
}): Promise<PortalDocumentsPage> {
  const take = Math.min(Math.max(Number(params.limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)

  const where = {
    officeId: params.officeId,
    clientId: params.clientId,
    status: { not: 'SPLIT' as DocumentStatus },
    ...(params.q
      ? { originalFilename: { contains: params.q, mode: 'insensitive' as const } }
      : {}),
  }

  const [total, rows] = await Promise.all([
    prisma.document.count({ where }),
    prisma.document.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        status: true,
        deletedAt: true,
        source: true,
        createdAt: true,
        originalFilename: true,
        attachment: { select: { filename: true } },
      },
    }),
  ])

  const hasMore = rows.length > take
  const page = hasMore ? rows.slice(0, take) : rows
  return {
    items: page.map(toPortalDocumentDTO),
    nextCursor: hasMore ? page[page.length - 1].id : null,
    total,
  }
}
