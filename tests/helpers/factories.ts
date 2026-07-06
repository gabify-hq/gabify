import { prisma } from '@/lib/prisma'
import { createOffice, createUserInOffice } from '@/server/services/office-service'
import { encryptToken } from '@/lib/crypto'
import type { ActionStatus, EmailProvider, UserRole } from '@prisma/client'

/**
 * Data factories for acceptance tests.
 *
 * Offices and users are created through the real services (never raw inserts)
 * so business invariants apply. Entities without a creation service yet
 * (email accounts, inbound emails, actions) are created via Prisma with the
 * same shape the production sync/parse code writes.
 */

let seq = 0
function next(): number {
  seq += 1
  return seq
}

export async function makeOffice(name = `Office ${next()}`) {
  return createOffice({ name })
}

export async function makeUser(params: {
  officeId: string
  role?: UserRole
  email?: string
  name?: string
}) {
  return createUserInOffice({
    officeId: params.officeId,
    email: params.email ?? `user${next()}@test.gabify.pt`,
    name: params.name ?? `User ${seq}`,
    role: params.role ?? 'ACCOUNTANT',
  })
}

/** Two isolated offices with an OWNER each — the standard multi-tenant fixture. */
export async function makeTwoOffices() {
  const officeA = await makeOffice('Office A')
  const officeB = await makeOffice('Office B')
  const ownerA = await makeUser({ officeId: officeA.id, role: 'OWNER' })
  const ownerB = await makeUser({ officeId: officeB.id, role: 'OWNER' })
  return { officeA, officeB, ownerA, ownerB }
}

export async function makeEmailAccount(params: {
  officeId: string
  provider?: EmailProvider
  email?: string
}) {
  const provider = params.provider ?? 'OUTLOOK'
  const base = {
    officeId: params.officeId,
    email: params.email ?? `inbox${next()}@test.gabify.pt`,
    provider,
    active: true,
  }
  if (provider === 'OUTLOOK') {
    return prisma.emailAccount.create({
      data: {
        ...base,
        outlookAccessToken: encryptToken('test-access-token'),
        outlookRefreshToken: encryptToken('test-refresh-token'),
        // Far in the future — providers never attempt a real token refresh in tests
        outlookTokenExpiry: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      },
    })
  }
  return prisma.emailAccount.create({
    data: {
      ...base,
      gmailAccessToken: encryptToken('test-access-token'),
      gmailRefreshToken: encryptToken('test-refresh-token'),
      gmailTokenExpiry: new Date(Date.now() + 365 * 24 * 3600 * 1000),
    },
  })
}

export async function makeInboundEmail(params: {
  emailAccountId: string
  clientId?: string | null
  fromEmail?: string
  subject?: string
}) {
  return prisma.inboundEmail.create({
    data: {
      emailAccountId: params.emailAccountId,
      clientId: params.clientId ?? null,
      providerMessageId: `msg-${next()}`,
      subject: params.subject ?? 'Documentos em anexo',
      fromEmail: params.fromEmail ?? `cliente${seq}@empresa.pt`,
      toEmails: [],
      ccEmails: [],
      bodyText: 'Segue em anexo a fatura.',
      receivedAt: new Date(),
      status: 'UNREAD',
    },
  })
}

export async function makeDraftAction(params: {
  inboundEmailId: string
  status?: ActionStatus
  draftContent?: string
}) {
  return prisma.emailAction.create({
    data: {
      inboundEmailId: params.inboundEmailId,
      type: 'DRAFT_REPLY',
      status: params.status ?? 'PENDING_REVIEW',
      draftContent: params.draftContent ?? 'Bom dia,\n\nRecebemos os documentos.\n\nCumprimentos',
      aiModel: 'claude-test',
    },
  })
}

export async function makeAttachment(params: {
  inboundEmailId: string
  filename?: string
  mimeType?: string
  providerAttachmentId?: string
}) {
  return prisma.emailAttachment.create({
    data: {
      inboundEmailId: params.inboundEmailId,
      providerAttachmentId: params.providerAttachmentId ?? `att-${next()}`,
      filename: params.filename ?? `fatura-${seq}.pdf`,
      mimeType: params.mimeType ?? 'application/pdf',
      sizeBytes: 1024,
    },
  })
}

export async function makeClient(params: { officeId: string; name?: string; nif?: string }) {
  return prisma.client.create({
    data: {
      officeId: params.officeId,
      name: params.name ?? `Cliente ${next()}`,
      nif: params.nif ?? null,
      emailDomains: [],
      knownEmails: [],
    },
  })
}
