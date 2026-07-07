import { prisma } from '@/lib/prisma'

export type AssignClientResult =
  | { ok: true }
  | { ok: false; reason: 'DOCUMENT_NOT_FOUND' | 'CLIENT_NOT_FOUND' }

/**
 * Assigns a client to a document with strict office scoping (AC-1.4.e):
 * both the document and the client must belong to `officeId`, otherwise the
 * write is refused. This is the ONLY sanctioned way to change Document.clientId
 * outside the parse pipeline.
 */
export async function assignClientToDocument(params: {
  documentId: string
  clientId: string
  officeId: string
}): Promise<AssignClientResult> {
  const document = await prisma.document.findFirst({
    where: {
      id: params.documentId,
      attachment: {
        inboundEmail: { emailAccount: { officeId: params.officeId } },
      },
    },
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
