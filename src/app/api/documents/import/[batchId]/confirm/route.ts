import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { guard } from '@/server/authz/guard'
import { confirmImportBatch } from '@/server/services/import-service'

const confirmSchema = z.object({
  mapping: z.object({
    date: z.string(),
    documentNumber: z.string(),
    supplierNif: z.string(),
    netAmount: z.string(),
    vatRate: z.string(),
    totalAmount: z.string(),
  }),
})

/**
 * POST /api/documents/import/:batchId/confirm — step 2 of 2.
 * Human confirms (or edits) the mapping; only then are documents created.
 * A batch can never be imported twice (409).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const gate = await guard('document:upload')
  if (!gate.ok) return gate.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  const parsed = confirmSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Mapeamento obrigatório' }, { status: 422 })
  }

  const { batchId } = await params
  const result = await confirmImportBatch({
    batchId,
    officeId: gate.user.officeId,
    mapping: parsed.data.mapping,
  })

  if (!result.ok) {
    const message = result.httpStatus === 404 ? 'Importação não encontrada' : 'Importação já confirmada'
    return NextResponse.json({ error: message }, { status: result.httpStatus })
  }
  return NextResponse.json({ success: true, data: { report: result.report } })
}
