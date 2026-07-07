import { type NextRequest, NextResponse } from 'next/server'
import { guard } from '@/server/authz/guard'
import { confirmBankStatementImport } from '@/server/services/bank-import-service'

/**
 * POST /api/bank/imports/[importId]/confirm — step 2 of 2 (fase C1).
 * Human-confirmed column mapping → BankTransaction rows. Duplicate rows are
 * skipped and reported; a confirmed import can never be confirmed again (409).
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ importId: string }> },
) {
  const gate = await guard('bank:import')
  if (!gate.ok) return gate.response

  const { importId } = await context.params
  let body: { mapping?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }

  const result = await confirmBankStatementImport({
    importId,
    officeId: gate.user.officeId,
    mapping: body.mapping,
  })
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.details ? { details: result.details } : {}) },
      { status: result.httpStatus },
    )
  }
  return NextResponse.json({ success: true, data: result.report })
}
