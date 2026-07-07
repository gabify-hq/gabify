import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { guard } from '@/server/authz/guard'
import { createIngestAlias, regenerateIngestAlias } from '@/server/services/ingest-service'

interface RouteContext {
  params: Promise<{ clientId: string }>
}

/** GET — current active ingest address for the client. */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const gate = await guard('client:read')
  if (!gate.ok) return gate.response

  const { clientId } = await params
  const alias = await prisma.clientIngestAlias.findFirst({
    where: { clientId, officeId: gate.user.officeId, active: true },
    select: { alias: true, createdAt: true },
  })
  if (!alias) {
    return NextResponse.json({ success: true, data: null })
  }
  const domain = process.env.INGEST_DOMAIN ?? ''
  return NextResponse.json({
    success: true,
    data: { address: domain ? `${alias.alias}@${domain}` : alias.alias, createdAt: alias.createdAt },
  })
}

/** POST — create or regenerate the ingest address (old one dies). */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const gate = await guard('client:update')
  if (!gate.ok) return gate.response

  const { clientId } = await params
  const client = await prisma.client.findFirst({
    where: { id: clientId, officeId: gate.user.officeId, deletedAt: null },
    select: { id: true },
  })
  if (!client) {
    return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  }

  const existing = await prisma.clientIngestAlias.findFirst({
    where: { clientId, officeId: gate.user.officeId, active: true },
  })
  const alias = existing
    ? await regenerateIngestAlias({ clientId, officeId: gate.user.officeId })
    : await createIngestAlias({ clientId, officeId: gate.user.officeId })

  const domain = process.env.INGEST_DOMAIN ?? ''
  return NextResponse.json({
    success: true,
    data: { address: domain ? `${alias.alias}@${domain}` : alias.alias },
  })
}
