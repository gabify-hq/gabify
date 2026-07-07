import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { guard } from '@/server/authz/guard'
import { bulkValidate } from '@/server/services/review-service'

const bulkSchema = z.object({
  items: z
    .array(z.object({ documentId: z.string(), expectedVersion: z.number().int().min(1) }))
    .min(1)
    .max(200),
})

/** Bulk validate PRE_VALIDATED documents — per-item CONFLICT/FORBIDDEN/OK report (A7). */
export async function POST(request: NextRequest) {
  const gate = await guard('document:review')
  if (!gate.ok) return gate.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  const parsed = bulkSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 422 })
  }

  const results = await bulkValidate({
    officeId: gate.user.officeId,
    userId: gate.user.id,
    role: gate.user.role,
    items: parsed.data.items,
  })
  return NextResponse.json({ success: true, data: { results } })
}
