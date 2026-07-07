import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { truncateAll, prisma } from '../helpers/db'
import { makeTwoOffices, makeClient } from '../helpers/factories'
import { setSession, authMockFactory } from '../helpers/session'
import { resetRateLimits } from '@/server/rate-limit'
import { encryptToken } from '@/lib/crypto'
import { MOCK_OAUTH_URL, MOCK_API_URL, MOCK_CLIENT_ID, MOCK_CLIENT_SECRET } from '../mocks/toconline-api'

vi.mock('@/lib/auth', () => authMockFactory())

const queueAddMock = vi.fn(async () => ({}))
vi.mock('@/lib/redis', () => ({
  getEmailSyncQueue: () => ({ add: queueAddMock }),
  getDocumentParseQueue: () => ({ add: queueAddMock }),
  getToconlinePushQueue: () => ({ add: queueAddMock }),
  getToconlinePullQueue: () => ({ add: queueAddMock }),
  QUEUE_EMAIL_SYNC: 'email-sync',
  QUEUE_DOCUMENT_PARSE: 'document-parse',
  QUEUE_SUBSCRIPTION_RENEWAL: 'subscription-renewal',
  QUEUE_TOCONLINE_PUSH: 'toconline-push',
  QUEUE_TOCONLINE_PULL: 'toconline-pull',
  DEFAULT_JOB_OPTIONS: {},
  redisConnection: {},
}))

// 🔴RED — PATCH (capabilities) and the pull route do not exist yet
import { PATCH as patchConnectionRoute } from '@/app/api/clients/[clientId]/toconline/route'
import { POST as pullNowRoute } from '@/app/api/clients/[clientId]/toconline/pull/route'
import { POST as pushRoute } from '@/app/api/toconline/push/route'
import { getPushEligibilityError } from '@/server/toconline/toconline-push-service'

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const clientParams = (clientId: string) => ({ params: Promise.resolve({ clientId }) })

async function seedConnection(
  officeId: string,
  clientId: string,
  overrides: Partial<{ pushEnabled: boolean; pullEnabled: boolean; dryRun: boolean }> = {},
) {
  return prisma.toconlineConnection.create({
    data: {
      officeId,
      clientId,
      oauthUrl: MOCK_OAUTH_URL,
      apiUrl: MOCK_API_URL,
      oauthClientId: MOCK_CLIENT_ID,
      oauthClientSecret: encryptToken(MOCK_CLIENT_SECRET),
      dryRun: overrides.dryRun ?? true,
      pushEnabled: overrides.pushEnabled ?? true,
      pullEnabled: overrides.pullEnabled ?? false,
    },
  })
}

