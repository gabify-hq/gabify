import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { guard } from '@/server/authz/guard'

interface RouteParams {
  params: Promise<{ clientId: string; userId: string }>
}

/**
 * DELETE /api/clients/:clientId/portal-access/:userId — revoke a portal
 * access (fase P3). Soft-deletes the CLIENT user, deletes their Session rows
 * (revocation is immediate — database sessions) and writes an AuditLog.
 *
 * Only CLIENT users of EXACTLY this client, in this office, are reachable —
 * internal users and other clients' users are 404 (never revealed).
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const gate = await guard('clientInvitation:manage')
  if (!gate.ok) return gate.response

  const { clientId, userId } = await params

  const client = await prisma.client.findFirst({
    where: { id: clientId, officeId: gate.user.officeId, deletedAt: null },
    select: { id: true },
  })
  if (!client) {
    return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  }

  const target = await prisma.user.findFirst({
    where: {
      id: userId,
      officeId: gate.user.officeId,
      clientId,
      role: 'CLIENT',
      deletedAt: null,
    },
    select: { id: true, email: true },
  })
  if (!target) {
    return NextResponse.json({ error: 'Acesso não encontrado' }, { status: 404 })
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: target.id },
      data: { deletedAt: new Date() },
    }),
    prisma.session.deleteMany({ where: { userId: target.id } }),
    prisma.auditLog.create({
      data: {
        officeId: gate.user.officeId,
        userId: gate.user.id,
        action: 'PORTAL_ACCESS_REVOKED',
        entityType: 'User',
        entityId: target.id,
        metadata: { email: target.email, clientId },
      },
    }),
  ])

  return NextResponse.json({ success: true })
}
