import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { guard } from '@/server/authz/guard'
import { reviewDocument } from '@/server/services/review-service'

const reviewSchema = z.object({
  decision: z.enum(['validate', 'correct', 'reject']),
  expectedVersion: z.number().int().min(1),
  notes: z.string().optional(),
  corrections: z
    .object({
      type: z.string().optional(),
      supplierName: z.string().optional(),
      supplierNif: z.string().regex(/^\d{9}$/).optional(),
      documentNumber: z.string().optional(),
      issueDate: z.string().optional(),
      totalCents: z.number().int().optional(),
      accountCode: z.string().optional(),
      vatTreatment: z.string().optional(),
      clientId: z.string().optional(),
    })
    .optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const gate = await guard('document:review')
  if (!gate.ok) return gate.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  const parsed = reviewSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 422 })
  }

  const { documentId } = await params
  const result = await reviewDocument({
    documentId,
    officeId: gate.user.officeId,
    userId: gate.user.id,
    role: gate.user.role,
    decision: parsed.data.decision,
    corrections: parsed.data.corrections as never,
    expectedVersion: parsed.data.expectedVersion,
    notes: parsed.data.notes,
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, currentStatus: result.currentStatus ?? null },
      { status: result.httpStatus },
    )
  }
  return NextResponse.json({ success: true, data: { status: result.status, version: result.version } })
}
