import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getSignedDownloadUrl } from '@/lib/r2'

interface RouteParams {
  params: Promise<{ attachmentId: string }>
}

/**
 * GET /api/attachments/:attachmentId
 * Returns a short-lived signed R2 URL for downloading the attachment.
 * Scoped to the authenticated user's office — cross-office access returns 404.
 * URL expires in 15 minutes (preview use only).
 */
export async function GET(_req: Request, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user?.officeId) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { attachmentId } = await params

  const attachment = await prisma.emailAttachment.findFirst({
    where: {
      id: attachmentId,
      inboundEmail: {
        emailAccount: { officeId: session.user.officeId },
      },
    },
    select: { id: true, r2Key: true, filename: true, mimeType: true },
  })

  if (!attachment) {
    return NextResponse.json({ error: 'Anexo não encontrado' }, { status: 404 })
  }

  if (!attachment.r2Key) {
    return NextResponse.json({ error: 'Ficheiro ainda não processado' }, { status: 404 })
  }

  // 15 min expiry — short-lived preview URL
  const url = await getSignedDownloadUrl(attachment.r2Key, 900)

  return NextResponse.json({
    success: true,
    data: { url, filename: attachment.filename, mimeType: attachment.mimeType },
  })
}
