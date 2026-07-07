import { prisma } from '@/lib/prisma'
import type { Office, User, UserRole } from '@prisma/client'

/**
 * Office and user creation services.
 *
 * These are the ONLY sanctioned ways to create offices and users outside the
 * invitation flow — the auth adapter never creates offices (S0.1 closed onboarding).
 */

export async function createOffice(params: { name: string; nif?: string | null }): Promise<Office> {
  return prisma.office.create({
    data: { name: params.name, nif: params.nif ?? null },
  })
}

export async function createUserInOffice(params: {
  officeId: string
  email: string
  role: UserRole
  name?: string | null
  /** Required when role=CLIENT, forbidden otherwise (fase P1). */
  clientId?: string | null
}): Promise<User> {
  const clientId = params.clientId ?? null
  // Application-level mirror of the DB CHECK constraints (fail fast, clear message)
  if (params.role === 'CLIENT' && !clientId) {
    throw new Error('A CLIENT user requires a clientId')
  }
  if (params.role !== 'CLIENT' && clientId) {
    throw new Error('Only CLIENT users may have a clientId')
  }
  return prisma.user.create({
    data: {
      officeId: params.officeId,
      email: params.email.toLowerCase(),
      name: params.name ?? null,
      role: params.role,
      clientId,
    },
  })
}

export interface BootstrapResult {
  office: Office
  owner: User
  /** false when the bootstrap had already run (idempotent re-run). */
  created: boolean
}

/**
 * Bootstraps the first Office + OWNER. Idempotent: if the owner email already
 * exists, returns the existing pair without creating anything.
 */
export async function bootstrapOffice(params: {
  officeName: string
  ownerEmail: string
  ownerName?: string
}): Promise<BootstrapResult> {
  const email = params.ownerEmail.toLowerCase()

  const existing = await prisma.user.findUnique({
    where: { email },
    include: { office: true },
  })
  if (existing) {
    return { office: existing.office, owner: existing, created: false }
  }

  const office = await createOffice({ name: params.officeName })
  const owner = await createUserInOffice({
    officeId: office.id,
    email,
    role: 'OWNER',
    name: params.ownerName ?? null,
  })

  await prisma.auditLog.create({
    data: {
      officeId: office.id,
      userId: owner.id,
      action: 'OFFICE_BOOTSTRAPPED',
      entityType: 'Office',
      entityId: office.id,
      metadata: { ownerEmail: email },
    },
  })

  return { office, owner, created: true }
}
