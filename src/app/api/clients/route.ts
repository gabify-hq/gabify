import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { guard } from '@/server/authz/guard'

const createClientSchema = z.object({
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

export async function POST(request: NextRequest) {
  const gate = await guard('client:create', { denyStatus: 403 })
  if (!gate.ok) return gate.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }

  const parsed = createClientSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  }

  const { name, nif, email, emailDomains, knownEmails, notes } = parsed.data

  const client = await prisma.client.create({
    data: {
      officeId: gate.user.officeId,
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
      createdAt: true,
    },
  })

  return NextResponse.json({ success: true, data: client }, { status: 201 })
}

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200

export async function GET(request: NextRequest) {
  const gate = await guard('client:read')
  if (!gate.ok) return gate.response

  const params = request.nextUrl.searchParams
  const requested = Number(params.get('limit')) || DEFAULT_PAGE_SIZE
  const take = Math.min(Math.max(requested, 1), MAX_PAGE_SIZE)
  const cursor = params.get('cursor')

  const clients = await prisma.client.findMany({
    where: { officeId: gate.user.officeId, deletedAt: null },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      name: true,
      nif: true,
      email: true,
      emailDomains: true,
      knownEmails: true,
      createdAt: true,
    },
  })

  const hasMore = clients.length > take
  const items = hasMore ? clients.slice(0, take) : clients
  return NextResponse.json({
    success: true,
    data: { items, nextCursor: hasMore ? items[items.length - 1].id : null },
  })
}
