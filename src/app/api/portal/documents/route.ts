import { type NextRequest, NextResponse } from 'next/server'
import { guard } from '@/server/authz/guard'
import { listPortalDocuments } from '@/server/services/portal-service'

/**
 * GET /api/portal/documents — end-client portal listing (fase P2).
 *
 * CLIENT only (`portal:document:read`). The clientId scope comes EXCLUSIVELY
 * from the session — never from input. Response uses the reduced portal DTO
 * (id, filename, submittedAt, origin, public status) — internal fields never
 * cross this boundary.
 */
export async function GET(request: NextRequest) {
  const gate = await guard('portal:document:read')
  if (!gate.ok) return gate.response

  if (!gate.user.clientId) {
    // Defence in depth: a CLIENT session without clientId is invalid by
    // construction (DB CHECK) — treat as not found, reveal nothing
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  }

  const params = request.nextUrl.searchParams
  const page = await listPortalDocuments({
    officeId: gate.user.officeId,
    clientId: gate.user.clientId,
    q: params.get('q'),
    limit: params.get('limit') ? Number(params.get('limit')) : null,
    cursor: params.get('cursor'),
  })

  return NextResponse.json({ success: true, data: page })
}
