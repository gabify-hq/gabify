import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { guard } from '@/server/authz/guard'
import { setConnectionDryRun } from '@/server/toconline/toconline-connection-service'

/**
 * Dry-run toggle for a client's TOConline connection. Connections are BORN in
 * dry-run [INV]; disabling it means real documents get created in TOConline —
 * an integration NEVER tested against the real API — so going live requires
 * `toconline:goLive` (OWNER-only) and is audited. Re-enabling dry-run (the
 * safe direction) only requires `toconline:manage`.
 */

const bodySchema = z.object({ dryRun: z.boolean() })

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 422 })
  }

  // Action derived BEFORE touching any resource: permission failures must not
  // leak whether the client/connection exists
  const gate = await guard(parsed.data.dryRun ? 'toconline:manage' : 'toconline:goLive')
  if (!gate.ok) return gate.response
  const { clientId } = await params

  const client = await prisma.client.findFirst({
    where: { id: clientId, officeId: gate.user.officeId, deletedAt: null },
    select: { id: true },
  })
  if (!client) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const dto = await setConnectionDryRun({
    officeId: gate.user.officeId,
    clientId,
    dryRun: parsed.data.dryRun,
    userId: gate.user.id,
  })
  if (!dto) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ success: true, data: dto })
}
