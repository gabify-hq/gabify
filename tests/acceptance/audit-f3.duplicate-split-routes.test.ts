import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { truncateAll, prisma } from '../helpers/db'
import { makeTwoOffices, makeUser } from '../helpers/factories'
import { setSession, authMockFactory, type TestSessionUser } from '../helpers/session'
import { fixturePath } from '../fixtures/generate'
import { NextRequest } from 'next/server'
import { resetRateLimits } from '@/server/rate-limit'

vi.mock('@/lib/auth', () => authMockFactory())
vi.mock('@/lib/r2', async () => (await import('../mocks/r2')).r2MockFactory())

const queueAddMock = vi.fn(async () => ({}))
vi.mock('@/lib/redis', () => ({
  getEmailSyncQueue: () => ({ add: queueAddMock }),
  getDocumentParseQueue: () => ({ add: queueAddMock }),
  getExportQueue: () => ({ add: queueAddMock }),
  QUEUE_EMAIL_SYNC: 'email-sync',
  QUEUE_DOCUMENT_PARSE: 'document-parse',
  QUEUE_SUBSCRIPTION_RENEWAL: 'subscription-renewal',
  QUEUE_EXPORT: 'export',
  DEFAULT_JOB_OPTIONS: {},
  redisConnection: {},
}))

import { r2Store } from '../mocks/r2'
import { sha256 } from '@/server/services/upload-service'

/**
 * AUDIT F3.8 — resolveDuplicate/approveSplit alcançáveis por rota (A-11).
 * Os serviços existem completos desde a fase 3/S2.2 mas nenhuma rota os
 * expunha: a Fátima via "Duplicado?" e não tinha como responder.
 */

function asSession(user: TestSessionUser) {
  setSession(user)
}

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function makeDuplicateSuspect(officeId: string) {
  const original = await prisma.document.create({
    data: {
      officeId,
      source: 'MANUAL_UPLOAD',
      status: 'VALIDATED',
      type: 'INVOICE_RECEIVED',
      confidence: 0.95,
      supplierNif: '508234567',
      documentNumber: 'FT DUP/1',
      originalFilename: 'original.pdf',
    },
  })
  const suspect = await prisma.document.create({
    data: {
      officeId,
      source: 'MANUAL_UPLOAD',
      status: 'NEEDS_REVIEW',
      type: 'INVOICE_RECEIVED',
      confidence: 0.9,
      supplierNif: '508234567',
      documentNumber: 'FT DUP/1-B',
      originalFilename: 'suspeito.pdf',
      flags: ['DUPLICATE_SUSPECT'],
      duplicateOfId: original.id,
    },
  })
  return { original, suspect }
}

