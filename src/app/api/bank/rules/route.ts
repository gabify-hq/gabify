import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { guard } from '@/server/authz/guard'

/**
 * Bank rules CRUD (fase C3) — OWNER/ACCOUNTANT via bankRule:manage; rules are
 * applied before matching (see bank-rules.ts). SIMPLE_REGEX patterns must
 * compile; SUGGEST_CLIENT requires a target client of the office.
 */

const createSchema = z
  .object({
    bankAccountId: z.string().min(1).nullish(),
    matchType: z.enum(['CONTAINS', 'EQUALS', 'SIMPLE_REGEX']),
    pattern: z.string().min(1).max(200),
    amountMinCents: z.number().int().nullish(),
    amountMaxCents: z.number().int().nullish(),
    action: z.enum(['IGNORE', 'SUGGEST_CLIENT']),
    targetClientId: z.string().min(1).nullish(),
    priority: z.number().int().min(0).max(10000).default(100),
    active: z.boolean().default(true),
  })
  .refine((r) => r.action !== 'SUGGEST_CLIENT' || Boolean(r.targetClientId), {
    message: 'targetClientId é obrigatório para SUGGEST_CLIENT',
  })

export async function POST(request: NextRequest) {
  const gate = await guard('bankRule:manage')
  if (!gate.ok) return gate.response

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  const parsed = createSchema.safeParse(raw)
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
  const data = parsed.data

  if (data.matchType === 'SIMPLE_REGEX') {
    try {
      new RegExp(data.pattern, 'i')
    } catch {
      return NextResponse.json({ error: 'Expressão regular inválida' }, { status: 422 })
    }
  }
  if (data.bankAccountId) {
    const account = await prisma.bankAccount.findFirst({
      where: { id: data.bankAccountId, officeId: gate.user.officeId },
      select: { id: true },
    })
    if (!account) return NextResponse.json({ error: 'Conta bancária não encontrada' }, { status: 404 })
  }
  if (data.targetClientId) {
    const client = await prisma.client.findFirst({
      where: { id: data.targetClientId, officeId: gate.user.officeId, deletedAt: null },
      select: { id: true },
    })
    if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  }

  const rule = await prisma.bankRule.create({
    data: {
      officeId: gate.user.officeId,
      bankAccountId: data.bankAccountId ?? null,
      matchType: data.matchType,
      pattern: data.pattern,
      amountMinCents: data.amountMinCents ?? null,
      amountMaxCents: data.amountMaxCents ?? null,
      action: data.action,
      targetClientId: data.targetClientId ?? null,
      priority: data.priority,
      active: data.active,
    },
  })
  return NextResponse.json({ success: true, data: rule })
}

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().min(1).optional(),
})

export async function GET(request: NextRequest) {
  const gate = await guard('bankRule:manage')
  if (!gate.ok) return gate.response

  const raw = Object.fromEntries(
    [...request.nextUrl.searchParams.entries()].filter(([, v]) => v !== ''),
  )
  const parsed = listSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Filtros inválidos' }, { status: 422 })
  }
  const { limit, cursor } = parsed.data

  const rules = await prisma.bankRule.findMany({
    where: { officeId: gate.user.officeId },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      bankAccount: { select: { name: true } },
      targetClient: { select: { name: true } },
    },
  })

  const hasMore = rules.length > limit
  const page = hasMore ? rules.slice(0, limit) : rules
  return NextResponse.json({
    success: true,
    data: {
      items: page.map((r) => ({
        id: r.id,
        bankAccountId: r.bankAccountId,
        bankAccountName: r.bankAccount?.name ?? null,
        matchType: r.matchType,
        pattern: r.pattern,
        amountMinCents: r.amountMinCents,
        amountMaxCents: r.amountMaxCents,
        action: r.action,
        targetClientId: r.targetClientId,
        targetClientName: r.targetClient?.name ?? null,
        priority: r.priority,
        active: r.active,
        createdAt: r.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    },
  })
}
