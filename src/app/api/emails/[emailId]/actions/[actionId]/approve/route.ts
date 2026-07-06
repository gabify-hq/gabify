import { type NextRequest, NextResponse } from 'next/server'
import { guard } from '@/server/authz/guard'
import { z } from 'zod'
import { approveDraft } from '@/server/services/draft-review-service'

const approveSchema = z.object({
  editedBody: z.string().min(1).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ emailId: string; actionId: string }> },
) {
  const gate = await guard('draft:approve')
  if (!gate.ok) return gate.response

  let body: unknown = {}
  try {
    const text = await request.text()
    body = text ? JSON.parse(text) : {}
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  const parsed = approveSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 422 })
  }

  const { emailId, actionId } = await params
  const result = await approveDraft({
    emailId,
    actionId,
    officeId: gate.user.officeId,
    userId: gate.user.id,
    editedBody: parsed.data.editedBody,
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, currentStatus: result.currentStatus ?? null },
      { status: result.httpStatus },
    )
  }
  return NextResponse.json({ success: true, data: { status: result.status } })
}
