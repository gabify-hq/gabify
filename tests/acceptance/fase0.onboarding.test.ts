import { describe, it, expect, beforeEach, vi } from 'vitest'
import { truncateAll, prisma } from '../helpers/db'
import { makeOffice, makeUser, makeTwoOffices } from '../helpers/factories'
import { setSession, authMockFactory, type TestSessionUser } from '../helpers/session'

vi.mock('@/lib/auth', () => authMockFactory())
vi.mock('@/lib/resend', () => ({
  resend: { emails: { send: vi.fn(async () => ({ data: { id: 'email-test' }, error: null })) } },
  FROM_EMAIL: 'no-reply@test.gabify.pt',
}))

import { GabifyAdapter } from '@/lib/auth-adapter'
import {
  createInvitation,
  validateInvitationToken,
  canRequestMagicLink,
} from '@/server/services/invitation-service'
import { bootstrapOffice } from '@/server/services/office-service'
import { POST as createInvitationRoute, GET as listInvitationsRoute } from '@/app/api/invitations/route'
import { DELETE as revokeInvitationRoute } from '@/app/api/invitations/[invitationId]/route'
import { POST as resendInvitationRoute } from '@/app/api/invitations/[invitationId]/resend/route'
import { DELETE as deleteUserRoute, PATCH as patchUserRoute } from '@/app/api/users/[userId]/route'
import { resetRateLimits } from '@/server/rate-limit'
import { NextRequest } from 'next/server'

function asSession(user: { id: string; email: string; officeId: string; role: TestSessionUser['role'] }) {
  setSession({ id: user.id, email: user.email, officeId: user.officeId, role: user.role })
}

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const adapter = () => GabifyAdapter(prisma)

