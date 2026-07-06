import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { truncateAll, prisma } from '../helpers/db'
import { makeOffice, makeUser } from '../helpers/factories'
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

import { POST as importRoute } from '@/app/api/documents/import/route'
import { POST as confirmRoute } from '@/app/api/documents/import/[batchId]/confirm/route'
import { aiState, scenarioImportMapping } from '../mocks/ai'

function importRequest(fixtureName: string) {
  const form = new FormData()
  form.append(
    'file',
    new File([new Uint8Array(readFileSync(fixturePath(fixtureName)))], fixtureName, { type: 'text/csv' })
  )
  return new NextRequest('http://localhost:3000/api/documents/import', { method: 'POST', body: form })
}

function confirmRequest(batchId: string, mapping?: unknown) {
  return new NextRequest(`http://localhost:3000/api/documents/import/${batchId}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mapping ? { mapping } : {}),
  })
}

describe('AC-2.5 Import sheet (§2.4)', () => {
  beforeEach(async () => {
    await truncateAll()
    setSession(null)
    resetRateLimits()
    aiState.reset()
    queueAddMock.mockClear()
  })

  async function actAsOwner() {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    setSession({ id: owner.id, email: owner.email, officeId: office.id, role: 'OWNER' })
    return { office, owner }
  }

  it('AC-2.5.a — mapeamento IA apresentado; após confirmação, N Documents IMPORT sem parse IA', async () => {
    const { office } = await actAsOwner()
    aiState.queue.push(scenarioImportMapping())

    const res = await importRoute(importRequest('fx-sheet-valid.csv'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.batchId).toBeTruthy()
    expect(body.data.proposedMapping).toMatchObject({ supplierNif: 'nif' })

    const aiCallsAfterMapping = aiState.calls

    const confirm = await confirmRoute(confirmRequest(body.data.batchId, body.data.proposedMapping), {
      params: Promise.resolve({ batchId: body.data.batchId }),
    })
    expect(confirm.status).toBe(200)

    const docs = await prisma.document.findMany({ where: { officeId: office.id } })
    expect(docs).toHaveLength(3)
    for (const doc of docs) {
      expect(doc.source).toBe('IMPORT')
      expect(doc.extractionSource).toBe('IMPORT')
      expect(doc.status).toBe('NEEDS_REVIEW') // estado direto para revisão
    }
    // Nenhuma chamada de parsing IA para documentos IMPORT
    expect(aiState.calls).toBe(aiCallsAfterMapping)
    expect(queueAddMock).not.toHaveBeenCalled()
  })

  it('AC-2.5.b — 10 linhas, 2 más → 8 importadas, relatório identifica linha e motivo', async () => {
    const { office } = await actAsOwner()
    aiState.queue.push(scenarioImportMapping())

    const res = await importRoute(importRequest('fx-sheet-2bad.csv'))
    const body = await res.json()
    const confirm = await confirmRoute(confirmRequest(body.data.batchId, body.data.proposedMapping), {
      params: Promise.resolve({ batchId: body.data.batchId }),
    })
    expect(confirm.status).toBe(200)
    const report = (await confirm.json()).data.report

    expect(await prisma.document.count({ where: { officeId: office.id } })).toBe(8)
    expect(report.errors).toHaveLength(2)
    const reasons = JSON.stringify(report.errors)
    expect(reasons).toContain('NIF')      // checksum inválido (linha 2)
    expect(reasons).toContain('total')    // base+IVA ≠ total (linha 4)
    const lines = report.errors.map((e: { line: number }) => e.line).sort()
    expect(lines).toEqual([2, 4])
  })

  it('AC-2.5.c [INV] — import NUNCA acontece sem confirmação; segunda confirmação → 409', async () => {
    const { office } = await actAsOwner()
    aiState.queue.push(scenarioImportMapping())

    const res = await importRoute(importRequest('fx-sheet-valid.csv'))
    const body = await res.json()

    // No documents exist before confirmation
    expect(await prisma.document.count({ where: { officeId: office.id } })).toBe(0)
    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: body.data.batchId } })
    expect(batch.status).toBe('PENDING_CONFIRMATION')

    await confirmRoute(confirmRequest(body.data.batchId, body.data.proposedMapping), {
      params: Promise.resolve({ batchId: body.data.batchId }),
    })

    // Re-confirming an already-imported batch is a conflict — never double import
    const again = await confirmRoute(confirmRequest(body.data.batchId, body.data.proposedMapping), {
      params: Promise.resolve({ batchId: body.data.batchId }),
    })
    expect(again.status).toBe(409)
    expect(await prisma.document.count({ where: { officeId: office.id } })).toBe(3)
  })
})
