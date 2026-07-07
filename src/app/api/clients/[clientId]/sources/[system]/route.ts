import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { guard } from '@/server/authz/guard'
import {
  getMoloniConnection,
  saveMoloniConnection,
  setMoloniPullEnabled,
  disableMoloniConnection,
} from '@/server/sources/moloni/moloni-connection-service'
import {
  getInvoicexpressConnection,
  saveInvoicexpressConnection,
  setInvoicexpressPullEnabled,
  disableInvoicexpressConnection,
} from '@/server/sources/invoicexpress/invoicexpress-connection-service'
import type { SourceConnectionDTO } from '@/server/sources/source-connection-dto'

/**
 * Source connections (Moloni / InvoiceXpress) of a client — SOURCE-only (pull
 * issued invoices). The DTO never carries secrets; credentials enter through
 * PUT and are encrypted before persistence. RBAC mirrors the TOConline pattern
 * (source:read to view, source:manage to change). Cross-tenant is always 404.
 */

type System = 'moloni' | 'invoicexpress'

function parseSystem(raw: string): System | null {
  return raw === 'moloni' || raw === 'invoicexpress' ? raw : null
}

async function resolveClient(clientId: string, officeId: string) {
  return prisma.client.findFirst({
    where: { id: clientId, officeId, deletedAt: null },
    select: { id: true },
  })
}

const moloniCredentialsSchema = z.object({
  companyId: z.number().int().positive(),
  companyName: z.string().max(200).optional().default(''),
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(500),
})

const invoicexpressCredentialsSchema = z.object({
  accountName: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/i, 'O nome da conta só pode conter letras, números e hífens'),
  apiKey: z.string().min(1).max(500),
})

const patchSchema = z.object({ pullEnabled: z.boolean() })

async function getConnection(
  system: System,
  officeId: string,
  clientId: string,
): Promise<SourceConnectionDTO | null> {
  return system === 'moloni'
    ? getMoloniConnection(officeId, clientId)
    : getInvoicexpressConnection(officeId, clientId)
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string; system: string }> },
) {
  const gate = await guard('source:read')
  if (!gate.ok) return gate.response
  const { clientId, system: rawSystem } = await params
  const system = parseSystem(rawSystem)
  if (!system) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const client = await resolveClient(clientId, gate.user.officeId)
  if (!client) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const connection = await getConnection(system, gate.user.officeId, clientId)
  return NextResponse.json({ success: true, data: { connection } })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; system: string }> },
) {
  const gate = await guard('source:manage')
  if (!gate.ok) return gate.response
  const { clientId, system: rawSystem } = await params
  const system = parseSystem(rawSystem)
  if (!system) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const client = await resolveClient(clientId, gate.user.officeId)
  if (!client) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }

  if (system === 'moloni') {
    const parsed = moloniCredentialsSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 422 })
    }
    const dto = await saveMoloniConnection({
      officeId: gate.user.officeId,
      clientId,
      companyId: parsed.data.companyId,
      companyName: parsed.data.companyName,
      username: parsed.data.username,
      password: parsed.data.password,
      userId: gate.user.id,
    })
    return NextResponse.json({ success: true, data: dto })
  }

  const parsed = invoicexpressCredentialsSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 422 })
  }
  const dto = await saveInvoicexpressConnection({
    officeId: gate.user.officeId,
    clientId,
    accountName: parsed.data.accountName,
    apiKey: parsed.data.apiKey,
    userId: gate.user.id,
  })
  return NextResponse.json({ success: true, data: dto })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; system: string }> },
) {
  const gate = await guard('source:manage')
  if (!gate.ok) return gate.response
  const { clientId, system: rawSystem } = await params
  const system = parseSystem(rawSystem)
  if (!system) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const client = await resolveClient(clientId, gate.user.officeId)
  if (!client) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 422 })

  const dto =
    system === 'moloni'
      ? await setMoloniPullEnabled({
          officeId: gate.user.officeId,
          clientId,
          pullEnabled: parsed.data.pullEnabled,
          userId: gate.user.id,
        })
      : await setInvoicexpressPullEnabled({
          officeId: gate.user.officeId,
          clientId,
          pullEnabled: parsed.data.pullEnabled,
          userId: gate.user.id,
        })
  if (!dto) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ success: true, data: dto })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string; system: string }> },
) {
  const gate = await guard('source:manage')
  if (!gate.ok) return gate.response
  const { clientId, system: rawSystem } = await params
  const system = parseSystem(rawSystem)
  if (!system) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const client = await resolveClient(clientId, gate.user.officeId)
  if (!client) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const dto =
    system === 'moloni'
      ? await disableMoloniConnection({ officeId: gate.user.officeId, clientId, userId: gate.user.id })
      : await disableInvoicexpressConnection({
          officeId: gate.user.officeId,
          clientId,
          userId: gate.user.id,
        })
  if (!dto) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ success: true, data: dto })
}