describe('AC-0.1 Onboarding por convite (§0.1, A2)', () => {
  beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
    setSession(null)
  })

  it('AC-0.1.a [INV] — signup por magic link sem convite não cria user nem sessão; resposta neutra', async () => {
    await makeOffice('Office A')

    // Magic-link request path: unknown email without invitation must not even send the email,
    // and the caller cannot distinguish it from the success case (same neutral outcome).
    await expect(canRequestMagicLink('desconhecido@fora.pt')).resolves.toBe(false)

    // Defense in depth: even if the callback completes, the adapter refuses to create the user.
    await expect(
      adapter().createUser!({
        id: 'ignored',
        email: 'desconhecido@fora.pt',
        emailVerified: null,
      })
    ).rejects.toThrow()

    const users = await prisma.user.findMany()
    expect(users).toHaveLength(0)
    const sessions = await prisma.session.findMany()
    expect(sessions).toHaveLength(0)
  })

  it('AC-0.1.b [INV] — convite aceite cria user com officeId e role do convite e acceptedAt', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    await createInvitation({
      officeId: officeA.id,
      email: 'x@y.pt',
      role: 'ACCOUNTANT',
      invitedByUserId: ownerA.id,
    })

    const created = await adapter().createUser!({
      id: 'ignored',
      email: 'x@y.pt',
      emailVerified: new Date(),
    })

    const user = await prisma.user.findUnique({ where: { email: 'x@y.pt' } })
    expect(user).not.toBeNull()
    expect(user!.officeId).toBe(officeA.id)
    expect(user!.role).toBe('ACCOUNTANT')
    expect(created.email).toBe('x@y.pt')

    const invitation = await prisma.invitation.findFirst({ where: { email: 'x@y.pt' } })
    expect(invitation!.acceptedAt).not.toBeNull()

    // AuditLog INVITATION_ACCEPTED
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'INVITATION_ACCEPTED', officeId: officeA.id },
    })
    expect(audit).not.toBeNull()
  })

  it('AC-0.1.c [INV] — convite expirado é rejeitado; nenhum user criado', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const { invitation } = await createInvitation({
      officeId: officeA.id,
      email: 'tarde@y.pt',
      role: 'ACCOUNTANT',
      invitedByUserId: ownerA.id,
    })
    // Force expiry beyond the 72h window
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    await expect(
      adapter().createUser!({ id: 'ignored', email: 'tarde@y.pt', emailVerified: null })
    ).rejects.toThrow()

    expect(await prisma.user.findUnique({ where: { email: 'tarde@y.pt' } })).toBeNull()
    const inv = await prisma.invitation.findUnique({ where: { id: invitation.id } })
    expect(inv!.acceptedAt).toBeNull()
  })

  it('AC-0.1.c2 — convite para a@x.pt não serve para b@x.pt', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    await createInvitation({
      officeId: officeA.id,
      email: 'a@x.pt',
      role: 'ACCOUNTANT',
      invitedByUserId: ownerA.id,
    })

    await expect(
      adapter().createUser!({ id: 'ignored', email: 'b@x.pt', emailVerified: null })
    ).rejects.toThrow()
    expect(await prisma.user.findUnique({ where: { email: 'b@x.pt' } })).toBeNull()
  })

  it('AC-0.1.d [INV] — token de convite não é reutilizável após aceite', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const { token } = await createInvitation({
      officeId: officeA.id,
      email: 'once@y.pt',
      role: 'ACCOUNTANT',
      invitedByUserId: ownerA.id,
    })

    expect(await validateInvitationToken(token)).not.toBeNull()

    await adapter().createUser!({ id: 'ignored', email: 'once@y.pt', emailVerified: null })

    // Token dead after acceptance
    expect(await validateInvitationToken(token)).toBeNull()

    // And a second createUser for the same email must fail (no pending invitation left)
    await prisma.user.delete({ where: { email: 'once@y.pt' } })
    await expect(
      adapter().createUser!({ id: 'ignored', email: 'once@y.pt', emailVerified: null })
    ).rejects.toThrow()
  })

  it('AC-0.1.e [INV] — user aceite no officeA não vê dados do officeB', async () => {
    const { officeA, officeB, ownerA } = await makeTwoOffices()
    await prisma.client.create({
      data: { officeId: officeB.id, name: 'Cliente de B', emailDomains: [], knownEmails: [] },
    })
    await createInvitation({
      officeId: officeA.id,
      email: 'novo@y.pt',
      role: 'ACCOUNTANT',
      invitedByUserId: ownerA.id,
    })
    await adapter().createUser!({ id: 'ignored', email: 'novo@y.pt', emailVerified: null })
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'novo@y.pt' } })

    // Smoke: clients list scoped to the user's office returns nothing from B
    const { GET } = await import('@/app/api/clients/route')
    asSession({ id: user.id, email: user.email, officeId: user.officeId, role: user.role })
    const res = await GET(jsonRequest('/api/clients', 'GET'))
    const body = await res.json()
    const items = Array.isArray(body.data) ? body.data : body.data?.items ?? []
    expect(items).toHaveLength(0)
  })

  it('AC-0.1.f [INV] — só OWNER cria convites', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const accountant = await makeUser({ officeId: officeA.id, role: 'ACCOUNTANT' })
    const viewer = await makeUser({ officeId: officeA.id, role: 'VIEWER' })

    for (const blocked of [accountant, viewer]) {
      asSession({ id: blocked.id, email: blocked.email, officeId: officeA.id, role: blocked.role })
      const res = await createInvitationRoute(
        jsonRequest('/api/invitations', 'POST', { email: 'p@q.pt', role: 'ACCOUNTANT' })
      )
      expect([403, 404]).toContain(res.status)
    }
    expect(await prisma.invitation.count()).toBe(0)

    asSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })
    const ok = await createInvitationRoute(
      jsonRequest('/api/invitations', 'POST', { email: 'p@q.pt', role: 'ACCOUNTANT' })
    )
    expect(ok.status).toBe(201)
    expect(await prisma.invitation.count()).toBe(1)
  })

  it('AC-0.1.g — convite revogado deixa de ser aceitável', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const { invitation, token } = await createInvitation({
      officeId: officeA.id,
      email: 'rev@y.pt',
      role: 'ACCOUNTANT',
      invitedByUserId: ownerA.id,
    })

    asSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })
    const res = await revokeInvitationRoute(
      jsonRequest(`/api/invitations/${invitation.id}`, 'DELETE'),
      { params: Promise.resolve({ invitationId: invitation.id }) }
    )
    expect(res.status).toBe(200)

    expect(await validateInvitationToken(token)).toBeNull()
    await expect(
      adapter().createUser!({ id: 'ignored', email: 'rev@y.pt', emailVerified: null })
    ).rejects.toThrow()
  })

  it('AC-0.1.h [INV] — convite para email já registado noutro office → 409 EMAIL_ALREADY_REGISTERED', async () => {
    const { officeA, officeB, ownerA } = await makeTwoOffices()
    await makeUser({ officeId: officeB.id, email: 'ja@existe.pt' })

    asSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })
    const res = await createInvitationRoute(
      jsonRequest('/api/invitations', 'POST', { email: 'ja@existe.pt', role: 'ACCOUNTANT' })
    )
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(JSON.stringify(body)).toContain('EMAIL_ALREADY_REGISTERED')
  })

  it('AC-0.1.i [INV] — anti-lockout: não apagar nem despromover o único OWNER', async () => {
    const officeA = await makeOffice('Office A')
    const owner = await makeUser({ officeId: officeA.id, role: 'OWNER' })
    asSession({ id: owner.id, email: owner.email, officeId: officeA.id, role: 'OWNER' })

    const del = await deleteUserRoute(
      jsonRequest(`/api/users/${owner.id}`, 'DELETE'),
      { params: Promise.resolve({ userId: owner.id }) }
    )
    expect(del.status).toBe(409)

    const patch = await patchUserRoute(
      jsonRequest(`/api/users/${owner.id}`, 'PATCH', { role: 'VIEWER' }),
      { params: Promise.resolve({ userId: owner.id }) }
    )
    expect(patch.status).toBe(409)

    const stillOwner = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })
    expect(stillOwner.role).toBe('OWNER')
    expect(stillOwner.deletedAt).toBeNull()
  })

  it('AC-0.1.j — resend regenera token (antigo morre) e 6.º resend/hora → 429', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const { invitation, token: oldToken } = await createInvitation({
      officeId: officeA.id,
      email: 're@y.pt',
      role: 'ACCOUNTANT',
      invitedByUserId: ownerA.id,
    })
    asSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })

    const first = await resendInvitationRoute(
      jsonRequest(`/api/invitations/${invitation.id}/resend`, 'POST'),
      { params: Promise.resolve({ invitationId: invitation.id }) }
    )
    expect(first.status).toBe(200)
    expect(await validateInvitationToken(oldToken)).toBeNull()

    // 4 more resends (total 5 within the hour) are allowed; the 6th gets 429
    for (let i = 0; i < 4; i++) {
      const res = await resendInvitationRoute(
        jsonRequest(`/api/invitations/${invitation.id}/resend`, 'POST'),
        { params: Promise.resolve({ invitationId: invitation.id }) }
      )
      expect(res.status).toBe(200)
    }
    const sixth = await resendInvitationRoute(
      jsonRequest(`/api/invitations/${invitation.id}/resend`, 'POST'),
      { params: Promise.resolve({ invitationId: invitation.id }) }
    )
    expect(sixth.status).toBe(429)
  })

  it('AC-0.1.k — seed bootstrap idempotente cria Office + OWNER via serviços', async () => {
    const first = await bootstrapOffice({
      officeName: 'Gabinete Bootstrap',
      ownerEmail: 'owner@gabinete.pt',
      ownerName: 'Dono',
    })
    expect(first.created).toBe(true)

    const second = await bootstrapOffice({
      officeName: 'Gabinete Bootstrap',
      ownerEmail: 'owner@gabinete.pt',
      ownerName: 'Dono',
    })
    expect(second.created).toBe(false)

    expect(await prisma.office.count()).toBe(1)
    const owners = await prisma.user.findMany({ where: { email: 'owner@gabinete.pt' } })
    expect(owners).toHaveLength(1)
    expect(owners[0].role).toBe('OWNER')
  })

  it('AC-0.1.f2 — GET /api/invitations lista paginada só do office da sessão', async () => {
    const { officeA, officeB, ownerA, ownerB } = await makeTwoOffices()
    await createInvitation({ officeId: officeA.id, email: 'a1@y.pt', role: 'VIEWER', invitedByUserId: ownerA.id })
    await createInvitation({ officeId: officeB.id, email: 'b1@y.pt', role: 'VIEWER', invitedByUserId: ownerB.id })

    asSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })
    const res = await listInvitationsRoute(jsonRequest('/api/invitations', 'GET'))
    expect(res.status).toBe(200)
    const body = await res.json()
    const items = body.data?.items ?? body.data ?? []
    expect(items).toHaveLength(1)
    expect(items[0].email).toBe('a1@y.pt')
  })
})
