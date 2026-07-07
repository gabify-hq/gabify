import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { truncateAll, prisma } from '../helpers/db'
import { makeOffice, makeUser } from '../helpers/factories'
import { fixturePath } from '../fixtures/generate'
import { resetRateLimits } from '@/server/rate-limit'

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
import {
  aiState,
  scenarioValidExtraction,
  scenarioMalformed,
  scenarioReciboVerde,
  scenarioArithmeticMismatch,
} from '../mocks/ai'
import { r2Store } from '../mocks/r2'

function fx(name: string): Buffer {
  return readFileSync(fixturePath(name))
}

async function seedDoc(fixture: string, mimeType = 'application/pdf') {
  const office = await makeOffice()
  const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
  const doc = await createManualDocument({
    officeId: office.id,
    uploadedByUserId: owner.id,
    filename: fixture,
    mimeType,
    buffer: fx(fixture),
    clientId: null,
  })
  return { office, owner, doc }
}

async function parse(docId: string, officeId: string, jobId: string) {
  return processDocumentParse({ documentId: docId, officeId }, jobId)
}

describe('AC-3.1 QR autoritativo (A1) · AC-3.2 IA · AC-3.3 XML · AC-3.4 duplicados (A8)', () => {
  beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
    aiState.reset()
    r2Store.clear()
    queueAddMock.mockClear()
  })

  it('AC-3.1.a [INV] — fx-qr-multirate: vatBreakdown completo por taxa + ATCUD + retenção, ZERO chamadas IA', async () => {
    const { office, doc } = await seedDoc('fx-qr-multirate.pdf')
    await parse(doc.id, office.id, 'ext-1')

    const parsed = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(aiState.calls).toBe(0)
    expect(parsed.extractionSource).toBe('QR')
    expect(parsed.supplierNif).toBe('507111222')
    expect(parsed.buyerNif).toBe('245678901')
    expect(parsed.atcud).toBe('WXYZ9876-77')
    expect(parsed.documentNumber).toBe('FT B/77')
    expect(String(parsed.totalAmount)).toBe('751')
    expect(String(parsed.withholdingAmount)).toBe('75')

    const breakdown = parsed.vatBreakdown as Array<Record<string, unknown>>
    // I2 isenta 50.00 | I3/I4 reduzida 100/6 | I5/I6 intermédia 200/26 | I7/I8 normal 300/69
    expect(breakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ region: 'PT', rate: 0, baseCents: 5000, vatCents: 0 }),
        expect.objectContaining({ region: 'PT', baseCents: 10000, vatCents: 600 }),
        expect.objectContaining({ region: 'PT', baseCents: 20000, vatCents: 2600 }),
        expect.objectContaining({ region: 'PT', baseCents: 30000, vatCents: 6900 }),
      ])
    )
  })

  it('AC-3.1.b [INV] — campos de origem QR nunca sobrescritos por IA posterior', async () => {
    const { office, doc } = await seedDoc('fx-qr-multirate.pdf')
    await parse(doc.id, office.id, 'ext-2a')

    // Re-parse (retry) — even if an AI response were queued, QR fields stay
    aiState.queue.push(scenarioValidExtraction({ supplierNif: '999999999', totalCents: 1 }))
    await parse(doc.id, office.id, 'ext-2b')

    const parsed = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(parsed.supplierNif).toBe('507111222')
    expect(String(parsed.totalAmount)).toBe('751')
    expect(parsed.extractionSource).toBe('QR')
  })

  it('AC-3.1.c [INV] — dinheiro em cêntimos/Decimal: 0.1+0.2 clássico soma exato (A1)', async () => {
    const { centsFromDecimalString, addCents, formatCents } = await import('@/lib/money')
    // The classic float trap: 0.10 + 0.20 must be exactly 0.30
    const a = centsFromDecimalString('0.10')
    const b = centsFromDecimalString('0.20')
    expect(addCents(a, b)).toBe(30)
    expect(formatCents(addCents(a, b))).toBe('0.30')
    // and large invoice sums stay exact to the cent
    const parts = ['1234.56', '0.01', '0.02', '9999.99'].map(centsFromDecimalString)
    expect(parts.reduce(addCents, 0)).toBe(1123458)
  })

  it('AC-3.2.a — fx-noqr-invoice com IA válida → objeto canónico completo, extractionSource=AI_*', async () => {
    const { office, doc } = await seedDoc('fx-noqr-invoice.pdf')
    aiState.queue.push(scenarioValidExtraction())
    await parse(doc.id, office.id, 'ext-3')

    const parsed = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(parsed.extractionSource).toMatch(/^AI_/)
    expect(parsed.supplierName).toBe('Fornecedor Gama Unipessoal Lda')
    expect(parsed.supplierNif).toBe('509888777')
    expect(parsed.documentNumber).toBe('FT 2026/55')
    expect(String(parsed.totalAmount)).toBe('246')
    expect(parsed.confidence).toBeGreaterThan(0.9)
  })

  it('AC-3.2.b [INV] — IA malformada → Zod rejeita → NEEDS_REVIEW, ZERO persistência parcial', async () => {
    const { office, doc } = await seedDoc('fx-noqr-invoice.pdf')
    aiState.queue.push(scenarioMalformed())
    await parse(doc.id, office.id, 'ext-4')

    const parsed = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(parsed.status).toBe('NEEDS_REVIEW')
    expect(parsed.supplierNif).toBeNull()
    expect(parsed.totalAmount).toBeNull()
    expect(parsed.vatBreakdown).toBeNull()
  })

  it('AC-3.2.c — recibo verde: withholding > 0 e coerência Σbases+ΣIVA−retenção=total', async () => {
    const { office, doc } = await seedDoc('fx-recibo-verde.pdf')
    aiState.queue.push(scenarioReciboVerde())
    await parse(doc.id, office.id, 'ext-5')

    const parsed = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(Number(parsed.withholdingAmount)).toBeGreaterThan(0)
    // 1000 + 230 − 250 = 980 → coherent, no mismatch flag
    expect(parsed.flags).not.toContain('ARITHMETIC_MISMATCH')
    expect(String(parsed.totalAmount)).toBe('980')
  })

  it('AC-3.2.d — incoerência de 5 cêntimos → NEEDS_REVIEW com flag; 1 cêntimo → passa (A1 tolerância 2c)', async () => {
    const first = await seedDoc('fx-noqr-invoice.pdf')
    aiState.queue.push(scenarioArithmeticMismatch(5))
    await parse(first.doc.id, first.office.id, 'ext-6a')
    const mismatched = await prisma.document.findUniqueOrThrow({ where: { id: first.doc.id } })
    expect(mismatched.flags).toContain('ARITHMETIC_MISMATCH')
    expect(mismatched.status).toBe('NEEDS_REVIEW')

    const second = await seedDoc('fx-noqr-invoice.pdf')
    aiState.queue.push(scenarioArithmeticMismatch(1))
    await parse(second.doc.id, second.office.id, 'ext-6b')
    const tolerated = await prisma.document.findUniqueOrThrow({ where: { id: second.doc.id } })
    expect(tolerated.flags).not.toContain('ARITHMETIC_MISMATCH')
  })

  it('AC-3.3.a — fx-ciuspt.xml → extração determinística, extractionSource=XML, zero IA', async () => {
    const { office, doc } = await seedDoc('fx-ciuspt.xml', 'application/xml')
    await parse(doc.id, office.id, 'ext-7')

    const parsed = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(aiState.calls).toBe(0)
    expect(parsed.extractionSource).toBe('XML')
    expect(parsed.supplierNif).toBe('508234567')
    expect(parsed.buyerNif).toBe('245678901')
    expect(parsed.documentNumber).toBe('FT X/42')
    expect(String(parsed.totalAmount)).toBe('123')
  })

  it('AC-3.3.b — XML aleatório → fallback IA sem crash', async () => {
    const { office, doc } = await seedDoc('fx-xml-random.xml', 'application/xml')
    aiState.queue.push(scenarioValidExtraction({ type: 'OTHER', confidence: 0.5 }))
    await parse(doc.id, office.id, 'ext-8')

    expect(aiState.calls).toBe(1)
    const parsed = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(parsed.id).toBe(doc.id) // no crash; document survived the fallback
  })

  it('AC-3.4.a/b [INV] — duplicado detetado com normalização do documentNumber (A8)', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })

    const first = await createManualDocument({
      officeId: office.id,
      uploadedByUserId: owner.id,
      filename: 'fx-qr-single.pdf',
      mimeType: 'application/pdf',
      buffer: fx('fx-qr-single.pdf'),
      clientId: null,
    })
    await parse(first.id, office.id, 'dup-1')

    const second = await createManualDocument({
      officeId: office.id,
      uploadedByUserId: owner.id,
      filename: 'fx-qr-single-copy.pdf',
      mimeType: 'application/pdf',
      buffer: fx('fx-qr-single.pdf'),
      clientId: null,
    })
    await parse(second.id, office.id, 'dup-2')

    const dup = await prisma.document.findUniqueOrThrow({ where: { id: second.id } })
    expect(dup.flags).toContain('DUPLICATE_SUSPECT')
    expect(dup.duplicateOfId).toBe(first.id)

    // Normalization: " ft a/123 " equals "FT A/123"
    const { normalizeDocumentNumber } = await import('@/server/services/extraction')
    expect(normalizeDocumentNumber(' ft   a/123 ')).toBe('FT A/123')
    expect(normalizeDocumentNumber('FT A/123')).toBe('FT A/123')
  })

  it('AC-3.4.c [INV] — colisão na unique parcial tratada como suspeito, nunca 500 (A8)', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    const mk = () =>
      createManualDocument({
        officeId: office.id,
        uploadedByUserId: owner.id,
        filename: 'fx-qr-single.pdf',
        mimeType: 'application/pdf',
        buffer: fx('fx-qr-single.pdf'),
        clientId: null,
      })
    const d1 = await mk()
    const d2 = await mk()

    // Concurrent parses of identical authoritative documents — the partial
    // unique index decides; the loser must become DUPLICATE_SUSPECT, not a 500
    await Promise.all([
      parse(d1.id, office.id, 'dup-3a'),
      parse(d2.id, office.id, 'dup-3b'),
    ])

    const docs = await prisma.document.findMany({ where: { id: { in: [d1.id, d2.id] } } })
    const flagged = docs.filter((d) => d.flags.includes('DUPLICATE_SUSPECT'))
    expect(flagged).toHaveLength(1)
  })

  it('AC-3.4.d — docs distintos do mesmo fornecedor sem flag', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })

    const a = await createManualDocument({
      officeId: office.id,
      uploadedByUserId: owner.id,
      filename: 'fx-qr-single.pdf',
      mimeType: 'application/pdf',
      buffer: fx('fx-qr-single.pdf'),
      clientId: null,
    })
    await parse(a.id, office.id, 'dup-4a')

    const b = await createManualDocument({
      officeId: office.id,
      uploadedByUserId: owner.id,
      filename: 'fx-qr-multirate.pdf',
      mimeType: 'application/pdf',
      buffer: fx('fx-qr-multirate.pdf'),
      clientId: null,
    })
    await parse(b.id, office.id, 'dup-4b')

    const parsedB = await prisma.document.findUniqueOrThrow({ where: { id: b.id } })
    expect(parsedB.flags).not.toContain('DUPLICATE_SUSPECT')
  })
})
