import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { truncateAll, prisma } from '../helpers/db'
import { makeOffice, makeUser, makeEmailAccount } from '../helpers/factories'
import { setSession, authMockFactory } from '../helpers/session'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => authMockFactory())

const queueAddMock = vi.fn(async () => ({}))
vi.mock('@/lib/redis', () => ({
  getEmailSyncQueue: () => ({ add: queueAddMock }),
  getDocumentParseQueue: () => ({ add: queueAddMock }),
  QUEUE_EMAIL_SYNC: 'email-sync',
  QUEUE_DOCUMENT_PARSE: 'document-parse',
  QUEUE_SUBSCRIPTION_RENEWAL: 'subscription-renewal',
  DEFAULT_JOB_OPTIONS: {},
  redisConnection: {},
}))

import { processSubscriptionRenewal } from '@/queues/subscription-renewal.processor'
import { hasActiveWebhook, shouldPollOnTick, WEBHOOK_POLL_EVERY_N_TICKS } from '@/queues/polling-policy'
import { validateSecurityEnv } from '@/lib/env-check'

function stubFetchRoutes(routes: Array<[string, (url: string, init?: RequestInit) => object]>) {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    for (const [match, handler] of routes) {
      if (url.includes(match)) {
        return new Response(JSON.stringify(handler(url, init)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }
    throw new Error(`Unexpected fetch in test: ${url}`)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('AC-1.3 Webhooks ativos (§1.3)', () => {
  beforeEach(async () => {
    await truncateAll()
    queueAddMock.mockClear()
    setSession(null)
    process.env.GRAPH_WEBHOOK_SECRET = 'test-graph-secret'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('AC-1.3.a — callback OAuth Outlook cria subscrição (mock) e persiste subscriptionId + expiry', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    setSession({ id: owner.id, email: owner.email, officeId: office.id, role: 'OWNER' })

    const expirationDateTime = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
    stubFetchRoutes([
      ['/oauth2/v2.0/token', () => ({
        access_token: 'at-1',
        refresh_token: 'rt-1',
        expires_in: 3600,
        token_type: 'Bearer',
      })],
      ['/v1.0/me', () => ({ id: 'ms-user-1', mail: 'caixa@gabinete.pt', displayName: 'Caixa' })],
      ['/v1.0/subscriptions', () => ({ id: 'sub-created-1', expirationDateTime })],
    ])

    const { GET } = await import('@/app/api/auth/outlook/callback/route')
    const req = new NextRequest(
      'http://localhost:3000/api/auth/outlook/callback?code=abc&state=st-1',
      { headers: { cookie: 'outlook_oauth_state=st-1' } }
    )
    const res = await GET(req)
    expect([302, 307]).toContain(res.status)

    const account = await prisma.emailAccount.findFirstOrThrow({
      where: { officeId: office.id, provider: 'OUTLOOK' },
    })
    expect(account.outlookSubscriptionId).toBe('sub-created-1')
    expect(account.outlookSubscriptionExpiry).not.toBeNull()
  })

  it('AC-1.3.a2 [INV] — callback com state CSRF inválido não cria conta', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    setSession({ id: owner.id, email: owner.email, officeId: office.id, role: 'OWNER' })

    stubFetchRoutes([])

    const { GET } = await import('@/app/api/auth/outlook/callback/route')
    const req = new NextRequest(
      'http://localhost:3000/api/auth/outlook/callback?code=abc&state=WRONG',
      { headers: { cookie: 'outlook_oauth_state=st-1' } }
    )
    const res = await GET(req)
    expect([302, 307]).toContain(res.status)
    expect(res.headers.get('location')).toContain('error')

    expect(await prisma.emailAccount.count()).toBe(0)
  })

  it('AC-1.3.b — renovação: subscrição a expirar é renovada; falha limpa a subscrição e regista erro', async () => {
    const office = await makeOffice()
    const expiring = await makeEmailAccount({ officeId: office.id, provider: 'OUTLOOK' })
    await prisma.emailAccount.update({
      where: { id: expiring.id },
      data: {
        outlookSubscriptionId: 'sub-old',
        outlookSubscriptionExpiry: new Date(Date.now() + 12 * 3600 * 1000), // <48h
      },
    })
    const healthy = await makeEmailAccount({ officeId: office.id, provider: 'OUTLOOK' })
    await prisma.emailAccount.update({
      where: { id: healthy.id },
      data: {
        outlookSubscriptionId: 'sub-healthy',
        outlookSubscriptionExpiry: new Date(Date.now() + 10 * 24 * 3600 * 1000),
      },
    })

    // Renewal succeeds via Graph mock
    stubFetchRoutes([
      ['/v1.0/subscriptions', () => ({
        id: 'sub-renewed',
        expirationDateTime: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
      })],
    ])

    await processSubscriptionRenewal('renewal-job-1')

    const renewed = await prisma.emailAccount.findUniqueOrThrow({ where: { id: expiring.id } })
    expect(renewed.outlookSubscriptionId).toBe('sub-renewed')
    const untouched = await prisma.emailAccount.findUniqueOrThrow({ where: { id: healthy.id } })
    expect(untouched.outlookSubscriptionId).toBe('sub-healthy')

    // Failure path: Graph down → subscription cleared (account falls back to 30s polling) + JobLog FAILED
    await prisma.emailAccount.update({
      where: { id: expiring.id },
      data: { outlookSubscriptionExpiry: new Date(Date.now() + 12 * 3600 * 1000) },
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })))

    await processSubscriptionRenewal('renewal-job-2')

    const cleared = await prisma.emailAccount.findUniqueOrThrow({ where: { id: expiring.id } })
    expect(cleared.outlookSubscriptionId).toBeNull()

    const failLog = await prisma.jobLog.findFirst({
      where: { queue: 'subscription-renewal', jobId: 'renewal-job-2' },
    })
    expect(failLog).not.toBeNull()
    expect(failLog!.status).toBe('FAILED')
  })

  it('AC-1.3.c [INV] — webhook Graph com subscriptionId desconhecido não enfileira nada', async () => {
    const { POST } = await import('@/app/api/webhooks/graph/route')
    const req = new NextRequest('http://localhost:3000/api/webhooks/graph', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        value: [{ subscriptionId: 'sub-unknown', clientState: 'test-graph-secret', changeType: 'created', resource: 'x' }],
      }),
    })
    const res = await POST(req)
    expect([200, 202]).toContain(res.status)
    expect(queueAddMock).not.toHaveBeenCalled()
  })

  it('AC-1.3.d — conta com webhook saudável polls a cada 10 ticks (5min); sem webhook, a cada tick (30s)', () => {
    const now = new Date()
    const withWebhook = {
      provider: 'OUTLOOK',
      outlookSubscriptionId: 'sub-1',
      outlookSubscriptionExpiry: new Date(now.getTime() + 24 * 3600 * 1000),
      pubSubSubscription: null,
      gmailWatchExpiry: null,
    }
    const withoutWebhook = {
      provider: 'OUTLOOK',
      outlookSubscriptionId: null,
      outlookSubscriptionExpiry: null,
      pubSubSubscription: null,
      gmailWatchExpiry: null,
    }
    const expiredWebhook = {
      ...withWebhook,
      outlookSubscriptionExpiry: new Date(now.getTime() - 1000),
    }

    expect(hasActiveWebhook(withWebhook, now)).toBe(true)
    expect(hasActiveWebhook(withoutWebhook, now)).toBe(false)
    expect(hasActiveWebhook(expiredWebhook, now)).toBe(false)

    // Without webhook: every tick. With webhook: only every Nth tick (5min at 30s ticks).
    expect(WEBHOOK_POLL_EVERY_N_TICKS).toBe(10)
    for (let tick = 1; tick <= 10; tick++) {
      expect(shouldPollOnTick(withoutWebhook, tick, now)).toBe(true)
      expect(shouldPollOnTick(withWebhook, tick, now)).toBe(tick % 10 === 0)
    }
  })

  it('S1.7 — initiate OAuth: sem sessão → login; VIEWER → sem permissão; OWNER → redirect ao provider com cookie CSRF', async () => {
    const { GET: outlookInitiate } = await import('@/app/api/auth/outlook/initiate/route')
    const { GET: googleInitiate } = await import('@/app/api/auth/google/initiate/route')

    // No session → login redirect
    setSession(null)
    for (const initiate of [outlookInitiate, googleInitiate]) {
      const res = await initiate()
      expect([302, 307]).toContain(res.status)
      expect(res.headers.get('location')).toContain('/login')
    }

    const office = await makeOffice()
    const viewer = await makeUser({ officeId: office.id, role: 'VIEWER' })
    setSession({ id: viewer.id, email: viewer.email, officeId: office.id, role: 'VIEWER' })
    for (const initiate of [outlookInitiate, googleInitiate]) {
      const res = await initiate()
      expect(res.headers.get('location')).toContain('sem_permissao')
    }

    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    setSession({ id: owner.id, email: owner.email, officeId: office.id, role: 'OWNER' })

    const outlookRes = await outlookInitiate()
    expect(outlookRes.headers.get('location')).toContain('login.microsoftonline.com')
    expect(outlookRes.headers.get('set-cookie')).toContain('outlook_oauth_state')

    const googleRes = await googleInitiate()
    expect(googleRes.headers.get('location')).toContain('accounts.google.com')
    expect(googleRes.headers.get('set-cookie')).toContain('google_oauth_state')
  })

  it('S1.7 — callback Google: state inválido → erro sem conta; state válido → conta + watch persistidos', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    setSession({ id: owner.id, email: owner.email, officeId: office.id, role: 'OWNER' })

    const { GET } = await import('@/app/api/auth/google/callback/route')

    // Invalid CSRF state
    stubFetchRoutes([])
    const bad = await GET(
      new NextRequest('http://localhost:3000/api/auth/google/callback?code=abc&state=WRONG', {
        headers: { cookie: 'google_oauth_state=st-9' },
      })
    )
    expect(bad.headers.get('location')).toContain('error')
    expect(await prisma.emailAccount.count()).toBe(0)

    // Happy path with mocked Google endpoints
    stubFetchRoutes([
      ['oauth2.googleapis.com/token', () => ({
        access_token: 'gat-1',
        refresh_token: 'grt-1',
        expires_in: 3600,
      })],
      ['/gmail/v1/users/me/profile', () => ({ emailAddress: 'caixa@gmail.com', historyId: '77' })],
      ['/gmail/v1/users/me/watch', () => ({
        historyId: '78',
        expiration: String(Date.now() + 6 * 24 * 3600 * 1000),
      })],
    ])
    const good = await GET(
      new NextRequest('http://localhost:3000/api/auth/google/callback?code=abc&state=st-9', {
        headers: { cookie: 'google_oauth_state=st-9' },
      })
    )
    expect([302, 307]).toContain(good.status)

    const account = await prisma.emailAccount.findFirstOrThrow({
      where: { officeId: office.id, provider: 'GMAIL' },
    })
    expect(account.gmailWatchExpiry).not.toBeNull()
  })

  it('AC-1.3.e — arranque valida env de segurança: falta de GRAPH_WEBHOOK_SECRET → erro claro', () => {
    const original = process.env.GRAPH_WEBHOOK_SECRET
    delete process.env.GRAPH_WEBHOOK_SECRET
    expect(() => validateSecurityEnv()).toThrow(/GRAPH_WEBHOOK_SECRET/)
    process.env.GRAPH_WEBHOOK_SECRET = original
    expect(() => validateSecurityEnv()).not.toThrow()
  })
})
