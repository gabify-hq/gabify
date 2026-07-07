import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { truncateAll, prisma } from '../helpers/db'
import { makeOffice, makeUser, makeClient } from '../helpers/factories'
import { setSession, authMockFactory } from '../helpers/session'
import { fixturePath } from '../fixtures/generate'
import { NextRequest } from 'next/server'
import { resetRateLimits } from '@/server/rate-limit'

vi.mock('@/lib/auth', () => authMockFactory())
vi.mock('@/lib/r2', async () => (await import('../mocks/r2')).r2MockFactory())
vi.mock('@/lib/anthropic', async () => (await import('../mocks/ai')).aiMockFactory())

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

import { processDocumentParse } from '@/queues/document-parse.processor'
import { createManualDocument } from '@/server/services/upload-service'
import { aiState } from '../mocks/ai'
import { r2Store } from '../mocks/r2'

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function seedParsedDoc(officeId: string, userId: string) {
  const doc = await createManualDocument({
    officeId, uploadedByUserId: userId, filename: 'fx-qr-single.pdf',
    mimeType: 'application/pdf', buffer: readFileSync(fixturePath('fx-qr-single.pdf')), clientId: null,
  })
  await processDocumentParse({ documentId: doc.id, officeId }, `rt-${doc.id}`)
  return prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
}

describe('Fase 3 — rotas API (review, bulk, reopen, supplier-rules, exports)', () => {
  beforeEach(async () => {
    await truncateAll()
    setSession(null)
    resetRateLimits()
    aiState.reset()
    r2Store.clear()
    queueAddMock.mockClear()
  })

  it('POST /api/documents/[id]/review valida; VIEWER bloqueado; versão errada → 409', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    const viewer = await makeUser({ officeId: office.id, role: 'VIEWER' })
    const doc = await seedParsedDoc(office.id, owner.id)

    const { POST } = await import('@/app/api/documents/[documentId]/review/route')

    setSession({ id: viewer.id, email: viewer.email, officeId: office.id, role: 'VIEWER' })
    const denied = await POST(
      jsonRequest(`/api/documents/${doc.id}/review`, 'POST', { decision: 'validate', expectedVersion: doc.version }),
      { params: Promise.resolve({ documentId: doc.id }) }
    )
    expect([403, 404]).toContain(denied.status)

    setSession({ id: owner.id, email: owner.email, officeId: office.id, role: 'OWNER' })
    const stale = await POST(
      jsonRequest(`/api/documents/${doc.id}/review`, 'POST', { decision: 'validate', expectedVersion: doc.version + 9 }),
      { params: Promise.resolve({ documentId: doc.id }) }
    )
    expect(stale.status).toBe(409)

    const ok = await POST(
      jsonRequest(`/api/documents/${doc.id}/review`, 'POST', { decision: 'validate', expectedVersion: doc.version }),
      { params: Promise.resolve({ documentId: doc.id }) }
    )
    expect(ok.status).toBe(200)
    expect((await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).status).toBe('VALIDATED')
  })

  it('bulk + reopen + supplier-rules + exports: fluxo completo por rotas', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    const client = await makeClient({ officeId: office.id, name: 'Cliente Rotas' })
    const doc = await seedParsedDoc(office.id, owner.id)
    await prisma.document.update({
      where: { id: doc.id },
      data: { clientId: client.id, flags: [], duplicateOfId: null, status: 'PRE_VALIDATED' },
    })
    setSession({ id: owner.id, email: owner.email, officeId: office.id, role: 'OWNER' })

    // Bulk validate
    const { POST: bulk } = await import('@/app/api/documents/review/bulk/route')
    const fresh = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    const bulkRes = await bulk(
      jsonRequest('/api/documents/review/bulk', 'POST', {
        items: [{ documentId: doc.id, expectedVersion: fresh.version }],
      })
    )
    expect(bulkRes.status).toBe(200)
    expect((await bulkRes.json()).data.results[0].result).toBe('OK')

    // Supplier rule creation + listing
    const { POST: createRule, GET: listRules } = await import('@/app/api/supplier-rules/route')
    const ruleRes = await createRule(
      jsonRequest('/api/supplier-rules', 'POST', { supplierNif: '508234567', defaultAccountCode: '6221', autoValidate: true })
    )
    expect(ruleRes.status).toBe(201)
    const listRes = await listRules(jsonRequest('/api/supplier-rules', 'GET'))
    expect((await listRes.json()).data.items).toHaveLength(1)

    // Export via route
    const { POST: createExport, GET: listExports } = await import('@/app/api/exports/route')
    const expRes = await createExport(
      jsonRequest('/api/exports', 'POST', { periodFrom: '2026-03', periodTo: '2026-03' })
    )
    expect(expRes.status).toBe(201)
    const { batchId, documentCount } = (await expRes.json()).data
    expect(documentCount).toBe(1)

    const history = await listExports(jsonRequest('/api/exports', 'GET'))
    expect((await history.json()).data.items).toHaveLength(1)

    // Download URL
    const { GET: download } = await import('@/app/api/exports/[batchId]/download/route')
    const dl = await download(jsonRequest(`/api/exports/${batchId}/download`, 'GET'), {
      params: Promise.resolve({ batchId }),
    })
    expect(dl.status).toBe(200)
    expect((await dl.json()).data.url).toContain('http')

    // Reopen exported doc via route (missing reason → 400; OWNER with reason → 200)
    const { POST: reopen } = await import('@/app/api/documents/[documentId]/reopen/route')
    const noReason = await reopen(
      jsonRequest(`/api/documents/${doc.id}/reopen`, 'POST', {}),
      { params: Promise.resolve({ documentId: doc.id }) }
    )
    expect(noReason.status).toBe(400)
    const reopened = await reopen(
      jsonRequest(`/api/documents/${doc.id}/reopen`, 'POST', { reason: 'correção pós-export' }),
      { params: Promise.resolve({ documentId: doc.id }) }
    )
    expect(reopened.status).toBe(200)
  })

  it('VIEWER não cria regras nem exports (export:run/document:review negados)', async () => {
    const office = await makeOffice()
    await makeUser({ officeId: office.id, role: 'OWNER' })
    const viewer = await makeUser({ officeId: office.id, role: 'VIEWER' })
    setSession({ id: viewer.id, email: viewer.email, officeId: office.id, role: 'VIEWER' })

    const { POST: createRule } = await import('@/app/api/supplier-rules/route')
    const ruleRes = await createRule(
      jsonRequest('/api/supplier-rules', 'POST', { supplierNif: '508234567' })
    )
    expect([403, 404]).toContain(ruleRes.status)

    const { POST: createExport } = await import('@/app/api/exports/route')
    const expRes = await createExport(
      jsonRequest('/api/exports', 'POST', { periodFrom: '2026-01', periodTo: '2026-01' })
    )
    expect(expRes.status).toBe(403)

    expect(await prisma.supplierRule.count()).toBe(0)
    expect(await prisma.exportBatch.count()).toBe(0)
  })
})
