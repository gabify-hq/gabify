import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import AdmZip from 'adm-zip'
import { truncateAll, prisma } from '../helpers/db'
import { makeTwoOffices, makeOffice, makeUser, makeClient } from '../helpers/factories'
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
import { reviewDocument, reopenDocument } from '@/server/services/review-service'
import { runExport } from '@/server/services/export-service'
import { aiState } from '../mocks/ai'
import { r2Store } from '../mocks/r2'

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function seedParsedDoc(officeId: string, userId: string, fixture = 'fx-qr-single.pdf') {
  const doc = await createManualDocument({
    officeId, uploadedByUserId: userId, filename: fixture,
    mimeType: 'application/pdf', buffer: readFileSync(fixturePath(fixture)), clientId: null,
  })
  await processDocumentParse({ documentId: doc.id, officeId }, `f5-${doc.id}`)
  return prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
}

async function reviewVia(documentId: string, body: unknown) {
  const { POST } = await import('@/app/api/documents/[documentId]/review/route')
  return POST(jsonRequest(`/api/documents/${documentId}/review`, 'POST', body), {
    params: Promise.resolve({ documentId }),
  })
}

describe('S5.1 — review aceita correções completas (vatBreakdown, retenção, moeda, dueDate)', () => {
  beforeEach(async () => {
    await truncateAll()
    setSession(null)
    resetRateLimits()
    aiState.reset()
    r2Store.clear()
    queueAddMock.mockClear()
  })

  it('S5.1.a [INV] — correção de vatBreakdown/retenção persiste e reflete-se no export seguinte', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    const client = await makeClient({ officeId: office.id, name: 'Cliente Export' })
    const doc = await seedParsedDoc(office.id, owner.id)
    await prisma.document.update({ where: { id: doc.id }, data: { clientId: client.id } })
    setSession({ id: owner.id, email: owner.email, officeId: office.id, role: 'OWNER' })

    const res = await reviewVia(doc.id, {
      decision: 'correct',
      expectedVersion: doc.version,
      corrections: {
        issueDate: '15/03/2026',
        vatBreakdown: [{ region: 'PT', rate: 23, baseCents: 20000, vatCents: 4600 }],
        withholdingCents: 0,
        currency: 'EUR',
        dueDate: '30/04/2026',
        totalCents: 24600,
      },
    })
    expect(res.status).toBe(200)

    const updated = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(updated.status).toBe('VALIDATED')
    expect(updated.vatBreakdown).toEqual([{ region: 'PT', rate: 23, baseCents: 20000, vatCents: 4600 }])
    expect(String(updated.withholdingAmount)).toBe('0')
    expect(updated.currency).toBe('EUR')
    expect(updated.dueDate?.toISOString().slice(0, 10)).toBe('2026-04-30')

    // History records before/after for the new fields too
    const review = await prisma.documentReview.findFirstOrThrow({ where: { documentId: doc.id } })
    const after = review.after as Record<string, unknown>
    expect(after.vatBreakdown).toEqual([{ region: 'PT', rate: 23, baseCents: 20000, vatCents: 4600 }])
    expect(after.dueDate).not.toBeUndefined()

    // Next export carries the corrected values (A1 — cents end to end)
    const result = await runExport({ officeId: office.id, userId: owner.id, periodFrom: '2026-03', periodTo: '2026-03' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const zip = new AdmZip(r2Store.get(result.r2Key)!)
    const csv = zip.getEntry('lancamentos.csv')!.getData().toString('utf-8')
    const line = csv.split('\n').find((l) => l.includes('508234567'))
    expect(line).toContain('200,00') // base_23 corrected
    expect(line).toContain('46,00') // iva_23 corrected
    expect(line).toContain('246,00') // total corrected
  })

  it('S5.1.b [INV] — taxa fora do conjunto PT (15) → 422 com detalhe e nada persistido; moeda/dueDate inválidas → 422', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    const doc = await seedParsedDoc(office.id, owner.id)
    setSession({ id: owner.id, email: owner.email, officeId: office.id, role: 'OWNER' })

    const badRate = await reviewVia(doc.id, {
      decision: 'correct',
      expectedVersion: doc.version,
      corrections: {
        vatBreakdown: [{ region: 'PT', rate: 15, baseCents: 10000, vatCents: 1500 }],
        totalCents: 11500,
      },
    })
    expect(badRate.status).toBe(422)
    const body = await badRate.json()
    expect(JSON.stringify(body.details ?? body)).toContain('vatBreakdown')

    const badCurrency = await reviewVia(doc.id, {
      decision: 'correct',
      expectedVersion: doc.version,
      corrections: { currency: 'euros' },
    })
    expect(badCurrency.status).toBe(422)

    const badDueDate = await reviewVia(doc.id, {
      decision: 'correct',
      expectedVersion: doc.version,
      corrections: { issueDate: '10/03/2026', dueDate: '01/01/2026' },
    })
    expect(badDueDate.status).toBe(422)

    // Nothing persisted, version untouched
    const fresh = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(fresh.version).toBe(doc.version)
    expect(fresh.vatBreakdown).toEqual(doc.vatBreakdown)
    expect(await prisma.documentReview.count({ where: { documentId: doc.id } })).toBe(0)
  })

  it('S5.1.c [INV] — incoerência Σbases+ΣIVA−retenção vs total > 2 cêntimos → 422 no SERVIDOR', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    const doc = await seedParsedDoc(office.id, owner.id)
    setSession({ id: owner.id, email: owner.email, officeId: office.id, role: 'OWNER' })

    const res = await reviewVia(doc.id, {
      decision: 'correct',
      expectedVersion: doc.version,
      corrections: {
        vatBreakdown: [{ region: 'PT', rate: 23, baseCents: 10000, vatCents: 2300 }],
        withholdingCents: 0,
        totalCents: 20000, // 123,00 esperado — desvio 77,00
      },
    })
    expect(res.status).toBe(422)
    const fresh = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(fresh.version).toBe(doc.version)

    // Tolerância ±2 cêntimos aceita
    const ok = await reviewVia(doc.id, {
      decision: 'correct',
      expectedVersion: doc.version,
      corrections: {
        vatBreakdown: [{ region: 'PT', rate: 23, baseCents: 10000, vatCents: 2300 }],
        withholdingCents: 0,
        totalCents: 12302,
      },
    })
    expect(ok.status).toBe(200)
  })

  it('S5.1.d [INV] — documento VALIDADO é imutável sem reopen; após reopen a correção é aceite', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    const doc = await seedParsedDoc(office.id, owner.id)

    const validated = await reviewDocument({
      documentId: doc.id, officeId: office.id, userId: owner.id, role: 'OWNER',
      decision: 'validate', expectedVersion: doc.version,
    })
    expect(validated.ok).toBe(true)

    // Correction on VALIDATED without reopen → rejected
    const v1 = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    const denied = await reviewDocument({
      documentId: doc.id, officeId: office.id, userId: owner.id, role: 'OWNER',
      decision: 'correct', corrections: { supplierName: 'Tentativa Ilegal' },
      expectedVersion: v1.version,
    })
    expect(denied.ok).toBe(false)
    expect(!denied.ok && denied.httpStatus).toBe(409)

    // Export it, reopen (A9), then correction is allowed again
    await prisma.document.update({ where: { id: doc.id }, data: { status: 'EXPORTED' } })
    const reopened = await reopenDocument({
      documentId: doc.id, officeId: office.id, userId: owner.id, role: 'OWNER',
      reason: 'valor errado pós-export',
    })
    expect(reopened.ok).toBe(true)
    expect(reopened.ok && reopened.status).toBe('VALIDATED')

    const v2 = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    const corrected = await reviewDocument({
      documentId: doc.id, officeId: office.id, userId: owner.id, role: 'OWNER',
      decision: 'correct', corrections: { supplierName: 'Fornecedor Reaberto Lda' },
      expectedVersion: v2.version,
    })
    expect(corrected.ok).toBe(true)
    const final = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(final.supplierName).toBe('Fornecedor Reaberto Lda')
    expect(final.status).toBe('VALIDATED')

    // Window closed again after the correction
    const deniedAgain = await reviewDocument({
      documentId: doc.id, officeId: office.id, userId: owner.id, role: 'OWNER',
      decision: 'correct', corrections: { supplierName: 'Outra Tentativa' },
      expectedVersion: final.version,
    })
    expect(deniedAgain.ok).toBe(false)
  })
})

