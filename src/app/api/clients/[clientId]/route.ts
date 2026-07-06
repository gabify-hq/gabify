import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { guard } from '@/server/authz/guard'

const updateClientSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório (mínimo 2 caracteres)'),
  nif: z
    .string()
    .regex(/^\d{9}$/, 'NIF deve ter 9 dígitos')
    .optional()
    .or(z.literal('')),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  emailDomains: z.array(z.string().min(1)).default([]),
  knownEmails: z.array(z.string().email('Email inválido')).default([]),
  notes: z.string().optional(),
})

interface RouteContext {
  params: Promise<{ clientId: string }>
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const gate = await guard('client:read')
  if (!gate.ok) return gate.response

  const { clientId } = await params

  const client = await prisma.client.findFirst({
    where: { id: clientId, officeId: gate.user.officeId, deletedAt: null },
    select: {
      id: true,
      name: true,
      nif: true,
      email: true,
      emailDomains: true,
      knownEmails: true,
      notes: true,
      createdAt: true,
    },
  })

  if (!client) {
    return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  }

  return NextResponse.json({ success: true, data: client })
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const gate = await guard('client:update')
  if (!gate.ok) return gate.response

  const { clientId } = await params

  const existing = await prisma.client.findFirst({
    where: { id: clientId, officeId: gate.user.officeId, deletedAt: null },
    select: { id: true },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }

  const parsed = updateClientSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  }

  const { name, nif, email, emailDomains, knownEmails, notes } = parsed.data

  const updated = await prisma.client.update({
    where: { id: clientId },
    data: {
      name,
      nif: nif || null,
      email: email || null,
      emailDomains,
      knownEmails,
      notes: notes || null,
    },
    select: {
      id: true,
      name: true,
      nif: true,
      email: true,
      emailDomains: true,
      knownEmails: true,
      notes: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ success: true, data: updated })
}
