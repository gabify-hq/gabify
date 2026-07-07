import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { guard } from '@/server/authz/guard'
import { reconcileTransaction } from '@/server/services/bank-reconciliation-service'

/**
 * POST /api/bank/transactions/[transactionId]/reconcile (fase C3).
 * Body: { documentIds: [...] } OR { ignore: true, reason }. Always with
 * expectedVersion (optimistic locking, A7). Multi-document totals must add up
 * to the transaction amount ± office tolerance (422 otherwise).
 */

const bodySchema = z
  .object({
    documentIds: z.array(z.string().min(1)).min(1).max(50).optional(),
    ignore: z.literal(true).optional(),
    reason: z.string().max(500).optional(),
    expectedVersion: z.number().int().min(1),
  })
  .refine((b) => (b.ignore === true) !== (b.documentIds !== undefined), {
    message: 'Indique documentIds OU ignore com motivo',
  })

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ transactionId: string }> },
) {
  const gate = await guard('bank:reconcile')
  if (!gate.ok) return gate.response

  const { transactionId } = await context.params
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }

  const result = await reconcileTransaction({
    officeId: gate.user.officeId,
    userId: gate.user.id,
    role: gate.user.role,
    transactionId,
    expectedVersion: parsed.data.expectedVersion,
    documentIds: parsed.data.documentIds,
    ignore: parsed.data.ignore,
    reason: parsed.data.reason,
  })
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.details ? { details: result.details } : {}) },
      { status: result.httpStatus },
    )
  }
  return NextResponse.json({ success: true, data: { status: result.status, version: result.version } })
}