describe('🔴RED TOConline — Ligações (destino único, toggles, sync agora)', () => {
  beforeEach(async () => {
    await truncateAll()
    setSession(null)
    resetRateLimits()
    queueAddMock.mockReset()
  })

  it('TL.a [INV] segunda ligação com push ativo para o mesmo cliente → 409 (rota) e constraint na BD', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const client = await makeClient({ officeId: officeA.id })
    await seedConnection(officeA.id, client.id, { pushEnabled: true })

    // DB-level: the partial unique index refuses a second push-enabled row
    await expect(
      seedConnection(officeA.id, client.id, { pushEnabled: true }),
    ).rejects.toThrowError()

    // A second connection may exist as pull-only source…
    const second = await seedConnection(officeA.id, client.id, {
      pushEnabled: false,
      pullEnabled: true,
    })

    // …but enabling push on it while another push destination exists → 409
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })
    const res = await patchConnectionRoute(
      jsonRequest(`/api/clients/${client.id}/toconline`, 'PATCH', {
        connectionId: second.id,
        pushEnabled: true,
      }),
      clientParams(client.id),
    )
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string }
    expect(body.error.length).toBeGreaterThan(10) // clear PT message, not a code

    const row = await prisma.toconlineConnection.findUniqueOrThrow({ where: { id: second.id } })
    expect(row.pushEnabled).toBe(false) // nothing changed
  })

  it('TL.b toggles pull/push independentes persistem', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const client = await makeClient({ officeId: officeA.id })
    const connection = await seedConnection(officeA.id, client.id, {
      pushEnabled: true,
      pullEnabled: false,
    })
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })

    // Enable pull — push untouched
    const enablePull = await patchConnectionRoute(
      jsonRequest(`/api/clients/${client.id}/toconline`, 'PATCH', { pullEnabled: true }),
      clientParams(client.id),
    )
    expect(enablePull.status).toBe(200)
    let row = await prisma.toconlineConnection.findUniqueOrThrow({ where: { id: connection.id } })
    expect(row.pullEnabled).toBe(true)
    expect(row.pushEnabled).toBe(true)

    // Disable push — pull untouched
    const disablePush = await patchConnectionRoute(
      jsonRequest(`/api/clients/${client.id}/toconline`, 'PATCH', { pushEnabled: false }),
      clientParams(client.id),
    )
    expect(disablePush.status).toBe(200)
    row = await prisma.toconlineConnection.findUniqueOrThrow({ where: { id: connection.id } })
    expect(row.pullEnabled).toBe(true)
    expect(row.pushEnabled).toBe(false)

    // Re-enable push (no other destination) — allowed
    const reEnable = await patchConnectionRoute(
      jsonRequest(`/api/clients/${client.id}/toconline`, 'PATCH', { pushEnabled: true }),
      clientParams(client.id),
    )
    expect(reEnable.status).toBe(200)
  })

  it('TL.c cross-tenant → 404 nas rotas novas (PATCH capabilities, POST pull) [INV]', async () => {
    const { officeA, officeB, ownerB } = await makeTwoOffices()
    const clientA = await makeClient({ officeId: officeA.id })
    await seedConnection(officeA.id, clientA.id, { pullEnabled: true })

    setSession({ id: ownerB.id, email: ownerB.email, officeId: officeB.id, role: 'OWNER' })

    const patchRes = await patchConnectionRoute(
      jsonRequest(`/api/clients/${clientA.id}/toconline`, 'PATCH', { pullEnabled: false }),
      clientParams(clientA.id),
    )
    expect(patchRes.status).toBe(404)

    const pullRes = await pullNowRoute(
      jsonRequest(`/api/clients/${clientA.id}/toconline/pull`, 'POST', {}),
      clientParams(clientA.id),
    )
    expect(pullRes.status).toBe(404)
    expect(queueAddMock).not.toHaveBeenCalled()

    const row = await prisma.toconlineConnection.findFirstOrThrow({
      where: { clientId: clientA.id },
    })
    expect(row.pullEnabled).toBe(true) // untouched
  })

  it('TL.d "Sincronizar agora" enfileira job toconline-pull; exige pullEnabled', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const client = await makeClient({ officeId: officeA.id })
    const connection = await seedConnection(officeA.id, client.id, { pullEnabled: true })
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })

    const ok = await pullNowRoute(
      jsonRequest(`/api/clients/${client.id}/toconline/pull`, 'POST', {}),
      clientParams(client.id),
    )
    expect(ok.status).toBe(200)
    expect(queueAddMock).toHaveBeenCalledTimes(1)
    const [, jobData] = queueAddMock.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(jobData).toMatchObject({ connectionId: connection.id, officeId: officeA.id })

    await prisma.toconlineConnection.update({
      where: { id: connection.id },
      data: { pullEnabled: false },
    })
    const refused = await pullNowRoute(
      jsonRequest(`/api/clients/${client.id}/toconline/pull`, 'POST', {}),
      clientParams(client.id),
    )
    expect(refused.status).toBe(422)
    expect(queueAddMock).toHaveBeenCalledTimes(1) // nothing new queued
  })

  it('TL.e [INV] documentos EMITIDOS/API_PULL nunca entram no push', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const client = await makeClient({ officeId: officeA.id })
    await seedConnection(officeA.id, client.id, { pushEnabled: true })
    const pulled = await prisma.document.create({
      data: {
        officeId: officeA.id,
        clientId: client.id,
        source: 'API_PULL',
        type: 'INVOICE_ISSUED',
        status: 'VALIDATED',
        currency: 'EUR',
        supplierNif: '509888771',
        supplierName: 'X',
        issueDate: new Date('2026-06-20T12:00:00.000Z'),
        vatBreakdown: [{ rate: 23, baseCents: 1000, vatCents: 230 }] as never,
      },
    })
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })

    const res = await pushRoute(
      jsonRequest('/api/toconline/push', 'POST', {
        clientId: client.id,
        documentIds: [pulled.id],
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: { items: Array<{ documentId: string; queued: boolean; error?: string }> }
    }
    expect(body.data.items[0].queued).toBe(false)
    expect(body.data.items[0].error).toBeTruthy()
    expect(queueAddMock).not.toHaveBeenCalled()

    // Defense in depth: eligibility refuses API_PULL even with an eligible type
    const receivedButPulled = await prisma.document.create({
      data: {
        officeId: officeA.id,
        clientId: client.id,
        source: 'API_PULL',
        type: 'INVOICE_RECEIVED',
        status: 'VALIDATED',
        currency: 'EUR',
        supplierNif: '509888771',
        supplierName: 'X',
        issueDate: new Date('2026-06-20T12:00:00.000Z'),
        vatBreakdown: [{ rate: 23, baseCents: 1000, vatCents: 230 }] as never,
      },
    })
    expect(getPushEligibilityError(receivedButPulled)).toBeTruthy()
  })

  it('TL.f push desligado na ligação → push recusado com mensagem clara', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const client = await makeClient({ officeId: officeA.id })
    await seedConnection(officeA.id, client.id, { pushEnabled: false, pullEnabled: true })
    const doc = await prisma.document.create({
      data: {
        officeId: officeA.id,
        clientId: client.id,
        source: 'MANUAL_UPLOAD',
        type: 'INVOICE_RECEIVED',
        status: 'VALIDATED',
        currency: 'EUR',
        supplierNif: '509888771',
        supplierName: 'Fornecedor',
        issueDate: new Date('2026-06-15T12:00:00.000Z'),
        vatBreakdown: [{ rate: 23, baseCents: 1000, vatCents: 230 }] as never,
      },
    })
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })

    const res = await pushRoute(
      jsonRequest('/api/toconline/push', 'POST', { clientId: client.id, documentIds: [doc.id] }),
    )
    expect(res.status).toBe(422)
    expect(queueAddMock).not.toHaveBeenCalled()
  })
})
