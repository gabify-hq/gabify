import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * User management within an office. OWNER only.
 * Anti-lockout (A2): the last OWNER of an office can never be deleted or demoted.
 */

async function findTargetUser(userId: string, officeId: string) {
  return prisma.user.findFirst({
    where: { id: userId, officeId, deletedAt: null },
  })
}

async function isLastOwner(userId: string, officeId: string): Promise<boolean> {
  const target = await prisma.user.findFirst({
    where: { id: userId, officeId, deletedAt: null },
    select: { role: true },
  })
  if (target?.role !== 'OWNER') return false
  const ownerCount = await prisma.user.count({
    where: { officeId, role: 'OWNER', deletedAt: null },
  })
  return ownerCount <= 1
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const session = await auth()
  if (!session?.user?.officeId) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }
  if (session.user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { userId } = await params
  const target = await findTargetUser(userId, session.user.officeId)
  if (!target) {
    return NextResponse.json({ error: 'Utilizador não encontrado' }, { status: 404 })
  }

  if (await isLastOwner(userId, session.user.officeId)) {
    return NextResponse.json(
      { error: 'Não é possível remover o único proprietário do gabinete' },
      { status: 409 },
    )
  }

  await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date() },
  })

  await prisma.auditLog.create({
    data: {
      officeId: session.user.officeId,
      userId: session.user.id,
      action: 'USER_DELETED',
      entityType: 'User',
      entityId: userId,
    },
  })

  return NextResponse.json({ success: true })
}

const patchUserSchema = z.object({
  role: z.enum(['OWNER', 'ACCOUNTANT', 'VIEWER']),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const session = await auth()
  if (!session?.user?.officeId) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }
  if (session.user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  const parsed = patchUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 422 })
  }

  const { userId } = await params
  const target = await findTargetUser(userId, session.user.officeId)
  if (!target) {
    return NextResponse.json({ error: 'Utilizador não encontrado' }, { status: 404 })
  }

  const isDemotion = target.role === 'OWNER' && parsed.data.role !== 'OWNER'
  if (isDemotion && (await isLastOwner(userId, session.user.officeId))) {
    return NextResponse.json(
      { error: 'Não é possível despromover o único proprietário do gabinete' },
      { status: 409 },
    )
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role: parsed.data.role },
    select: { id: true, email: true, role: true },
  })

  await prisma.auditLog.create({
    data: {
      officeId: session.user.officeId,
      userId: session.user.id,
      action: 'USER_ROLE_CHANGED',
      entityType: 'User',
      entityId: userId,
      metadata: { from: target.role, to: parsed.data.role },
    },
  })

  return NextResponse.json({ success: true, data: updated })
}
