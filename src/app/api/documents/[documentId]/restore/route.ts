import { type NextRequest, NextResponse } from 'next/server'
import { guard } from '@/server/authz/guard'
import { restoreDocument } from '@/server/services/review-service'

/**
 * POST /api/documents/[documentId]/restore (audit F3.9 — undo do Rejeitar).
 * Clears the soft-delete of a rejected document; the previous status stands.
 * Office-scoped — cross-tenant → 404; not rejected → 409.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const gate = await guard('document:review')
  if (!gate.ok) return gate.response

  const { documentId } = await params
  const result = await restoreDocument({
    documentId,
    officeId: gate.user.officeId,
    userId: gate.user.id,
    role: gate.user.role,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.httpStatus })
  }
  return NextResponse.json({
    success: true,
    data: { status: result.status, version: result.version },
  })
}
