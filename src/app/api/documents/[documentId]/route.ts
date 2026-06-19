import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getSignedDownloadUrl } from '@/lib/r2'

interface RouteParams {
  params: Promise<{ documentId: string }>
}

/**
 * GET /api/documents/:documentId/download
 * Returns a short-lived signed R2 URL for previewing/downloading the document.
 * Scoped to the authenticated user's office.
 * URL expires in 15 minutes.
 */
export async function GET(_req: Request, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user?.officeId) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { documentId } = await params

  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      attachment: {
        inboundEmail: {
          emailAccount: { officeId: session.user.officeId },
        },
      },
    },
    select: {
      id: true,
      r2Key: true,
      attachment: { select: { filename: true, mimeType: true } },
    },
  })

  if (!document) {
    return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 })
  }

  if (!document.r2Key) {
    return NextResponse.json({ error: 'Ficheiro ainda não processado' }, { status: 404 })
  }

  const url = await getSignedDownloadUrl(document.r2Key, 900)

  return NextResponse.json({
    success: true,
    data: {
      url,
      filename: document.attachment?.filename ?? documentId,
      mimeType: document.attachment?.mimeType ?? 'application/octet-stream',
    },
  })
}