describe('S5.2 — GET /api/documents com filtros e paginação por cursor', () => {
  beforeEach(async () => {
    await truncateAll()
    setSession(null)
    resetRateLimits()
    aiState.reset()
    r2Store.clear()
  })

  async function listVia(query: string) {
    const { GET } = await import('@/app/api/documents/route')
    return GET(jsonRequest(`/api/documents${query}`, 'GET'))
  }

  async function seedRaw(officeId: string, data: Record<string, unknown>) {
    return prisma.document.create({
      data: {
        officeId,
        source: 'MANUAL_UPLOAD',
        status: 'NEEDS_REVIEW',
        type: 'INVOICE_RECEIVED',
        ...data,
      } as never,
    })
  }

  it('S5.2.a [INV] — filtro por status devolve só esses; multi-status aceite', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    await seedRaw(office.id, { status: 'NEEDS_REVIEW', supplierName: 'A' })
    await seedRaw(office.id, { status: 'PRE_VALIDATED', supplierName: 'B' })
    await seedRaw(office.id, { status: 'VALIDATED', supplierName: 'C' })
    setSession({ id: owner.id, email: owner.email, officeId: office.id, role: 'OWNER' })

    const one = await listVia('?status=NEEDS_REVIEW')
    expect(one.status).toBe(200)
    const oneBody = await one.json()
    expect(oneBody.data.items).toHaveLength(1)
    expect(oneBody.data.items[0].status).toBe('NEEDS_REVIEW')

    const multi = await listVia('?status=NEEDS_REVIEW,PRE_VALIDATED')
    const multiBody = await multi.json()
    expect(multiBody.data.items).toHaveLength(2)
    expect(new Set(multiBody.data.items.map((i: { status: string }) => i.status)))
      .toEqual(new Set(['NEEDS_REVIEW', 'PRE_VALIDATED']))
  })

  it('S5.2.b [INV] — documento de outro office nunca aparece, mesmo com filtros largos', async () => {
    const { officeA, officeB, ownerA } = await makeTwoOffices()
    const foreign = await seedRaw(officeB.id, { supplierName: 'Segredo Alheio' })
    await seedRaw(officeA.id, { supplierName: 'Meu Doc' })
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })

    const res = await listVia('?q=Segredo')
    const body = await res.json()
    expect(body.data.items).toHaveLength(0)

    const all = await listVia('')
    const allBody = await all.json()
    expect(allBody.data.items.map((i: { id: string }) => i.id)).not.toContain(foreign.id)
  })

  it('S5.2.c [INV] — combinação de filtros é AND (status+clientId+flag+período+q); cursor pagina', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    const client = await makeClient({ officeId: office.id, name: 'Cliente Filtro' })
    const target = await seedRaw(office.id, {
      status: 'NEEDS_REVIEW', clientId: client.id, flags: ['DUPLICATE_SUSPECT'],
      supplierName: 'Fornecedor Alvo', documentNumber: 'FT 9/1',
      issueDate: new Date('2026-03-10T12:00:00Z'),
    })
    // Near-misses: each breaks exactly one condition
    await seedRaw(office.id, { status: 'PRE_VALIDATED', clientId: client.id, flags: ['DUPLICATE_SUSPECT'], supplierName: 'Fornecedor Alvo', issueDate: new Date('2026-03-11T12:00:00Z') })
    await seedRaw(office.id, { status: 'NEEDS_REVIEW', flags: ['DUPLICATE_SUSPECT'], supplierName: 'Fornecedor Alvo', issueDate: new Date('2026-03-11T12:00:00Z') })
    await seedRaw(office.id, { status: 'NEEDS_REVIEW', clientId: client.id, supplierName: 'Fornecedor Alvo', issueDate: new Date('2026-03-11T12:00:00Z') })
    await seedRaw(office.id, { status: 'NEEDS_REVIEW', clientId: client.id, flags: ['DUPLICATE_SUSPECT'], supplierName: 'Fornecedor Alvo', issueDate: new Date('2026-07-01T12:00:00Z') })
    await seedRaw(office.id, { status: 'NEEDS_REVIEW', clientId: client.id, flags: ['DUPLICATE_SUSPECT'], supplierName: 'Outro Nome', issueDate: new Date('2026-03-12T12:00:00Z') })
    setSession({ id: owner.id, email: owner.email, officeId: office.id, role: 'OWNER' })

    const res = await listVia(
      `?status=NEEDS_REVIEW&clientId=${client.id}&flag=DUPLICATE_SUSPECT&from=2026-03-01&to=2026-03-31&q=Alvo`,
    )
    const body = await res.json()
    expect(body.data.items).toHaveLength(1)
    expect(body.data.items[0].id).toBe(target.id)

    // q also matches documentNumber
    const byNumber = await listVia('?q=FT 9/1')
    expect((await byNumber.json()).data.items.map((i: { id: string }) => i.id)).toContain(target.id)

    // Cursor pagination: limit=2 walks all 6 without repeats
    const page1 = await (await listVia('?limit=2')).json()
    expect(page1.data.items).toHaveLength(2)
    expect(page1.data.nextCursor).not.toBeNull()
    const page2 = await (await listVia(`?limit=2&cursor=${page1.data.nextCursor}`)).json()
    const ids = new Set([...page1.data.items, ...page2.data.items].map((i: { id: string }) => i.id))
    expect(ids.size).toBe(4)

    // VIEWER can read (document:read); no session → 401
    setSession(null)
    const anon = await listVia('')
    expect(anon.status).toBe(401)
  })
})

