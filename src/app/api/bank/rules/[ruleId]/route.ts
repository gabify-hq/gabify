import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { guard } from '@/server/authz/guard'

/** PATCH/DELETE /api/bank/rules/[ruleId] (fase C3) — OWNER/ACCOUNTANT. */

const patchSchema = z
  .object({
    matchType: z.enum(['CONTAINS', 'EQUALS', 'SIMPLE_REGEX']).optional(),
    pattern: z.string().min(1).max(200).optional(),
    amountMinCents: z.number().int().nullish(),
    amountMaxCents: z.number().int().nullish(),
    action: z.enum(['IGNORE', 'SUGGEST_CLIENT']).optional(),
    targetClientId: z.string().min(1).nullish(),
    priority: z.number().int().min(0).max(10000).optional(),
    active: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nada para atualizar' })

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ ruleId: string }> },
) {
  const gate = await guard('bankRule:manage')
  if (!gate.ok) return gate.response

  const { ruleId } = await context.params
  const rule = await prisma.bankRule.findFirst({
    where: { id: ruleId, officeId: gate.user.officeId },
  })
  if (!rule) return NextResponse.json({ error: 'Regra não encontrada' }, { status: 404 })

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 422 })
  }
  const data = parsed.data

  const finalAction = data.action ?? rule.action
  const finalTarget =
    data.targetClientId !== undefined ? data.targetClientId : rule.targetClientId
  if (finalAction === 'SUGGEST_CLIENT' && !finalTarget) {
    return NextResponse.json(
      { error: 'targetClientId é obrigatório para SUGGEST_CLIENT' },
      { status: 422 },
    )
  }
  if (data.pattern !== undefined || data.matchType !== undefined) {
    const type = data.matchType ?? rule.matchType
    const pattern = data.pattern ?? rule.pattern
    if (type === 'SIMPLE_REGEX') {
      try {
        new RegExp(pattern, 'i')
      } catch {
        return NextResponse.json({ error: 'Expressão regular inválida' }, { status: 422 })
      }
    }
  }
  if (data.targetClientId) {
    const client = await prisma.client.findFirst({
      where: { id: data.targetClientId, officeId: gate.user.officeId, deletedAt: null },
      select: { id: true },
    })
    if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  }

  const updated = await prisma.bankRule.update({
    where: { id: rule.id },
    data: {
      ...(data.matchType !== undefined ? { matchType: data.matchType } : {}),
      ...(data.pattern !== undefined ? { pattern: data.pattern } : {}),
      ...(data.amountMinCents !== undefined ? { amountMinCents: data.amountMinCents } : {}),
      ...(data.amountMaxCents !== undefined ? { amountMaxCents: data.amountMaxCents } : {}),
      ...(data.action !== undefined ? { action: data.action } : {}),
      ...(data.targetClientId !== undefined ? { targetClientId: data.targetClientId } : {}),
      ...(data.priority !== undefined ? { priority: data.priority } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
    },
  })
  return NextResponse.json({ success: true, data: updated })
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ ruleId: string }> },
) {
  const gate = await guard('bankRule:manage')
  if (!gate.ok) return gate.response

  const { ruleId } = await context.params
  const rule = await prisma.bankRule.findFirst({
    where: { id: ruleId, officeId: gate.user.officeId },
    select: { id: true },
  })
  if (!rule) return NextResponse.json({ error: 'Regra não encontrada' }, { status: 404 })

  await prisma.bankRule.delete({ where: { id: rule.id } })
  return NextResponse.json({ success: true, data: { id: rule.id } })
}
