import { describe, it, expect, beforeEach, vi } from 'vitest'
import { truncateAll, prisma } from '../helpers/db'
import { makeTwoOffices, makeClient, makeUser } from '../helpers/factories'
import { setSession, authMockFactory } from '../helpers/session'
import { NextRequest } from 'next/server'
import { resetRateLimits } from '@/server/rate-limit'

vi.mock('@/lib/auth', () => authMockFactory())
vi.mock('@/lib/r2', async () => (await import('../mocks/r2')).r2MockFactory())

import { createInvitation } from '@/server/services/invitation-service'

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('P3 — gestão de acessos do portal na ficha do cliente', () => {
  beforeEach(async () => {
    await truncateAll()
    setSession(null)
    resetRateLimits()
  })

  it('GET portal-access lista users e convites do cliente (OWNER e ACCOUNTANT); VIEWER negado', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const clientX = await makeClient({ officeId: officeA.id, name: 'Empresa X' })
    const clientY = await makeClient({ officeId: officeA.id, name: 'Empresa Y' })
    const portalUser = await makeUser({
      officeId: officeA.id, role: 'CLIENT', clientId: clientX.id, email: 'portal@x.pt',
    })
    // User de OUTRO cliente — nunca pode aparecer na lista do X
    await makeUser({ officeId: officeA.id, role: 'CLIENT', clientId: clientY.id, email: 'portal@y.pt' })
    await createInvitation({
      officeId: officeA.id, email: 'novo@x.pt', role: 'CLIENT',
      clientId: clientX.id, invitedByUserId: ownerA.id,
    })

    const { GET } = await import('@/app/api/clients/[clientId]/portal-access/route')

    for (const role of ['OWNER', 'ACCOUNTANT'] as const) {
      const user = role === 'OWNER' ? ownerA : await makeUser({ officeId: officeA.id, role })
      setSession({ id: user.id, email: user.email, officeId: officeA.id, role })
      const res = await GET(jsonRequest(`/api/clients/${clientX.id}/portal-access`, 'GET'), {
        params: Promise.resolve({ clientId: clientX.id }),
      })
      expect(res.status, role).toBe(200)
      const data = (await res.json()).data
      expect(data.users).toHaveLength(1)
      expect(data.users[0].email).toBe(portalUser.email)
      expect(data.invitations).toHaveLength(1)
      expect(data.invitations[0].email).toBe('novo@x.pt')
      expect(data.invitations[0].state).toBe('pendente')
    }

    const viewer = await makeUser({ officeId: officeA.id, role: 'VIEWER' })
    setSession({ id: viewer.id, email: viewer.email, officeId: officeA.id, role: 'VIEWER' })
    const denied = await GET(jsonRequest(`/api/clients/${clientX.id}/portal-access`, 'GET'), {
      params: Promise.resolve({ clientId: clientX.id }),
    })
    expect([403, 404]).toContain(denied.status)
  })

  it('[INV] cross-tenant: cliente de outro office → 404', async () => {
    const { officeA, officeB, ownerB } = await makeTwoOffices()
    const clientA = await makeClient({ officeId: officeA.id })
    setSession({ id: ownerB.id, email: ownerB.email, officeId: officeB.id, role: 'OWNER' })

    const { GET } = await import('@/app/api/clients/[clientId]/portal-access/route')
    const res = await GET(jsonRequest(`/api/clients/${clientA.id}/portal-access`, 'GET'), {
      params: Promise.resolve({ clientId: clientA.id }),
    })
    expect(res.status).toBe(404)
  })

  it('[INV] revogar acesso: soft-delete do user CLIENT, sessões apagadas, AuditLog', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const clientX = await makeClient({ officeId: officeA.id })
    const portalUser = await makeUser({
      officeId: officeA.id, role: 'CLIENT', clientId: clientX.id, email: 'portal@x.pt',
    })
    await prisma.session.create({
      data: {
        userId: portalUser.id,
        sessionToken: 'portal-session-token',
        expires: new Date(Date.now() + 86_400_000),
      },
    })
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })

    const { DELETE } = await import(
      '@/app/api/clients/[clientId]/portal-access/[userId]/route'
    )
    const res = await DELETE(
      jsonRequest(`/api/clients/${clientX.id}/portal-access/${portalUser.id}`, 'DELETE'),
      { params: Promise.resolve({ clientId: clientX.id, userId: portalUser.id }) },
    )
    expect(res.status).toBe(200)

    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: portalUser.id } })
    expect(fresh.deletedAt).not.toBeNull()
    expect(await prisma.session.count({ where: { userId: portalUser.id } })).toBe(0)

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'PORTAL_ACCESS_REVOKED', entityId: portalUser.id },
    })
    expect(audit).not.toBeNull()
    expect(audit!.userId).toBe(ownerA.id)
  })

  it('[INV] revogar nunca toca users internos nem CLIENTs de outro cliente → 404', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const clientX = await makeClient({ officeId: officeA.id })
    const clientY = await makeClient({ officeId: officeA.id })
    const accountant = await makeUser({ officeId: officeA.id, role: 'ACCOUNTANT' })
    const portalUserY = await makeUser({
      officeId: officeA.id, role: 'CLIENT', clientId: clientY.id, email: 'portal@y.pt',
    })
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })

    const { DELETE } = await import(
      '@/app/api/clients/[clientId]/portal-access/[userId]/route'
    )

    // Interno via rota de portal-access → 404, intocado
    const internal = await DELETE(
      jsonRequest(`/api/clients/${clientX.id}/portal-access/${accountant.id}`, 'DELETE'),
      { params: Promise.resolve({ clientId: clientX.id, userId: accountant.id }) },
    )
    expect(internal.status).toBe(404)
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: accountant.id } })).deletedAt,
    ).toBeNull()

    // CLIENT do cliente Y via clientId X → 404, intocado
    const wrongClient = await DELETE(
      jsonRequest(`/api/clients/${clientX.id}/portal-access/${portalUserY.id}`, 'DELETE'),
      { params: Promise.resolve({ clientId: clientX.id, userId: portalUserY.id }) },
    )
    expect(wrongClient.status).toBe(404)
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: portalUserY.id } })).deletedAt,
    ).toBeNull()
  })

  it('CLIENT nunca acede à gestão de acessos (nem à do seu próprio cliente)', async () => {
    const { officeA } = await makeTwoOffices()
    const clientX = await makeClient({ officeId: officeA.id })
    const portalUser = await makeUser({
      officeId: officeA.id, role: 'CLIENT', clientId: clientX.id, email: 'portal@x.pt',
    })
    setSession({
      id: portalUser.id, email: portalUser.email, officeId: officeA.id,
      role: 'CLIENT', clientId: clientX.id,
    })

    const { GET } = await import('@/app/api/clients/[clientId]/portal-access/route')
    const res = await GET(jsonRequest(`/api/clients/${clientX.id}/portal-access`, 'GET'), {
      params: Promise.resolve({ clientId: clientX.id }),
    })
    expect([403, 404]).toContain(res.status)
  })
})