describe('S5.3 — resposta do import inclui cabeçalhos detetados', () => {
  beforeEach(async () => {
    await truncateAll()
    setSession(null)
    resetRateLimits()
    aiState.reset()
  })

  it('S5.3.a — cabeçalhos originais na ordem do ficheiro + forma normalizada', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    setSession({ id: owner.id, email: owner.email, officeId: office.id, role: 'OWNER' })
    aiState.queue.push(JSON.stringify({
      mapping: {
        date: 'Data', documentNumber: 'Numero', supplierNif: 'NIF',
        netAmount: 'Base', vatRate: 'Taxa', totalAmount: 'Total',
      },
    }))

    const csv = 'Data;Numero;NIF;Base;Taxa;Total\n05/03/2026;FT 1/1;508234565;100,00;23;123,00\n'
    const form = new FormData()
    form.set('file', new File([csv], 'lanc.csv', { type: 'text/csv' }))

    const { POST } = await import('@/app/api/documents/import/route')
    const res = await POST(new NextRequest('http://localhost:3000/api/documents/import', {
      method: 'POST',
      body: form,
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.headers).toEqual([
      { original: 'Data', normalized: 'data' },
      { original: 'Numero', normalized: 'numero' },
      { original: 'NIF', normalized: 'nif' },
      { original: 'Base', normalized: 'base' },
      { original: 'Taxa', normalized: 'taxa' },
      { original: 'Total', normalized: 'total' },
    ])
  })
})
