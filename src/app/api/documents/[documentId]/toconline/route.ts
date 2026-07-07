import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { guard } from '@/server/authz/guard'

/**
 * TOConline push state of a document + dry-run previews ("o que seria
 * enviado"). Previews already carry redacted headers (written that way by the
 * push service); secrets never reach this surface. Cross-tenant → 404.
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const gate = await guard('toconline:read')
  if (!gate.ok) return gate.response
  const { documentId } = await params

  const doc = await prisma.document.findFirst({
    where: { id: documentId, officeId: gate.user.officeId, deletedAt: null },
    select: {
      id: true,
      toconlinePushStatus: true,
      toconlineDocumentId: true,
      toconlinePushedAt: true,
      toconlinePushError: true,
    },
  })
  if (!doc) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const previews = await prisma.toconlinePushPreview.findMany({
    where: { documentId: doc.id, connection: { officeId: gate.user.officeId } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      endpoint: true,
      method: true,
      headers: true,
      body: true,
      createdAt: true,
    },
  })

  return NextResponse.json({
    success: true,
    data: {
      pushStatus: doc.toconlinePushStatus,
      toconlineDocumentId: doc.toconlineDocumentId,
      pushedAt: doc.toconlinePushedAt?.toISOString() ?? null,
      pushError: doc.toconlinePushError,
      previews: previews.map((p) => ({
        id: p.id,
        endpoint: p.endpoint,
        method: p.method,
        headers: p.headers,
        body: p.body,
        createdAt: p.createdAt.toISOString(),
      })),
    },
  })
}
