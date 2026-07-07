import { type NextRequest, NextResponse } from 'next/server'
import { guard } from '@/server/authz/guard'
import { retrySend } from '@/server/services/draft-review-service'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ emailId: string }> },
) {
  const gate = await guard('draft:approve')
  if (!gate.ok) return gate.response

  const { emailId } = await params
  const result = await retrySend({
    emailId,
    officeId: gate.user.officeId,
    userId: gate.user.id,
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, currentStatus: result.currentStatus ?? null },
      { status: result.httpStatus },
    )
  }
  return NextResponse.json({ success: true, data: { status: result.status } })
}
