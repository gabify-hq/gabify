import { describe, it, expect, beforeEach, vi } from 'vitest'
import { truncateAll, prisma } from '../helpers/db'
import { makeOffice, makeEmailAccount } from '../helpers/factories'
import { NextRequest } from 'next/server'

const queueAddMock = vi.fn(async () => ({}))
vi.mock('@/lib/redis', () => ({
  getEmailSyncQueue: () => ({ add: queueAddMock }),
  getDocumentParseQueue: () => ({ add: queueAddMock }),
  QUEUE_EMAIL_SYNC: 'email-sync',
  QUEUE_DOCUMENT_PARSE: 'document-parse',
  DEFAULT_JOB_OPTIONS: {},
  redisConnection: {},
}))

const jwtVerifyMock = vi.fn()
vi.mock('jose', () => ({
  createRemoteJWKSet: () => ({}),
  jwtVerify: (...args: unknown[]) => jwtVerifyMock(...args),
}))

import { POST as graphWebhook } from '@/app/api/webhooks/graph/route'
import { POST as gmailWebhook } from '@/app/api/webhooks/gmail/route'

function graphRequest(notifications: unknown[], url = 'http://localhost:3000/api/webhooks/graph') {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: notifications }),
  })
}

function gmailRequest(payload: { emailAddress: string; historyId: string }, authHeader?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authHeader) headers['Authorization'] = authHeader
  return new NextRequest('http://localhost:3000/api/webhooks/gmail', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: {
        data: Buffer.from(JSON.stringify(payload)).toString('base64'),
        messageId: 'pubsub-1',
        publishTime: new Date().toISOString(),
      },
      subscription: 'projects/test/subscriptions/gabify',
    }),
  })
}

describe('AC-0.4 Webhooks fail-closed (§0.4)', () => {
  const SECRET = 'test-graph-secret'

  beforeEach(async () => {
    await truncateAll()
    queueAddMock.mockClear()
    jwtVerifyMock.mockReset()
    process.env.GRAPH_WEBHOOK_SECRET = SECRET
  })

  it('AC-0.4.a [INV] — GRAPH_WEBHOOK_SECRET indefinido → 503, nada processado', async () => {
    delete process.env.GRAPH_WEBHOOK_SECRET

    const res = await graphWebhook(
      graphRequest([{ subscriptionId: 'sub-1', clientState: 'whatever', changeType: 'created', resource: 'x' }])
    )
    expect(res.status).toBe(503)
    expect(queueAddMock).not.toHaveBeenCalled()

    process.env.GRAPH_WEBHOOK_SECRET = SECRET
  })

  it('AC-0.4.b [INV] — clientState errado → 401; correto → processado', async () => {
    const office = await makeOffice()
    const account = await makeEmailAccount({ officeId: office.id, provider: 'OUTLOOK' })
    await prisma.emailAccount.update({
      where: { id: account.id },
      data: { outlookSubscriptionId: 'sub-1' },
    })

    const bad = await graphWebhook(
      graphRequest([{ subscriptionId: 'sub-1', clientState: 'WRONG', changeType: 'created', resource: 'x' }])
    )
    expect(bad.status).toBe(401)
    expect(queueAddMock).not.toHaveBeenCalled()

    const good = await graphWebhook(
      graphRequest([{ subscriptionId: 'sub-1', clientState: SECRET, changeType: 'created', resource: 'x' }])
    )
    expect([200, 202]).toContain(good.status)
    expect(queueAddMock).toHaveBeenCalledTimes(1)
  })

  it('AC-0.4.b2 — notificação sem clientState → 401', async () => {
    const res = await graphWebhook(
      graphRequest([{ subscriptionId: 'sub-1', changeType: 'created', resource: 'x' }])
    )
    expect(res.status).toBe(401)
    expect(queueAddMock).not.toHaveBeenCalled()
  })

  it('AC-0.4.c [INV] — POST Gmail sem header Authorization → 401 (hoje passa — nasce RED)', async () => {
    const office = await makeOffice()
    await makeEmailAccount({ officeId: office.id, provider: 'GMAIL', email: 'caixa@gmail.com' })

    const res = await gmailWebhook(gmailRequest({ emailAddress: 'caixa@gmail.com', historyId: '42' }))
    expect(res.status).toBe(401)
    expect(queueAddMock).not.toHaveBeenCalled()
  })

  it('AC-0.4.d [INV] — JWT inválido → 401; válido → processado', async () => {
    const office = await makeOffice()
    await makeEmailAccount({ officeId: office.id, provider: 'GMAIL', email: 'caixa@gmail.com' })

    jwtVerifyMock.mockRejectedValueOnce(new Error('bad signature'))
    const bad = await gmailWebhook(
      gmailRequest({ emailAddress: 'caixa@gmail.com', historyId: '42' }, 'Bearer invalid-token')
    )
    expect(bad.status).toBe(401)
    expect(queueAddMock).not.toHaveBeenCalled()

    jwtVerifyMock.mockResolvedValueOnce({ payload: {}, protectedHeader: {} })
    const good = await gmailWebhook(
      gmailRequest({ emailAddress: 'caixa@gmail.com', historyId: '43' }, 'Bearer valid-token')
    )
    expect(good.status).toBe(200)
    expect(queueAddMock).toHaveBeenCalledTimes(1)
  })
})
