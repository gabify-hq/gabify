import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { guard } from '@/server/authz/guard'
import type { BankTransactionStatus, Prisma } from '@prisma/client'

/**
 * GET /api/bank/transactions (fase C1) — reconciliation queue listing.
 * AND filters, office-scoped, cursor pagination (default 50, max 200).
 * A bankAccountId from another office is a 404 (identifiable resource).
 */

const TRANSACTION_STATUSES = ['UNRECONCILED', 'SUGGESTED', 'RECONCILED', 'IGNORED'] as const

const querySchema = z.object({
  bankAccountId: z.string().min(1).optional(),
  status: z
    .string()
    .transform((v) => v.split(',').map((s) => s.trim()).filter((s) => s !== ''))
    .pipe(z.array(z.enum(TRANSACTION_STATUSES)).min(1))
    .optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().min(1).optional(),
})

export async function GET(request: NextRequest) {
  const gate = await guard('bank:read')
  if (!gate.ok) return gate.response

  const raw = Object.fromEntries(
    [...request.nextUrl.searchParams.entries()].filter(([, v]) => v !== ''),
  )
  const parsed = querySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Filtros inválidos' }, { status: 422 })
  }
  const { bankAccountId, status, from, to, q, limit, cursor } = parsed.data

  if (bankAccountId) {
    const account = await prisma.bankAccount.findFirst({
      where: { id: bankAccountId, officeId: gate.user.officeId },
      select: { id: true },
    })
    if (!account) {
      return NextResponse.json({ error: 'Conta bancária não encontrada' }, { status: 404 })
    }
  }

  const where: Prisma.BankTransactionWhereInput = {
    officeId: gate.user.officeId,
    ...(bankAccountId ? { bankAccountId } : {}),
    ...(status ? { status: { in: status as BankTransactionStatus[] } } : {}),
    ...(from || to
      ? {
          bookingDate: {
            ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
    ...(q ? { description: { contains: q, mode: 'insensitive' as const } } : {}),
  }

  const [transactions, total] = await Promise.all([
    prisma.bankTransaction.findMany({
      where,
      orderBy: [{ bookingDate: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        bankAccountId: true,
        bookingDate: true,
        valueDate: true,
        description: true,
        amountCents: true,
        balanceCents: true,
        externalRef: true,
        status: true,
        bankAccount: { select: { name: true, clientId: true, client: { select: { name: true } } } },
      },
    }),
    prisma.bankTransaction.count({ where }),
  ])

  const hasMore = transactions.length > limit
  const page = hasMore ? transactions.slice(0, limit) : transactions
  return NextResponse.json({
    success: true,
    data: {
      items: page.map((t) => ({
        id: t.id,
        bankAccountId: t.bankAccountId,
        bankAccountName: t.bankAccount.name,
        clientId: t.bankAccount.clientId,
        clientName: t.bankAccount.client.name,
        bookingDate: t.bookingDate.toISOString().slice(0, 10),
        valueDate: t.valueDate ? t.valueDate.toISOString().slice(0, 10) : null,
        description: t.description,
        amountCents: t.amountCents,
        balanceCents: t.balanceCents,
        externalRef: t.externalRef,
        status: t.status,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
      total,
    },
  })
}
