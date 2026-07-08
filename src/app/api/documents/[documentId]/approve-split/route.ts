import { type NextRequest, NextResponse } from 'next/server'
import { guard } from '@/server/authz/guard'
import { approveSplit } from '@/server/services/review-service'

/**
 * POST /api/documents/[documentId]/approve-split (audit F3.8 — A-11).
 * Applies the cached low-confidence split suggestion after human approval.
 * Office-scoped — cross-tenant requests see 404.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const gate = await guard('document:review')
  if (!gate.ok) return gate.response

  const { documentId } = await params
  const result = await approveSplit({
    documentId,
    officeId: gate.user.officeId,
    userId: gate.user.id,
    role: gate.user.role,
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
