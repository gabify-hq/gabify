import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { truncateAll, prisma } from '../helpers/db'
import { makeTwoOffices, makeUser, makeClient } from '../helpers/factories'
import { setSession, authMockFactory } from '../helpers/session'
import { resetRateLimits } from '@/server/rate-limit'
import { encryptToken, decryptToken } from '@/lib/crypto'
import {
  makeToconlineMock,
  MOCK_OAUTH_URL,
  MOCK_API_URL,
  MOCK_CLIENT_ID,
  MOCK_CLIENT_SECRET,
} from '../mocks/toconline-api'

vi.mock('@/lib/auth', () => authMockFactory())

const queueAddMock = vi.fn()
vi.mock('@/lib/redis', () => ({
  getEmailSyncQueue: () => ({ add: queueAddMock }),
  getDocumentParseQueue: () => ({ add: queueAddMock }),
  getSubscriptionRenewalQueue: () => ({ add: queueAddMock }),
  getToconlinePushQueue: () => ({ add: queueAddMock }),
  QUEUE_EMAIL_SYNC: 'email-sync',
  QUEUE_DOCUMENT_PARSE: 'document-parse',
  QUEUE_SUBSCRIPTION_RENEWAL: 'subscription-renewal',
  QUEUE_TOCONLINE_PUSH: 'toconline-push',
  DEFAULT_JOB_OPTIONS: {},
  redisConnection: {},
}))

// 🔴RED — routes and the fetch seam do not exist until the implementation lands
import {
  GET as getConnectionRoute,
  PUT as putConnectionRoute,
  DELETE as deleteConnectionRoute,
} from '@/app/api/clients/[clientId]/toconline/route'
import { POST as dryRunRoute } from '@/app/api/clients/[clientId]/toconline/dry-run/route'
import { POST as pushRoute } from '@/app/api/toconline/push/route'
import { GET as documentToconlineRoute } from '@/app/api/documents/[documentId]/toconline/route'
import { setToconlineFetchForTests } from '@/server/toconline/fetch-provider'

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const clientParams = (clientId: string) => ({ params: Promise.resolve({ clientId }) })
const documentParams = (documentId: string) => ({ params: Promise.resolve({ documentId }) })

const CONNECT_BODY = {
  oauthUrl: MOCK_OAUTH_URL,
  apiUrl: MOCK_API_URL,
  oauthClientId: MOCK_CLIENT_ID,
  oauthClientSecret: MOCK_CLIENT_SECRET,
}

async function seedConnection(officeId: string, clientId: string, dryRun = true) {
  return prisma.toconlineConnection.create({
    data: {
      officeId,
      clientId,
      oauthUrl: MOCK_OAUTH_URL,
      apiUrl: MOCK_API_URL,
      oauthClientId: MOCK_CLIENT_ID,
      oauthClientSecret: encryptToken(MOCK_CLIENT_SECRET),
      dryRun,
    },
  })
}

async function makeValidatedInvoice(officeId: string, clientId: string) {
  return prisma.document.create({
    data: {
      officeId,
      clientId,
      status: 'VALIDATED',
      type: 'INVOICE_RECEIVED',
      supplierName: 'Fornecedor Lda',
      supplierNif: '509888777',
      issueDate: new Date('2026-06-15T12:00:00.000Z'),
      currency: 'EUR',
      totalAmount: '123.00',
      vatBreakdown: [{ rate: 23, baseCents: 10000, vatCents: 2300 }] as never,
    },
  })
}

