import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { guard } from '@/server/authz/guard'
import { getToconlinePullQueue, DEFAULT_JOB_OPTIONS } from '@/lib/redis'

/**
 * "Sincronizar agora" — queue an immediate sales pull for the client's
 * TOConline connection (the repeatable scan covers the periodic case).
 * Requires pullEnabled; cross-tenant is always 404.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const gate = await guard('toconline:manage')
  if (!gate.ok) return gate.response
  const { clientId } = await params

  const client = await prisma.client.findFirst({
    where: { id: clientId, officeId: gate.user.officeId, deletedAt: null },
    select: { id: true },
  })
  if (!client) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const connection = await prisma.toconlineConnection.findFirst({
    where: { officeId: gate.user.officeId, clientId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, status: true, pullEnabled: true, dryRun: true },
  })
  if (!connection) {
    return NextResponse.json(
      { error: 'O cliente não tem ligação TOConline configurada' },
      { status: 422 },
    )
  }
  if (connection.status === 'DISABLED') {
    return NextResponse.json({ error: 'A ligação TOConline está desligada' }, { status: 422 })
  }
  if (!connection.pullEnabled) {
    return NextResponse.json(
      { error: 'A importação de faturas emitidas está desligada — ative-a primeiro' },
      { status: 422 },
    )
  }

  await getToconlinePullQueue().add(
    'toconline-pull',
    { connectionId: connection.id, officeId: gate.user.officeId, userId: gate.user.id },
    DEFAULT_JOB_OPTIONS,
  )
  return NextResponse.json({ success: true, data: { queued: true, dryRun: connection.dryRun } })
}
