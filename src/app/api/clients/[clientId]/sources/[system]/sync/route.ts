import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { guard } from '@/server/authz/guard'
import {
  getMoloniPullQueue,
  getInvoicexpressPullQueue,
  DEFAULT_JOB_OPTIONS,
} from '@/lib/redis'

/**
 * "Sincronizar agora" — queue an immediate source pull for the client's Moloni
 * or InvoiceXpress connection (the repeatable scan covers the periodic case).
 * Requires source:manage + pullEnabled; cross-tenant is always 404.
 */

type System = 'moloni' | 'invoicexpress'

function parseSystem(raw: string): System | null {
  return raw === 'moloni' || raw === 'invoicexpress' ? raw : null
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string; system: string }> },
) {
  const gate = await guard('source:manage')
  if (!gate.ok) return gate.response
  const { clientId, system: rawSystem } = await params
  const system = parseSystem(rawSystem)
  if (!system) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const client = await prisma.client.findFirst({
    where: { id: clientId, officeId: gate.user.officeId, deletedAt: null },
    select: { id: true },
  })
  if (!client) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const connection =
    system === 'moloni'
      ? await prisma.moloniConnection.findFirst({
          where: { officeId: gate.user.officeId, clientId, deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: { id: true, status: true, pullEnabled: true },
        })
      : await prisma.invoicexpressConnection.findFirst({
          where: { officeId: gate.user.officeId, clientId, deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: { id: true, status: true, pullEnabled: true },
        })

  const label = system === 'moloni' ? 'Moloni' : 'InvoiceXpress'
  if (!connection) {
    return NextResponse.json(
      { error: `O cliente não tem ligação ${label} configurada` },
      { status: 422 },
    )
  }
  if (connection.status === 'DESLIGADA') {
    return NextResponse.json({ error: `A ligação ${label} está desligada` }, { status: 422 })
  }
  if (!connection.pullEnabled) {
    return NextResponse.json(
      { error: 'A importação de faturas está desligada — ative-a primeiro' },
      { status: 422 },
    )
  }

  const jobData = { connectionId: connection.id, officeId: gate.user.officeId, userId: gate.user.id }
  if (system === 'moloni') {
    await getMoloniPullQueue().add('moloni-pull', jobData, DEFAULT_JOB_OPTIONS)
  } else {
    await getInvoicexpressPullQueue().add('invoicexpress-pull', jobData, DEFAULT_JOB_OPTIONS)
  }
  return NextResponse.json({ success: true, data: { queued: true } })
}
