import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSignedDownloadUrl } from '@/lib/r2'
import { guard } from '@/server/authz/guard'

interface RouteParams {
  params: Promise<{ documentId: string }>
}

/** Signed URL TTL for portal previews — 5 minutes (fase P2), never the internal 15. */
const PORTAL_SIGNED_URL_TTL_SECONDS = 300

/**
 * GET /api/portal/documents/:documentId/download — end-client preview (P2).
 * Only documents of the session user's own clientId; anything else is 404.
 */
export async function GET(_req: Request, { params }: RouteParams) {
  const gate = await guard('portal:document:read')
  if (!gate.ok) return gate.response

  if (!gate.user.clientId) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  }

  const { documentId } = await params
  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      officeId: gate.user.officeId,
      clientId: gate.user.clientId,
    },
    select: {
      id: true,
      r2Key: true,
      originalFilename: true,
      mimeType: true,
      attachment: { select: { filename: true, mimeType: true } },
    },
  })

  if (!document?.r2Key) {
    return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 })
  }

  const url = await getSignedDownloadUrl(document.r2Key, PORTAL_SIGNED_URL_TTL_SECONDS)

  return NextResponse.json({
    success: true,
    data: {
      url,
      filename: document.originalFilename ?? document.attachment?.filename ?? 'documento',
      mimeType: document.mimeType ?? document.attachment?.mimeType ?? 'application/octet-stream',
    },
  })
}
