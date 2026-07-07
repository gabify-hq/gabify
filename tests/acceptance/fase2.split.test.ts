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
import { aiState, scenarioSplitBoundaries } from '../mocks/ai'
import { r2Store } from '../mocks/r2'

function fx(name: string): Buffer {
  return readFileSync(fixturePath(name))
}

async function seedDoc(fixture: string) {
  const office = await makeOffice()
  const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
  const doc = await createManualDocument({
    officeId: office.id,
    uploadedByUserId: owner.id,
    filename: fixture,
    mimeType: 'application/pdf',
    buffer: fx(fixture),
    clientId: null,
  })
  return { office, owner, doc }
}

describe('AC-2.3 Split multi-fatura (§2.3, A6)', () => {
  beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
    aiState.reset()
    r2Store.clear()
    queueAddMock.mockClear()
  })

  it('AC-2.3.a — 3 QRs distintos → 3 filhos com page-ranges e PDFs no R2, zero IA', async () => {
    const { office, doc } = await seedDoc('fx-multi-invoice.pdf')
    await processDocumentParse({ documentId: doc.id, officeId: office.id }, 'split-1')

    const parent = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(parent.status).toBe('SPLIT')
    expect(aiState.calls).toBe(0)

    const children = await prisma.document.findMany({
      where: { parentDocumentId: doc.id },
      orderBy: { pageStart: 'asc' },
    })
    expect(children).toHaveLength(3)
    expect(children.map((c) => [c.pageStart, c.pageEnd])).toEqual([[1, 1], [2, 2], [3, 3]])
    for (const child of children) {
      expect(child.r2Key).not.toBeNull()
      expect(r2Store.has(child.r2Key!)).toBe(true)
    }
    // 3 parse jobs queued for the children
    expect(queueAddMock).toHaveBeenCalledTimes(3)
  })

  it('AC-2.3.a2 — filhos processados carregam os campos do QR respetivo', async () => {
    const { office, doc } = await seedDoc('fx-multi-invoice.pdf')
    await processDocumentParse({ documentId: doc.id, officeId: office.id }, 'split-2')

    const children = await prisma.document.findMany({
      where: { parentDocumentId: doc.id },
      orderBy: { pageStart: 'asc' },
    })
    for (const [i, child] of children.entries()) {
      await processDocumentParse({ documentId: child.id, officeId: office.id }, `split-2c${i}`)
    }
    const parsed = await prisma.document.findMany({
      where: { parentDocumentId: doc.id },
      orderBy: { pageStart: 'asc' },
    })
    expect(parsed.map((c) => c.supplierNif)).toEqual(['507111222', '509888777', '506555444'])
    expect(aiState.calls).toBe(0)
  })

  it('AC-2.3.b — fatura única com QR → nenhum split', async () => {
    const { office, doc } = await seedDoc('fx-qr-single.pdf')
    await processDocumentParse({ documentId: doc.id, officeId: office.id }, 'split-3')

    expect(await prisma.document.count({ where: { parentDocumentId: doc.id } })).toBe(0)
    const parsed = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(parsed.status).not.toBe('SPLIT')
  })

  it('AC-2.3.c — 5 págs sem QR, IA confidence 0.6 → NÃO splita; sugestão persistida; NEEDS_REVIEW', async () => {
    const { office, doc } = await seedDoc('fx-5page-noqr.pdf')
    // 1st AI call: boundary detection (low confidence); 2nd: classification fallback
    aiState.queue.push(scenarioSplitBoundaries(0.6))
    aiState.queue.push(
      JSON.stringify({ type: 'OTHER', confidence: 0.5, reasoning: 'multipágina ambíguo' })
    )
    await processDocumentParse({ documentId: doc.id, officeId: office.id }, 'split-4')

    expect(await prisma.document.count({ where: { parentDocumentId: doc.id } })).toBe(0)
    const parsed = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(parsed.status).toBe('NEEDS_REVIEW')

    const cache = await prisma.documentSplitCache.findFirst({
      where: { officeId: office.id, sha256: parsed.contentSha256! },
    })
    expect(cache).not.toBeNull()
    const boundaries = cache!.boundaries as { invoices?: unknown[] }
    expect(boundaries).toBeTruthy()
  })

  it('AC-2.3.d — 51 páginas sem QR → TOO_LARGE_FOR_AUTOSPLIT, zero chamadas IA de split (A6)', async () => {
    const { office, doc } = await seedDoc('fx-51page-noqr.pdf')
    // Only the classification fallback may call AI — queue one response for it
    aiState.queue.push(JSON.stringify({ type: 'OTHER', confidence: 0.4, reasoning: 'grande demais' }))
    await processDocumentParse({ documentId: doc.id, officeId: office.id }, 'split-5')

    const parsed = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(parsed.flags).toContain('TOO_LARGE_FOR_AUTOSPLIT')
    expect(await prisma.document.count({ where: { parentDocumentId: doc.id } })).toBe(0)
    // At most the classification call — never a split-detection call
    expect(aiState.calls).toBeLessThanOrEqual(1)
  })

  it('AC-2.3.e — mesmo binário re-submetido → split vem da cache sha256, zero novas chamadas IA (A6)', async () => {
    const first = await seedDoc('fx-5page-noqr.pdf')
    aiState.queue.push(scenarioSplitBoundaries(0.95)) // high confidence → splits
    await processDocumentParse({ documentId: first.doc.id, officeId: first.office.id }, 'split-6a')
    const firstChildren = await prisma.document.count({ where: { parentDocumentId: first.doc.id } })
    expect(firstChildren).toBe(2)
    expect(aiState.calls).toBe(1)

    // Same binary, same office → cache hit, no AI
    const owner = await prisma.user.findFirstOrThrow({ where: { officeId: first.office.id } })
    const again = await createManualDocument({
      officeId: first.office.id,
      uploadedByUserId: owner.id,
      filename: 'fx-5page-noqr-copy.pdf',
      mimeType: 'application/pdf',
      buffer: fx('fx-5page-noqr.pdf'),
      clientId: null,
    })
    await processDocumentParse({ documentId: again.id, officeId: first.office.id }, 'split-6b')

    expect(aiState.calls).toBe(1) // unchanged
    expect(await prisma.document.count({ where: { parentDocumentId: again.id } })).toBe(2)
  })
})
