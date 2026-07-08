import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { guard } from '@/server/authz/guard'
import { resolveDuplicate } from '@/server/services/review-service'

/**
 * POST /api/documents/[documentId]/resolve-duplicate (audit F3.8 — A-11).
 * Exposes the existing resolution service: keep = archive as confirmed
 * duplicate; delete = soft-delete; distinct = clear the flag. Office-scoped
 * (cross-tenant → 404) with optimistic locking.
 */

const bodySchema = z.object({
  resolution: z.enum(['keep', 'delete', 'distinct']),
  expectedVersion: z.number().int().min(1),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const gate = await guard('document:review')
  if (!gate.ok) return gate.response

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 422 })
  }

  const { documentId } = await params
  const result = await resolveDuplicate({
    documentId,
    officeId: gate.user.officeId,
    userId: gate.user.id,
    role: gate.user.role,
    resolution: parsed.data.resolution,
    expectedVersion: parsed.data.expectedVersion,
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, currentStatus: result.currentStatus ?? null },
      { status: result.httpStatus },
    )
  }
  return NextResponse.json({
    success: true,
    data: { status: result.status, version: result.version },
  })
}
