import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { guard } from '@/server/authz/guard'
import { reopenDocument } from '@/server/services/review-service'

const reopenSchema = z.object({
  reason: z.string().min(1, 'Motivo obrigatório'),
})

/** Reopen an EXPORTED document (A9). OWNER only, mandatory reason, audited. */
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
  const parsed = reopenSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Motivo obrigatório' }, { status: 400 })
  }

  const { documentId } = await params
  const result = await reopenDocument({
    documentId,
    officeId: gate.user.officeId,
    userId: gate.user.id,
    role: gate.user.role,
    reason: parsed.data.reason,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.httpStatus })
  }
  return NextResponse.json({ success: true, data: { status: result.status } })
}