describe('🔴RED TOConline — rotas API (ligação, dry-run, push, previews)', () => {
  beforeEach(async () => {
    await truncateAll()
    setSession(null)
    resetRateLimits()
    queueAddMock.mockReset()
    setToconlineFetchForTests(null)
  })

  it('TR.a PUT cria a ligação validando o OAuth contra o mock; segredos nunca saem na resposta', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const client = await makeClient({ officeId: officeA.id })
    const mock = makeToconlineMock()
    setToconlineFetchForTests(mock.fetchImpl)
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })

    const res = await putConnectionRoute(
      jsonRequest(`/api/clients/${client.id}/toconline`, 'PUT', CONNECT_BODY),
      clientParams(client.id),
    )
    expect(res.status).toBe(200)
    const bodyText = await res.text()
    expect(bodyText).not.toContain(MOCK_CLIENT_SECRET) // secret never in a response
    const body = JSON.parse(bodyText) as {
      success: boolean
      data: { status: string; dryRun: boolean }
    }
    expect(body.success).toBe(true)
    expect(body.data.status).toBe('ACTIVE') // OAuth ran against the mock
    expect(body.data.dryRun).toBe(true) // dry-run is the birth state [INV]

    const row = await prisma.toconlineConnection.findUniqueOrThrow({
      where: { clientId: client.id },
    })
    expect(row.oauthClientSecret).not.toBe(MOCK_CLIENT_SECRET) // encrypted at rest
    expect(decryptToken(row.oauthClientSecret)).toBe(MOCK_CLIENT_SECRET)
    expect(row.accessToken).not.toBeNull()

    const audit = await prisma.auditLog.findFirst({
      where: { officeId: officeA.id, action: 'TOCONLINE_CONNECTION_SAVED' },
    })
    expect(audit).not.toBeNull()
  })

  it('TR.b cross-tenant → 404 em TODAS as rotas novas [INV]', async () => {
    const { officeA, officeB, ownerB } = await makeTwoOffices()
    const clientA = await makeClient({ officeId: officeA.id })
    await seedConnection(officeA.id, clientA.id)
    const docA = await makeValidatedInvoice(officeA.id, clientA.id)

    setSession({ id: ownerB.id, email: ownerB.email, officeId: officeB.id, role: 'OWNER' })

    const attempts: Array<[string, Promise<Response>]> = [
      [
        'GET connection',
        getConnectionRoute(
          jsonRequest(`/api/clients/${clientA.id}/toconline`, 'GET'),
          clientParams(clientA.id),
        ),
      ],
      [
        'PUT connection',
        putConnectionRoute(
          jsonRequest(`/api/clients/${clientA.id}/toconline`, 'PUT', CONNECT_BODY),
          clientParams(clientA.id),
        ),
      ],
      [
        'DELETE connection',
        deleteConnectionRoute(
          jsonRequest(`/api/clients/${clientA.id}/toconline`, 'DELETE'),
          clientParams(clientA.id),
        ),
      ],
      [
        'POST dry-run',
        dryRunRoute(
          jsonRequest(`/api/clients/${clientA.id}/toconline/dry-run`, 'POST', { dryRun: true }),
          clientParams(clientA.id),
        ),
      ],
      [
        'POST push',
        pushRoute(
          jsonRequest('/api/toconline/push', 'POST', {
            clientId: clientA.id,
            documentIds: [docA.id],
          }),
        ),
      ],
      [
        'GET document toconline',
        documentToconlineRoute(
          jsonRequest(`/api/documents/${docA.id}/toconline`, 'GET'),
          documentParams(docA.id),
        ),
      ],
    ]
    for (const [label, promise] of attempts) {
      const res = await promise
      expect(res.status, `${label} must be 404 cross-tenant`).toBe(404)
    }

    // Nothing leaked or changed in office A
    expect(await prisma.toconlineConnection.count({ where: { officeId: officeA.id } })).toBe(1)
    expect(queueAddMock).not.toHaveBeenCalled()
  })

  it('TR.c VIEWER lê estado mas não gere a ligação nem faz push', async () => {
    const { officeA } = await makeTwoOffices()
    const viewer = await makeUser({ officeId: officeA.id, role: 'VIEWER' })
    const client = await makeClient({ officeId: officeA.id })
    await seedConnection(officeA.id, client.id)
    const doc = await makeValidatedInvoice(officeA.id, client.id)
    setSession({ id: viewer.id, email: viewer.email, officeId: officeA.id, role: 'VIEWER' })

    const read = await getConnectionRoute(
      jsonRequest(`/api/clients/${client.id}/toconline`, 'GET'),
      clientParams(client.id),
    )
    expect(read.status).toBe(200)
    expect(await read.text()).not.toContain(MOCK_CLIENT_SECRET)

    const write = await putConnectionRoute(
      jsonRequest(`/api/clients/${client.id}/toconline`, 'PUT', CONNECT_BODY),
      clientParams(client.id),
    )
    expect(write.status).toBe(404)

    const push = await pushRoute(
      jsonRequest('/api/toconline/push', 'POST', { clientId: client.id, documentIds: [doc.id] }),
    )
    expect(push.status).toBe(404)
    expect(queueAddMock).not.toHaveBeenCalled()
  })

  it('TR.d desligar dry-run é OWNER-only, com AuditLog; voltar a ligar é manage', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const accountant = await makeUser({ officeId: officeA.id, role: 'ACCOUNTANT' })
    const client = await makeClient({ officeId: officeA.id })
    await seedConnection(officeA.id, client.id, true)

    // ACCOUNTANT cannot go live
    setSession({ id: accountant.id, email: accountant.email, officeId: officeA.id, role: 'ACCOUNTANT' })
    const denied = await dryRunRoute(
      jsonRequest(`/api/clients/${client.id}/toconline/dry-run`, 'POST', { dryRun: false }),
      clientParams(client.id),
    )
    expect(denied.status).toBe(404)
    let row = await prisma.toconlineConnection.findUniqueOrThrow({ where: { clientId: client.id } })
    expect(row.dryRun).toBe(true)

    // OWNER can — audited
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })
    const allowed = await dryRunRoute(
      jsonRequest(`/api/clients/${client.id}/toconline/dry-run`, 'POST', { dryRun: false }),
      clientParams(client.id),
    )
    expect(allowed.status).toBe(200)
    row = await prisma.toconlineConnection.findUniqueOrThrow({ where: { clientId: client.id } })
    expect(row.dryRun).toBe(false)
    const audit = await prisma.auditLog.findFirst({
      where: { officeId: officeA.id, action: 'TOCONLINE_DRY_RUN_DISABLED', userId: ownerA.id },
    })
    expect(audit).not.toBeNull()

    // Re-enabling dry-run (safer direction) only needs manage
    setSession({ id: accountant.id, email: accountant.email, officeId: officeA.id, role: 'ACCOUNTANT' })
    const reEnable = await dryRunRoute(
      jsonRequest(`/api/clients/${client.id}/toconline/dry-run`, 'POST', { dryRun: true }),
      clientParams(client.id),
    )
    expect(reEnable.status).toBe(200)
  })

  it('TR.e POST /api/toconline/push valida elegibilidade por item e enfileira só os aptos', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const client = await makeClient({ officeId: officeA.id })
    await seedConnection(officeA.id, client.id)
    const eligible = await makeValidatedInvoice(officeA.id, client.id)
    const notValidated = await prisma.document.create({
      data: {
        officeId: officeA.id,
        clientId: client.id,
        status: 'NEEDS_REVIEW',
        type: 'INVOICE_RECEIVED',
        currency: 'EUR',
      },
    })
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })

    const res = await pushRoute(
      jsonRequest('/api/toconline/push', 'POST', {
        clientId: client.id,
        documentIds: [eligible.id, notValidated.id],
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: { items: Array<{ documentId: string; queued: boolean; error?: string }> }
    }
    const byId = new Map(body.data.items.map((i) => [i.documentId, i]))
    expect(byId.get(eligible.id)?.queued).toBe(true)
    expect(byId.get(notValidated.id)?.queued).toBe(false)
    expect(byId.get(notValidated.id)?.error).toBeTruthy()

    expect(queueAddMock).toHaveBeenCalledTimes(1)
    const [, jobData] = queueAddMock.mock.calls[0]
    expect(jobData).toMatchObject({ documentId: eligible.id, officeId: officeA.id })

    const queuedDoc = await prisma.document.findUniqueOrThrow({ where: { id: eligible.id } })
    expect(queuedDoc.toconlinePushStatus).toBe('PENDING')
  })

  it('TR.f GET /api/documents/[id]/toconline devolve estado + previews sem segredos', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const client = await makeClient({ officeId: officeA.id })
    const connection = await seedConnection(officeA.id, client.id)
    const doc = await makeValidatedInvoice(officeA.id, client.id)
    await prisma.toconlinePushPreview.create({
      data: {
        connectionId: connection.id,
        documentId: doc.id,
        endpoint: '/api/v1/commercial_purchases_documents',
        method: 'POST',
        headers: { 'Content-Type': 'application/vnd.api+json', Authorization: 'Bearer [REDACTED]' },
        body: { document_type: 'FC', lines: [] },
      },
    })
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })

    const res = await documentToconlineRoute(
      jsonRequest(`/api/documents/${doc.id}/toconline`, 'GET'),
      documentParams(doc.id),
    )
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain(MOCK_CLIENT_SECRET)
    const body = JSON.parse(text) as {
      success: boolean
      data: {
        pushStatus: string | null
        previews: Array<{ endpoint: string; method: string }>
      }
    }
    expect(body.data.previews).toHaveLength(1)
    expect(body.data.previews[0].endpoint).toBe('/api/v1/commercial_purchases_documents')
  })
})