describe('AUDIT-F3.8 rotas de duplicado e divisão', () => {
  beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
    setSession(null)
    queueAddMock.mockClear()
    r2Store.clear()
  })

  it('resolve-duplicate distinct limpa a flag; keep arquiva como duplicado (REVIEWED)', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const { suspect } = await makeDuplicateSuspect(officeA.id)
    asSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })

    const { POST } = await import('@/app/api/documents/[documentId]/resolve-duplicate/route')

    const distinct = await POST(
      jsonRequest(`/api/documents/${suspect.id}/resolve-duplicate`, 'POST', {
        resolution: 'distinct',
        expectedVersion: suspect.version,
      }),
      { params: Promise.resolve({ documentId: suspect.id }) },
    )
    expect(distinct.status).toBe(200)
    const afterDistinct = await prisma.document.findUniqueOrThrow({ where: { id: suspect.id } })
    expect(afterDistinct.flags).not.toContain('DUPLICATE_SUSPECT')
    expect(afterDistinct.duplicateOfId).toBeNull()

    // Marca de novo e arquiva como duplicado confirmado
    await prisma.document.update({
      where: { id: suspect.id },
      data: { flags: ['DUPLICATE_SUSPECT'] },
    })
    const fresh = await prisma.document.findUniqueOrThrow({ where: { id: suspect.id } })
    const keep = await POST(
      jsonRequest(`/api/documents/${suspect.id}/resolve-duplicate`, 'POST', {
        resolution: 'keep',
        expectedVersion: fresh.version,
      }),
      { params: Promise.resolve({ documentId: suspect.id }) },
    )
    expect(keep.status).toBe(200)
    const archived = await prisma.document.findUniqueOrThrow({ where: { id: suspect.id } })
    expect(archived.status).toBe('REVIEWED')

    // Auditado
    const audit = await prisma.auditLog.findFirst({
      where: { officeId: officeA.id, action: 'DUPLICATE_RESOLVED' },
    })
    expect(audit).not.toBeNull()
  })

  it('resolve-duplicate: cross-tenant → 404; VIEWER → negado; sem flag → 409', async () => {
    const { officeA, officeB, ownerB } = await makeTwoOffices()
    const viewer = await makeUser({ officeId: officeA.id, role: 'VIEWER' })
    const { suspect, original } = await makeDuplicateSuspect(officeA.id)

    const { POST } = await import('@/app/api/documents/[documentId]/resolve-duplicate/route')

    // OWNER de OUTRO office → 404 (nunca existe)
    asSession({ id: ownerB.id, email: ownerB.email, officeId: officeB.id, role: 'OWNER' })
    const cross = await POST(
      jsonRequest(`/api/documents/${suspect.id}/resolve-duplicate`, 'POST', {
        resolution: 'distinct',
        expectedVersion: suspect.version,
      }),
      { params: Promise.resolve({ documentId: suspect.id }) },
    )
    expect(cross.status).toBe(404)

    // VIEWER do próprio office → negado
    asSession({ id: viewer.id, email: viewer.email, officeId: officeA.id, role: 'VIEWER' })
    const denied = await POST(
      jsonRequest(`/api/documents/${suspect.id}/resolve-duplicate`, 'POST', {
        resolution: 'distinct',
        expectedVersion: suspect.version,
      }),
      { params: Promise.resolve({ documentId: suspect.id }) },
    )
    expect([403, 404]).toContain(denied.status)

    // Documento sem flag → 409
    const owner = await prisma.user.findFirstOrThrow({ where: { officeId: officeA.id, role: 'OWNER' } })
    asSession({ id: owner.id, email: owner.email, officeId: officeA.id, role: 'OWNER' })
    const notFlagged = await POST(
      jsonRequest(`/api/documents/${original.id}/resolve-duplicate`, 'POST', {
        resolution: 'distinct',
        expectedVersion: original.version,
      }),
      { params: Promise.resolve({ documentId: original.id }) },
    )
    expect(notFlagged.status).toBe(409)
  })

  it('approve-split aplica a divisão em cache: pai SPLIT + filhos criados', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const buffer = readFileSync(fixturePath('fx-5page-noqr.pdf'))
    const hash = sha256(buffer)
    const r2Key = `${officeA.id}/uploads/split-test/doc.pdf`
    r2Store.set(r2Key, buffer)

    const parent = await prisma.document.create({
      data: {
        officeId: officeA.id,
        source: 'MANUAL_UPLOAD',
        status: 'NEEDS_REVIEW',
        type: 'INVOICE_RECEIVED',
        confidence: 0.6,
        originalFilename: 'multi.pdf',
        mimeType: 'application/pdf',
        contentSha256: hash,
        r2Key,
      },
    })
    await prisma.documentSplitCache.create({
      data: {
        officeId: officeA.id,
        sha256: hash,
        method: 'ai',
        boundaries: {
          confidence: 0.6,
          invoices: [{ startPage: 1, endPage: 2 }, { startPage: 3, endPage: 5 }],
        },
      },
    })

    asSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })
    const { POST } = await import('@/app/api/documents/[documentId]/approve-split/route')
    const res = await POST(
      jsonRequest(`/api/documents/${parent.id}/approve-split`, 'POST', {}),
      { params: Promise.resolve({ documentId: parent.id }) },
    )
    expect(res.status).toBe(200)

    const freshParent = await prisma.document.findUniqueOrThrow({ where: { id: parent.id } })
    expect(freshParent.status).toBe('SPLIT')
    const children = await prisma.document.findMany({ where: { parentDocumentId: parent.id } })
    expect(children).toHaveLength(2)
  })

  it('approve-split: cross-tenant → 404', async () => {
    const { officeA, officeB, ownerB } = await makeTwoOffices()
    const doc = await prisma.document.create({
      data: {
        officeId: officeA.id,
        source: 'MANUAL_UPLOAD',
        status: 'NEEDS_REVIEW',
        type: 'INVOICE_RECEIVED',
        originalFilename: 'x.pdf',
        contentSha256: 'abc',
        r2Key: 'x/y.pdf',
      },
    })

    asSession({ id: ownerB.id, email: ownerB.email, officeId: officeB.id, role: 'OWNER' })
    const { POST } = await import('@/app/api/documents/[documentId]/approve-split/route')
    const res = await POST(
      jsonRequest(`/api/documents/${doc.id}/approve-split`, 'POST', {}),
      { params: Promise.resolve({ documentId: doc.id }) },
    )
    expect(res.status).toBe(404)
  })
})
