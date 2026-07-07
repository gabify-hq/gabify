import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { guard } from '@/server/authz/guard'
import {
  getConnectionForClient,
  saveConnection,
  disableConnection,
} from '@/server/toconline/toconline-connection-service'

/**
 * TOConline connection of a client (integration v1 — doc-driven, NOT tested
 * against the real API; INTEGRATION_NOTES.md). The DTO never carries secrets;
 * the client secret enters through PUT and is encrypted before persistence.
 * Cross-tenant access is always 404.
 */

async function resolveClient(clientId: string, officeId: string) {
  return prisma.client.findFirst({
    where: { id: clientId, officeId, deletedAt: null },
    select: { id: true },
  })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const gate = await guard('toconline:read')
  if (!gate.ok) return gate.response
  const { clientId } = await params

  const client = await resolveClient(clientId, gate.user.officeId)
  if (!client) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const connection = await getConnectionForClient(gate.user.officeId, clientId)
  return NextResponse.json({ success: true, data: { connection } })
}

const putSchema = z.object({
  oauthUrl: z.string().url().max(500),
  apiUrl: z.string().url().max(500),
  oauthClientId: z.string().min(1).max(200),
  oauthClientSecret: z.string().min(1).max(500),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const gate = await guard('toconline:manage')
  if (!gate.ok) return gate.response
  const { clientId } = await params

  const client = await resolveClient(clientId, gate.user.officeId)
  if (!client) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  const parsed = putSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Dados inválidos',
        details: Object.fromEntries(
          parsed.error.issues.map((i) => [i.path.join('.') || 'body', i.message]),
        ),
      },
      { status: 422 },
    )
  }

  const dto = await saveConnection({
    officeId: gate.user.officeId,
    clientId,
    oauthUrl: parsed.data.oauthUrl,
    apiUrl: parsed.data.apiUrl,
    oauthClientId: parsed.data.oauthClientId,
    oauthClientSecret: parsed.data.oauthClientSecret,
    userId: gate.user.id,
  })
  return NextResponse.json({ success: true, data: dto })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const gate = await guard('toconline:manage')
  if (!gate.ok) return gate.response
  const { clientId } = await params

  const client = await resolveClient(clientId, gate.user.officeId)
  if (!client) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const dto = await disableConnection({
    officeId: gate.user.officeId,
    clientId,
    userId: gate.user.id,
  })
  if (!dto) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ success: true, data: dto })
}
