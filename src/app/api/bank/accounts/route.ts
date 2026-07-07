import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { guard } from '@/server/authz/guard'

/**
 * Bank accounts (fase C1): one account belongs to one client of the office.
 * Uniqueness of (officeId, clientId, iban) is enforced when the IBAN is present.
 */

const createSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(1).max(120),
  iban: z
    .string()
    .transform((v) => v.replace(/\s/g, '').toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/, 'IBAN inválido'))
    .optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).default('EUR'),
})

export async function POST(request: NextRequest) {
  const gate = await guard('bank:manage')
  if (!gate.ok) return gate.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  const parsed = createSchema.safeParse(body)
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

  const client = await prisma.client.findFirst({
    where: { id: parsed.data.clientId, officeId: gate.user.officeId, deletedAt: null },
    select: { id: true },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  try {
    const account = await prisma.bankAccount.create({
      data: {
        officeId: gate.user.officeId,
        clientId: parsed.data.clientId,
        name: parsed.data.name,
        iban: parsed.data.iban ?? null,
        currency: parsed.data.currency,
      },
    })
    return NextResponse.json({ success: true, data: account })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Já existe uma conta com este IBAN para este cliente' },
        { status: 409 },
      )
    }
    throw error
  }
}

const listSchema = z.object({
  clientId: z.string().min(1).optional(),
  active: z.enum(['1', 'true', '0', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().min(1).optional(),
})

export async function GET(request: NextRequest) {
  const gate = await guard('bank:read')
  if (!gate.ok) return gate.response

  const raw = Object.fromEntries(
    [...request.nextUrl.searchParams.entries()].filter(([, v]) => v !== ''),
  )
  const parsed = listSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Filtros inválidos' }, { status: 422 })
  }
  const { clientId, active, limit, cursor } = parsed.data

  const accounts = await prisma.bankAccount.findMany({
    where: {
      officeId: gate.user.officeId,
      ...(clientId ? { clientId } : {}),
      ...(active !== undefined ? { active: active === '1' || active === 'true' } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      clientId: true,
      name: true,
      iban: true,
      currency: true,
      active: true,
      createdAt: true,
      client: { select: { name: true } },
      _count: { select: { transactions: { where: { status: 'UNRECONCILED' } } } },
    },
  })

  const hasMore = accounts.length > limit
  const page = hasMore ? accounts.slice(0, limit) : accounts
  return NextResponse.json({
    success: true,
    data: {
      items: page.map((a) => ({
        id: a.id,
        clientId: a.clientId,
        clientName: a.client.name,
        name: a.name,
        iban: a.iban,
        currency: a.currency,
        active: a.active,
        unreconciledCount: a._count.transactions,
        createdAt: a.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    },
  })
}
