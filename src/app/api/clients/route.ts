import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
  const session = await auth()
  if (!session?.user?.officeId) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

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
      officeId: session.user.officeId,
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

export async function GET() {
  const session = await auth()
  if (!session?.user?.officeId) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const clients = await prisma.client.findMany({
    where: { officeId: session.user.officeId, deletedAt: null },
    orderBy: { name: 'asc' },
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

  return NextResponse.json({ success: true, data: clients })
}
