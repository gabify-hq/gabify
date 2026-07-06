import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { truncateAll, prisma } from '../helpers/db'
import { makeTwoOffices, makeUser, makeClient } from '../helpers/factories'
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

import { POST as uploadRoute } from '@/app/api/documents/upload/route'
import { processDocumentParse } from '@/queues/document-parse.processor'
import { aiState } from '../mocks/ai'
import { r2Store } from '../mocks/r2'

function fx(name: string): Buffer {
  return readFileSync(fixturePath(name))
}

function uploadRequest(files: Array<{ name: string; data: Buffer; type?: string }>, clientId?: string) {
  const form = new FormData()
  for (const f of files) {
    form.append('files', new File([new Uint8Array(f.data)], f.name, { type: f.type ?? 'application/octet-stream' }))
  }
  if (clientId) form.append('clientId', clientId)
  return new NextRequest('http://localhost:3000/api/documents/upload', {
    method: 'POST',
    body: form,
  })
}

async function setupOffice() {
  const { officeA, officeB, ownerA, ownerB } = await makeTwoOffices()
  return { officeA, officeB, ownerA, ownerB }
}

describe('AC-2.1 Upload manual (§2.1, A4)', () => {
  beforeEach(async () => {
    await truncateAll()
    setSession(null)
    resetRateLimits()
    queueAddMock.mockClear()
    aiState.reset()
    r2Store.clear()
  })

  it('AC-2.1.a — PDF válido cria Document MANUAL_UPLOAD, enfileira parse e percorre o MESMO pipeline', async () => {
    const { officeA, ownerA } = await setupOffice()
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })

    const res = await uploadRoute(uploadRequest([{ name: 'fatura.pdf', data: fx('fx-qr-single.pdf'), type: 'application/pdf' }]))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.created).toHaveLength(1)

    const doc = await prisma.document.findFirstOrThrow({ where: { officeId: officeA.id } })
    expect(doc.source).toBe('MANUAL_UPLOAD')
    expect(doc.r2Key).not.toBeNull()
    expect(queueAddMock).toHaveBeenCalledTimes(1)

    // Same pipeline: run the parse processor on the queued payload — the QR
    // path classifies without AI and fills rich fields
    await processDocumentParse({ documentId: doc.id, officeId: officeA.id }, 'upl-job-1')
    const parsed = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(parsed.type).toBe('INVOICE_RECEIVED')
    expect(parsed.supplierNif).toBe('508234567')
    expect(parsed.extractionSource).toBe('QR')
    expect(aiState.calls).toBe(0)
  })

  it('AC-2.1.b [INV] — fx-fake-pdf.exe.pdf (magic bytes não-PDF) → 422 rejeitado', async () => {
    const { officeA, ownerA } = await setupOffice()
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })

    const res = await uploadRoute(uploadRequest([{ name: 'fatura.pdf', data: fx('fx-fake-pdf.exe.pdf'), type: 'application/pdf' }]))
    expect(res.status).toBe(422)
    expect(await prisma.document.count()).toBe(0)
    expect(queueAddMock).not.toHaveBeenCalled()
  })

  it('AC-2.1.c — >25MB → 413; 11 ficheiros → 400; tipo não suportado → 415; batch parcial reporta o mau', async () => {
    const { officeA, ownerA } = await setupOffice()
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })

    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(26 * 1024 * 1024, 0x20)])
    const tooBig = await uploadRoute(uploadRequest([{ name: 'grande.pdf', data: big, type: 'application/pdf' }]))
    expect(tooBig.status).toBe(413)

    const many = Array.from({ length: 11 }, (_, i) => ({
      name: `f${i}.pdf`,
      data: fx('fx-noqr-invoice.pdf'),
      type: 'application/pdf',
    }))
    const tooMany = await uploadRoute(uploadRequest(many))
    expect(tooMany.status).toBe(400)

    const unsupported = await uploadRoute(
      uploadRequest([{ name: 'video.mp4', data: Buffer.from('\x00\x00\x00 ftypmp42data'), type: 'video/mp4' }])
    )
    expect(unsupported.status).toBe(415)

    // Batch with one bad file: good ones enter, report identifies the bad one
    const mixed = await uploadRoute(
      uploadRequest([
        { name: 'ok.pdf', data: fx('fx-noqr-invoice.pdf'), type: 'application/pdf' },
        { name: 'mau.pdf', data: fx('fx-fake-pdf.exe.pdf'), type: 'application/pdf' },
      ])
    )
    expect(mixed.status).toBe(207)
    const body = await mixed.json()
    expect(body.data.created).toHaveLength(1)
    expect(body.data.errors).toHaveLength(1)
    expect(body.data.errors[0].filename).toBe('mau.pdf')
  })

  it('AC-2.1.d [INV] — zip-bomb rejeitado antes de extração; ZIP válido com 3 PDFs → 3 Documents', async () => {
    const { officeA, ownerA } = await setupOffice()
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })

    const bomb = await uploadRoute(
      uploadRequest([{ name: 'arquivo.zip', data: fx('fx-zipbomb.zip'), type: 'application/zip' }])
    )
    expect(bomb.status).toBe(422)
    expect(await prisma.document.count()).toBe(0)

    const ok = await uploadRoute(
      uploadRequest([{ name: 'faturas.zip', data: fx('fx-zip-3pdfs.zip'), type: 'application/zip' }])
    )
    expect(ok.status).toBe(201)
    expect(await prisma.document.count()).toBe(3)
  })

  it('AC-2.1.e [INV] — VIEWER bloqueado; upload de A nunca visível em B', async () => {
    const { officeA, officeB, ownerA, ownerB } = await setupOffice()
    const viewer = await makeUser({ officeId: officeA.id, role: 'VIEWER' })

    setSession({ id: viewer.id, email: viewer.email, officeId: officeA.id, role: 'VIEWER' })
    const denied = await uploadRoute(
      uploadRequest([{ name: 'f.pdf', data: fx('fx-noqr-invoice.pdf'), type: 'application/pdf' }])
    )
    expect([403, 404]).toContain(denied.status)
    expect(await prisma.document.count()).toBe(0)

    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })
    await uploadRoute(uploadRequest([{ name: 'f.pdf', data: fx('fx-noqr-invoice.pdf'), type: 'application/pdf' }]))

    // Office B sees nothing
    const officeBDocs = await prisma.document.findMany({ where: { officeId: officeB.id } })
    expect(officeBDocs).toHaveLength(0)
    void ownerB
  })

  it('AC-2.1.f — sem clientId: NIF adquirente do QR corresponde a cliente → auto-associado', async () => {
    const { officeA, ownerA } = await setupOffice()
    const client = await makeClient({ officeId: officeA.id, nif: '123456789' }) // QR_SINGLE B:123456789
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })

    await uploadRoute(uploadRequest([{ name: 'fatura.pdf', data: fx('fx-qr-single.pdf'), type: 'application/pdf' }]))
    const doc = await prisma.document.findFirstOrThrow({ where: { officeId: officeA.id } })
    expect(doc.clientId).toBeNull() // ainda por classificar

    await processDocumentParse({ documentId: doc.id, officeId: officeA.id }, 'upl-job-f')
    const parsed = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(parsed.clientId).toBe(client.id)
  })
})
