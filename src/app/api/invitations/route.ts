import { type NextRequest, NextResponse } from 'next/server'
import { guard } from '@/server/authz/guard'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createInvitation, InvitationError } from '@/server/services/invitation-service'

const createInvitationSchema = z
  .object({
    email: z.string().email('Email inválido'),
    role: z.enum(['OWNER', 'ACCOUNTANT', 'VIEWER', 'CLIENT']),
    clientId: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    // Fase P1: a CLIENT invitation is bound to one end-client; internal
    // invitations must never carry a clientId
    if (data.role === 'CLIENT' && !data.clientId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['clientId'],
        message: 'Convite de portal exige o cliente associado',
      })
    }
    if (data.role !== 'CLIENT' && data.clientId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['clientId'],
        message: 'Só convites de portal têm cliente associado',
      })
    }
  })

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }

  // Portal invitations (role CLIENT) are manageable by OWNER and ACCOUNTANT
  // (clientInvitation:manage); internal invitations remain OWNER-only. The
  // action is derived from the requested role BEFORE validation so permission
  // errors (401/403) always precede validation detail (anti-enumeration).
  const requestedRole = (body as { role?: unknown } | null)?.role
  const action = requestedRole === 'CLIENT' ? 'clientInvitation:manage' : 'invitation:manage'
  const gate = await guard(action, { denyStatus: 403 })
  if (!gate.ok) return gate.response

  const parsed = createInvitationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  }

  try {
    const { invitation } = await createInvitation({
      officeId: gate.user.officeId,
      email: parsed.data.email,
      role: parsed.data.role,
      clientId: parsed.data.clientId ?? null,
      invitedByUserId: gate.user.id,
    })
    return NextResponse.json(
      {
        success: true,
        data: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          clientId: invitation.clientId,
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
    if (error instanceof InvitationError && error.code === 'CLIENT_NOT_FOUND') {
      // Cross-tenant clientId: 404, never reveal existence (regra 10)
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    }
    if (
      error instanceof InvitationError &&
      (error.code === 'CLIENT_ID_REQUIRED' || error.code === 'CLIENT_ID_FORBIDDEN')
    ) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 422 })
    }
    throw error
  }
}

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200

export async function GET(request: NextRequest) {
  const gate = await guard('invitation:manage', { denyStatus: 403 })
  if (!gate.ok) return gate.response

  const params = request.nextUrl.searchParams
  const take = Math.min(Number(params.get('limit')) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  const cursor = params.get('cursor')

  const invitations = await prisma.invitation.findMany({
    where: { officeId: gate.user.officeId },
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
