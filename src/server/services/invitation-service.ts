import { createHash, randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { resend, FROM_EMAIL } from '@/lib/resend'
import type { Invitation, UserRole } from '@prisma/client'

const INVITATION_TTL_MS = 72 * 60 * 60 * 1000 // 72h (§0.1)

/** Role hierarchy for the anti-escalation check (A2). */
const ROLE_RANK: Record<UserRole, number> = {
  OWNER: 3,
  ACCOUNTANT: 2,
  VIEWER: 1,
  CLIENT: 0,
}

export class InvitationError extends Error {
  readonly code:
    | 'EMAIL_ALREADY_REGISTERED'
    | 'ROLE_ESCALATION'
    | 'NOT_FOUND'
    | 'NOT_PENDING'
    | 'CLIENT_ID_REQUIRED'
    | 'CLIENT_ID_FORBIDDEN'
    | 'CLIENT_NOT_FOUND'

  constructor(code: InvitationError['code'], message: string) {
    super(message)
    this.code = code
    this.name = 'InvitationError'
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function generateToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashToken(token) }
}

function isPending(invitation: Invitation, now = new Date()): boolean {
  return (
    invitation.acceptedAt === null &&
    invitation.revokedAt === null &&
    invitation.expiresAt > now
  )
}

async function sendInvitationEmail(email: string, token: string, officeName: string): Promise<void> {
  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  const link = `${baseUrl}/accept-invite?token=${encodeURIComponent(token)}`
  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `Convite para o Gabify — ${officeName}`,
    text: [
      'Bom dia,',
      '',
      `Foi convidado(a) para aceder ao Gabify (${officeName}).`,
      `Para ativar o acesso, abra o link seguinte e inicie sessão com este email:`,
      link,
      '',
      'O convite expira em 72 horas.',
      '',
      'Se não esperava este convite, pode ignorar este email.',
    ].join('\n'),
  })
}

/**
 * Creates an invitation and emails the raw token. Only the SHA-256 hash is stored.
 * Enforces: one-user-one-office (A2) and no role escalation above the inviter (A2).
 */
export async function createInvitation(params: {
  officeId: string
  email: string
  role: UserRole
  invitedByUserId: string
  /** Required when role=CLIENT (portal — fase P1), forbidden otherwise. */
  clientId?: string | null
}): Promise<{ invitation: Invitation; token: string }> {
  const email = params.email.toLowerCase()
  const clientId = params.clientId ?? null

  // Fase P1: a CLIENT invitation is bound to exactly one end-client of THIS
  // office; any other role must not carry a clientId (mirrors the DB CHECKs)
  if (params.role === 'CLIENT') {
    if (!clientId) {
      throw new InvitationError('CLIENT_ID_REQUIRED', 'Convite de portal exige o cliente associado')
    }
    const client = await prisma.client.findFirst({
      where: { id: clientId, officeId: params.officeId, deletedAt: null },
      select: { id: true },
    })
    if (!client) {
      throw new InvitationError('CLIENT_NOT_FOUND', 'Cliente não encontrado')
    }
  } else if (clientId) {
    throw new InvitationError('CLIENT_ID_FORBIDDEN', 'Só convites de portal têm cliente associado')
  }

  const existingUser = await prisma.user.findFirst({
    where: { email, deletedAt: null },
    select: { id: true },
  })
  if (existingUser) {
    throw new InvitationError('EMAIL_ALREADY_REGISTERED', 'Este email já tem uma conta registada')
  }

  const inviter = await prisma.user.findUniqueOrThrow({
    where: { id: params.invitedByUserId },
    select: { role: true },
  })
  if (ROLE_RANK[params.role] > ROLE_RANK[inviter.role]) {
    throw new InvitationError('ROLE_ESCALATION', 'Não pode convidar com permissões superiores às suas')
  }

  // A pending invitation for the same email in this office is superseded, not duplicated
  await prisma.invitation.updateMany({
    where: { officeId: params.officeId, email, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  })

  const { token, tokenHash } = generateToken()
  const invitation = await prisma.invitation.create({
    data: {
      officeId: params.officeId,
      email,
      role: params.role,
      clientId,
      tokenHash,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      invitedByUserId: params.invitedByUserId,
    },
  })

  // AuditLog before the external action (email send) — security rule G5
  await prisma.auditLog.create({
    data: {
      officeId: params.officeId,
      userId: params.invitedByUserId,
      action: 'INVITATION_CREATED',
      entityType: 'Invitation',
      entityId: invitation.id,
      metadata: { email, role: params.role },
    },
  })

  const office = await prisma.office.findUniqueOrThrow({
    where: { id: params.officeId },
    select: { name: true },
  })
  await sendInvitationEmail(email, token, office.name)

  return { invitation, token }
}

/** Returns the invitation for a raw token if (and only if) it is still pending. */
export async function validateInvitationToken(token: string): Promise<Invitation | null> {
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
  })
  if (!invitation || !isPending(invitation)) return null
  return invitation
}

