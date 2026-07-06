import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { createCipheriv, randomBytes } from 'crypto'
import { truncateAll, prisma } from '../helpers/db'
import { makeTwoOffices, makeOffice, makeUser, makeEmailAccount, makeInboundEmail, makeAttachment, makeClient } from '../helpers/factories'
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

import { resetRateLimits } from '@/server/rate-limit'
import { encryptToken, decryptToken } from '@/lib/crypto'
import { OutlookProvider } from '@/server/email-providers/OutlookProvider'
import { assignClientToDocument } from '@/server/services/document-service'
import { parsePtDate } from '@/server/services/email-classification'

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function walkSrc(onFile: (path: string, content: string) => void): void {
  const srcDir = join(process.cwd(), 'src')
  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.(ts|tsx)$/.test(entry) || /\.test\./.test(entry)) continue
      onFile(full, readFileSync(full, 'utf-8'))
    }
  }
  walk(srcDir)
}

describe('AC-1.4 Higiene (§1.4–§1.7, A11, A12)', () => {
  beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
    setSession(null)
    queueAddMock.mockClear()
    delete process.env.RATE_LIMIT_API_PER_HOUR
    delete process.env.RATE_LIMIT_WEBHOOK_PER_MIN
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('AC-1.4.a — clients pagina: default 50 + nextCursor; limit=5 → 5; limit=500 → clamp 200', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    await prisma.client.createMany({
      data: Array.from({ length: 210 }, (_, i) => ({
        officeId: office.id,
        name: `Cliente ${String(i).padStart(3, '0')}`,
        emailDomains: [],
        knownEmails: [],
      })),
    })
    setSession({ id: owner.id, email: owner.email, officeId: office.id, role: 'OWNER' })

    const { GET } = await import('@/app/api/clients/route')

    const def = await GET(jsonRequest('/api/clients', 'GET'))
    const defBody = await def.json()
    expect(defBody.data.items).toHaveLength(50)
    expect(defBody.data.nextCursor).not.toBeNull()

    const five = await GET(jsonRequest('/api/clients?limit=5', 'GET'))
    const fiveBody = await five.json()
    expect(fiveBody.data.items).toHaveLength(5)

    const clamped = await GET(jsonRequest('/api/clients?limit=500', 'GET'))
    const clampedBody = await clamped.json()
    expect(clampedBody.data.items).toHaveLength(200)

    // Cursor walks the full set without duplicates
    const page2 = await GET(jsonRequest(`/api/clients?limit=200&cursor=${clampedBody.data.nextCursor}`, 'GET'))
    const page2Body = await page2.json()
    expect(page2Body.data.items).toHaveLength(10)
    const ids = new Set([...clampedBody.data.items, ...page2Body.data.items].map((c: { id: string }) => c.id))
    expect(ids.size).toBe(210)
  })

  it('AC-1.4.b — rate limit por classe: userId não partilhado entre users; 429 com Retry-After', async () => {
    process.env.RATE_LIMIT_API_PER_HOUR = '3'
    const office = await makeOffice()
    const user1 = await makeUser({ officeId: office.id, role: 'OWNER' })
    const user2 = await makeUser({ officeId: office.id, role: 'ACCOUNTANT' })

    const { GET } = await import('@/app/api/clients/route')

    setSession({ id: user1.id, email: user1.email, officeId: office.id, role: 'OWNER' })
    for (let i = 0; i < 3; i++) {
      expect((await GET(jsonRequest('/api/clients', 'GET'))).status).toBe(200)
    }
    const blocked = await GET(jsonRequest('/api/clients', 'GET'))
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('Retry-After')).not.toBeNull()

    // user2 has an independent budget (A11: key por userId, não por office/IP)
    setSession({ id: user2.id, email: user2.email, officeId: office.id, role: 'ACCOUNTANT' })
    expect((await GET(jsonRequest('/api/clients', 'GET'))).status).toBe(200)
  })

  it('AC-1.4.b2 — webhooks limitados por subscrição/conta, não por IP', async () => {
    process.env.RATE_LIMIT_WEBHOOK_PER_MIN = '2'
    process.env.GRAPH_WEBHOOK_SECRET = 'test-graph-secret'
    const office = await makeOffice()
    const a1 = await makeEmailAccount({ officeId: office.id, provider: 'OUTLOOK' })
    const a2 = await makeEmailAccount({ officeId: office.id, provider: 'OUTLOOK' })
    await prisma.emailAccount.update({ where: { id: a1.id }, data: { outlookSubscriptionId: 'sub-A' } })
    await prisma.emailAccount.update({ where: { id: a2.id }, data: { outlookSubscriptionId: 'sub-B' } })

    const { POST } = await import('@/app/api/webhooks/graph/route')
    const hit = (sub: string) =>
      POST(
        new NextRequest('http://localhost:3000/api/webhooks/graph', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            value: [{ subscriptionId: sub, clientState: 'test-graph-secret', changeType: 'created', resource: 'x' }],
          }),
        })
      )

    expect((await hit('sub-A')).status).toBeLessThan(400)
    expect((await hit('sub-A')).status).toBeLessThan(400)
    expect((await hit('sub-A')).status).toBe(429)
    // A different subscription is NOT throttled by sub-A's counter
    expect((await hit('sub-B')).status).toBeLessThan(400)
  })

  it('AC-1.4.c [INV] — grep-gate mock-data: nenhum import em código de produção; sem MOCK_CLIENTS', () => {
    const offenders: string[] = []
    walkSrc((path, content) => {
      if (/from\s+['"]@\/lib\/mock-data['"]/.test(content) || /from\s+['"].*\/mock-data['"]/.test(content)) {
        offenders.push(path)
      }
      if (/MOCK_CLIENTS|MOCK_EMAILS|MOCK_DOCUMENTS/.test(content) && !path.endsWith('mock-data.ts')) {
        offenders.push(`${path} (MOCK_* reference)`)
      }
    })
    expect(offenders).toEqual([])
  })

  it('AC-1.4.d [INV] — EmailThread com officeId: mesmo providerThreadId em offices distintos → threads separadas', async () => {
    const { officeA, officeB } = await makeTwoOffices()
    const accountA = await makeEmailAccount({ officeId: officeA.id, provider: 'OUTLOOK' })
    const accountB = await makeEmailAccount({ officeId: officeB.id, provider: 'OUTLOOK' })

    const deltaResponse = {
      value: [
        {
          id: 'msg-shared',
          subject: 'Assunto',
          from: { emailAddress: { address: 'x@y.pt', name: 'X' } },
          receivedDateTime: '2026-05-10T10:00:00Z',
          hasAttachments: false,
          body: { content: 'corpo', contentType: 'text' },
          conversationId: 'conv-shared',
        },
      ],
      '@odata.deltaLink': 'https://graph.microsoft.com/delta?$deltaToken=x',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(deltaResponse), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    )

    await new OutlookProvider(accountA).syncInbox()
    await new OutlookProvider(accountB).syncInbox()

    const threads = await prisma.emailThread.findMany({ where: { providerThreadId: 'conv-shared' } })
    expect(threads).toHaveLength(2)
    const officeIds = threads.map((t) => t.officeId).sort()
    expect(officeIds).toEqual([officeA.id, officeB.id].sort())
  })

  it('AC-1.4.e [INV] — Document.clientId de outro office rejeitado na escrita', async () => {
    const { officeA, officeB } = await makeTwoOffices()
    const accountA = await makeEmailAccount({ officeId: officeA.id })
    const emailA = await makeInboundEmail({ emailAccountId: accountA.id })
    const attA = await makeAttachment({ inboundEmailId: emailA.id })
    const docA = await prisma.document.create({
      data: { attachmentId: attA.id, status: 'CLASSIFIED', type: 'INVOICE_RECEIVED' },
    })
    const clientB = await makeClient({ officeId: officeB.id })
    const clientA = await makeClient({ officeId: officeA.id })

    // Cross-office client assignment must be rejected
    const denied = await assignClientToDocument({
      documentId: docA.id,
      clientId: clientB.id,
      officeId: officeA.id,
    })
    expect(denied.ok).toBe(false)
    expect((await prisma.document.findUniqueOrThrow({ where: { id: docA.id } })).clientId).toBeNull()

    // Same-office assignment works
    const allowed = await assignClientToDocument({
      documentId: docA.id,
      clientId: clientA.id,
      officeId: officeA.id,
    })
    expect(allowed.ok).toBe(true)
    expect((await prisma.document.findUniqueOrThrow({ where: { id: docA.id } })).clientId).toBe(clientA.id)
  })

  it('AC-1.4.f — crypto GCM: novo ciphertext com prefixo v2; CBC legado ainda decripta (A12)', () => {
    const fresh = encryptToken('token-secreto')
    expect(fresh.startsWith('v2:')).toBe(true)
    expect(decryptToken(fresh)).toBe('token-secreto')

    // Legacy AES-256-CBC format: <iv-hex>:<ciphertext-hex>
    const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY!, 'hex')
    const iv = randomBytes(16)
    const cipher = createCipheriv('aes-256-cbc', key, iv)
    const legacyCipher = Buffer.concat([cipher.update('token-antigo', 'utf8'), cipher.final()])
    const legacy = `${iv.toString('hex')}:${legacyCipher.toString('hex')}`

    expect(decryptToken(legacy)).toBe('token-antigo')
  })

  it('S1.7 — parsePtDate normaliza para meio-dia UTC (sem bug de fuso)', () => {
    const parsed = parsePtDate('31-12-2025')
    expect(parsed).not.toBeNull()
    expect(parsed!.getUTCFullYear()).toBe(2025)
    expect(parsed!.getUTCMonth()).toBe(11)
    expect(parsed!.getUTCDate()).toBe(31)
    expect(parsed!.getUTCHours()).toBe(12)

    const iso = parsePtDate('2025-12-31')
    expect(iso!.getUTCDate()).toBe(31)
  })
})
