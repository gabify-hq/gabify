import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { guard } from '@/server/authz/guard'

interface RouteParams {
  params: Promise<{ clientId: string }>
}

type InvitationState = 'pendente' | 'aceite' | 'expirado' | 'revogado'

function invitationState(inv: {
  acceptedAt: Date | null
  revokedAt: Date | null
  expiresAt: Date
}): InvitationState {
  if (inv.acceptedAt) return 'aceite'
  if (inv.revokedAt) return 'revogado'
  if (inv.expiresAt.getTime() < Date.now()) return 'expirado'
  return 'pendente'
}

/**
 * GET /api/clients/:clientId/portal-access — portal users and invitations of
 * one end-client (fase P3, "Acessos do portal"). OWNER + ACCOUNTANT
 * (`clientInvitation:manage`); client scoped to the office (cross-tenant 404).
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const gate = await guard('clientInvitation:manage')
  if (!gate.ok) return gate.response

  const { clientId } = await params
  const client = await prisma.client.findFirst({
    where: { id: clientId, officeId: gate.user.officeId, deletedAt: null },
    select: { id: true },
  })
  if (!client) {
    return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  }

  const [users, invitations] = await Promise.all([
    prisma.user.findMany({
      where: { officeId: gate.user.officeId, clientId, role: 'CLIENT', deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true, name: true, createdAt: true },
    }),
    prisma.invitation.findMany({
      where: { officeId: gate.user.officeId, clientId, role: 'CLIENT' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        email: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    }),
  ])

  return NextResponse.json({
    success: true,
    data: {
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        createdAt: u.createdAt,
      })),
      invitations: invitations.map((inv) => ({
        id: inv.id,
        email: inv.email,
        state: invitationState(inv),
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
      })),
    },
  })
}
