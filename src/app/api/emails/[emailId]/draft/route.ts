import { type NextRequest, NextResponse } from 'next/server'
import { guard } from '@/server/authz/guard'
import { z } from 'zod'
import { editDraft } from '@/server/services/draft-review-service'

const editSchema = z.object({
  body: z.string().min(1, 'Texto obrigatório'),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ emailId: string }> },
) {
  const gate = await guard('draft:approve')
  if (!gate.ok) return gate.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  const parsed = editSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 422 })
  }

  const { emailId } = await params
  const result = await editDraft({
    emailId,
    officeId: gate.user.officeId,
    body: parsed.data.body,
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, currentStatus: result.currentStatus ?? null },
      { status: result.httpStatus },
    )
  }
  return NextResponse.json({ success: true })
}
