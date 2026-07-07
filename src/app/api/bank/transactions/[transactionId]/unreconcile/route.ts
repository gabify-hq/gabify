import { type NextRequest, NextResponse } from 'next/server'
import { guard } from '@/server/authz/guard'
import { unreconcileTransaction } from '@/server/services/bank-reconciliation-service'

/**
 * POST /api/bank/transactions/[transactionId]/unreconcile (fase C3).
 * Reverts a reconciliation or an ignore: transaction back to UNRECONCILED,
 * documents unlinked, suggestions back to PENDING, entry removed — audited.
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ transactionId: string }> },
) {
  const gate = await guard('bank:reconcile')
  if (!gate.ok) return gate.response

  const { transactionId } = await context.params
  const result = await unreconcileTransaction({
    officeId: gate.user.officeId,
    userId: gate.user.id,
    role: gate.user.role,
    transactionId,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.httpStatus })
  }
  return NextResponse.json({ success: true, data: { status: result.status, version: result.version } })
}