/** Latest pending invitation for an email (case-insensitive), or null. */
export async function findPendingInvitationByEmail(email: string): Promise<Invitation | null> {
  const invitation = await prisma.invitation.findFirst({
    where: {
      email: email.toLowerCase(),
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  })
  return invitation
}

/**
 * Neutral magic-link policy: a magic link is only actually sent when the email
 * belongs to an existing user or has a pending invitation. Callers must NOT
 * surface the difference to the requester (anti-enumeration, A2).
 */
export async function canRequestMagicLink(email: string): Promise<boolean> {
  const lower = email.toLowerCase()
  const user = await prisma.user.findFirst({
    where: { email: lower, deletedAt: null },
    select: { id: true },
  })
  if (user) return true
  const invitation = await findPendingInvitationByEmail(lower)
  return invitation !== null
}

/** Revokes a pending invitation. Returns false when not found in the office or not pending. */
export async function revokeInvitation(params: {
  invitationId: string
  officeId: string
}): Promise<boolean> {
  const result = await prisma.invitation.updateMany({
    where: {
      id: params.invitationId,
      officeId: params.officeId,
      acceptedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  })
  return result.count === 1
}

/**
 * Regenerates the token of a pending invitation (old token dies) and re-sends the email.
 * Returns null when the invitation does not exist in the office or is not pending.
 */
export async function resendInvitation(params: {
  invitationId: string
  officeId: string
}): Promise<{ invitation: Invitation; token: string } | null> {
  const existing = await prisma.invitation.findFirst({
    where: { id: params.invitationId, officeId: params.officeId },
  })
  if (!existing || !isPending(existing)) return null

  const { token, tokenHash } = generateToken()
  const invitation = await prisma.invitation.update({
    where: { id: existing.id },
    data: { tokenHash, expiresAt: new Date(Date.now() + INVITATION_TTL_MS) },
  })

  const office = await prisma.office.findUniqueOrThrow({
    where: { id: params.officeId },
    select: { name: true },
  })
  await sendInvitationEmail(invitation.email, token, office.name)

  return { invitation, token }
}

/**
 * Accepts the pending invitation for an email by creating the User inside a
 * transaction (invitation marked accepted + AuditLog INVITATION_ACCEPTED).
 * Throws when there is no pending invitation — the auth adapter relies on this
 * to refuse uninvited signups.
 */
export async function acceptInvitationForEmail(params: {
  email: string
  name?: string | null
  image?: string | null
  emailVerified?: Date | null
}) {
  const email = params.email.toLowerCase()
  const invitation = await findPendingInvitationByEmail(email)
  if (!invitation) {
    throw new InvitationError('NOT_PENDING', 'Signup without a pending invitation is not allowed')
  }

  return prisma.$transaction(async (tx) => {
    // Anti-escalation (P1, defence in depth over A2): role and clientId come
    // EXCLUSIVELY from the invitation row — acceptance can never change them
    const user = await tx.user.create({
      data: {
        email,
        name: params.name ?? null,
        image: params.image ?? null,
        emailVerified: params.emailVerified ?? null,
        officeId: invitation.officeId,
        role: invitation.role,
        clientId: invitation.clientId,
      },
    })

    await tx.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    })

    await tx.auditLog.create({
      data: {
        officeId: invitation.officeId,
        userId: user.id,
        action: 'INVITATION_ACCEPTED',
        entityType: 'Invitation',
        entityId: invitation.id,
        metadata: { email, role: invitation.role },
      },
    })

    return user
  })
}
