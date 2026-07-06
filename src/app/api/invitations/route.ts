import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createInvitation, InvitationError } from '@/server/services/invitation-service'

const createInvitationSchema = z.object({
  email: z.string().email('Email inválido'),
  role: z.enum(['OWNER', 'ACCOUNTANT', 'VIEWER']),
})

export async function POST(request: NextRequest) {
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

  const parsed = createInvitationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  }

  try {
    const { invitation } = await createInvitation({
      officeId: session.user.officeId,
      email: parsed.data.email,
      role: parsed.data.role,
      invitedByUserId: session.user.id,
    })
    return NextResponse.json(
      {
        success: true,
        data: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          expiresAt: invitation.expiresAt,
          createdAt: invitation.createdAt,
        },
      },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof InvitationError && error.code === 'EMAIL_ALREADY_REGISTERED') {
      return NextResponse.json(
        { error: 'Este email já tem uma conta registada', code: 'EMAIL_ALREADY_REGISTERED' },
        { status: 409 },
      )
    }
    if (error instanceof InvitationError && error.code === 'ROLE_ESCALATION') {
      return NextResponse.json({ error: error.message, code: 'ROLE_ESCALATION' }, { status: 403 })
    }
    throw error
  }
}

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.officeId) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }
  if (session.user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const params = request.nextUrl.searchParams
  const take = Math.min(Number(params.get('limit')) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  const cursor = params.get('cursor')

  const invitations = await prisma.invitation.findMany({
    where: { officeId: session.user.officeId },
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  })

  const hasMore = invitations.length > take
  const items = hasMore ? invitations.slice(0, take) : invitations
  return NextResponse.json({
    success: true,
    data: { items, nextCursor: hasMore ? items[items.length - 1].id : null },
  })
}
