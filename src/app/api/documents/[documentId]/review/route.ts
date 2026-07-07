import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { guard } from '@/server/authz/guard'
import { reviewDocument, VALID_VAT_RATES } from '@/server/services/review-service'

const PT_DATE_REGEX = /^\d{2}\/\d{2}\/\d{4}$/

const vatBandSchema = z
  .object({
    region: z.enum(['PT', 'PT-AC', 'PT-MA']).default('PT'),
    rate: z.number(),
    baseCents: z.number().int().min(0),
    vatCents: z.number().int().min(0),
  })
  .superRefine((band, ctx) => {
    const allowed = VALID_VAT_RATES[band.region] ?? []
    if (!allowed.includes(band.rate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rate'],
        message: `Taxa de IVA inválida para ${band.region}: ${band.rate} (válidas: ${allowed.join(', ')})`,
      })
    }
  })

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
      issueDate: z.string().regex(PT_DATE_REGEX, 'Data DD/MM/AAAA').optional(),
      dueDate: z.string().regex(PT_DATE_REGEX, 'Data DD/MM/AAAA').optional(),
      totalCents: z.number().int().min(0).optional(),
      withholdingCents: z.number().int().min(0).optional(),
      currency: z.string().regex(/^[A-Z]{3}$/, 'Código ISO 4217').optional(),
      vatBreakdown: z.array(vatBandSchema).max(12).optional(),
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
    const details = Object.fromEntries(
      parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
    )
    return NextResponse.json({ error: 'Dados inválidos', details }, { status: 422 })
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
      {
        error: result.error,
        currentStatus: result.currentStatus ?? null,
        details: result.details ?? null,
      },
      { status: result.httpStatus },
    )
  }
  return NextResponse.json({ success: true, data: { status: result.status, version: result.version } })
}
