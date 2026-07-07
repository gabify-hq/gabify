import { describe, it, expect, beforeEach, vi } from 'vitest'
import AdmZip from 'adm-zip'
import { truncateAll, prisma } from '../helpers/db'
import { makeTwoOffices, makeUser, makeClient } from '../helpers/factories'
import { setSession, authMockFactory, type TestSessionUser } from '../helpers/session'
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

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>()
  return {
    ...actual,
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      refresh: vi.fn(),
      back: vi.fn(),
      prefetch: vi.fn(),
    }),
    usePathname: () => '/',
    useSearchParams: () => new URLSearchParams(),
  }
})

import { r2Store } from '../mocks/r2'
import { POST as createExportRoute } from '@/app/api/exports/route'
import { GET as downloadRoute } from '@/app/api/exports/[batchId]/download/route'

/**
 * AUDIT F1.3 — UI de exportação (REVIEW_ISSUES C-3, UX jornada 5).
 * O motor de export existe e está testado (fase3.export); este slice liga-o
 * ao mundo: POST enfileira um job (nunca corre no request), o processor corre
 * o MESMO motor, o histórico mostra o estado, e o download usa signed URL.
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

async function makeValidatedDoc(officeId: string, clientId: string) {
  const r2Key = `${officeId}/uploads/doc-export/FT-A-1.pdf`
  r2Store.set(r2Key, Buffer.from('%PDF-1.4 fake'))
  return prisma.document.create({
    data: {
      officeId,
      clientId,
      source: 'MANUAL_UPLOAD',
      status: 'VALIDATED',
      type: 'INVOICE_RECEIVED',
      confidence: 0.98,
      documentNumber: 'FT A-1',
      supplierName: 'Fornecedor Export',
      supplierNif: '508234567',
      issueDate: new Date(Date.UTC(2026, 2, 15, 12)),
      totalAmount: '123.00',
      netAmount: '100.00',
      vatAmount: '23.00',
      vatBreakdown: [{ region: 'PT', rate: 23, baseCents: 10000, vatCents: 2300 }],
      originalFilename: 'FT-A-1.pdf',
      r2Key,
    },
  })
}

describe('AUDIT-F1.3 export pela UI', () => {
  beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
    setSession(null)
    queueAddMock.mockClear()
    r2Store.clear()
  })

  it('POST /api/exports enfileira um job e devolve 202 — nunca corre no request', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    asSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })

    const res = await createExportRoute(
      jsonRequest('/api/exports', 'POST', { periodFrom: '2026-03', periodTo: '2026-03' }),
    )
    expect(res.status).toBe(202)
    expect(queueAddMock).toHaveBeenCalledTimes(1)
    const [jobName, payload] = queueAddMock.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(jobName).toBe('run-export')
    expect(payload.officeId).toBe(officeA.id)
    expect(payload.periodFrom).toBe('2026-03')

    // Nenhum batch criado no request — o motor só corre no worker
    expect(await prisma.exportBatch.count()).toBe(0)
  })

  it('processExport corre o motor real: batch COMPLETED, ZIP no R2, download por signed URL', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const client = await makeClient({ officeId: officeA.id, name: 'Cliente Export Lda' })
    await makeValidatedDoc(officeA.id, client.id)

    const { processExport } = await import('@/queues/export.processor')
    const result = await processExport(
      {
        officeId: officeA.id,
        userId: ownerA.id,
        clientIds: [client.id],
        periodFrom: '2026-03',
        periodTo: '2026-03',
        includeExported: false,
      },
      'job-export-1',
    )
    expect(result.ok).toBe(true)

    const batch = await prisma.exportBatch.findFirstOrThrow({ where: { officeId: officeA.id } })
    expect(batch.status).toBe('COMPLETED')
    expect(batch.r2Key).not.toBeNull()
    expect(batch.documentCount).toBe(1)

    // O MESMO ZIP que o teste do motor valida
    const zip = new AdmZip(r2Store.get(batch.r2Key!)!)
    const names = zip.getEntries().map((e) => e.entryName)
    expect(names).toContain('lancamentos.csv')
    expect(names).toContain('resumo_iva.csv')
    expect(names).toContain('Cliente Export Lda/2026/03/Recebidas/FT A-1-508234567.pdf')

    // Download pela rota — signed URL
    asSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })
    const dl = await downloadRoute(jsonRequest(`/api/exports/${batch.id}/download`, 'GET'), {
      params: Promise.resolve({ batchId: batch.id }),
    })
    expect(dl.status).toBe(200)
    const dlBody = await dl.json()
    expect(dlBody.data.url).toContain('https://signed.test/')

    // JobLog do worker registado
    const log = await prisma.jobLog.findFirst({ where: { officeId: officeA.id, queue: 'export' } })
    expect(log).not.toBeNull()
    expect(log!.status).toBe('COMPLETED')
  })

  it('processExport com pedido inválido regista batch FAILED visível no histórico + JobLog FAILED', async () => {
    const { officeA, ownerA } = await makeTwoOffices()

    const { processExport } = await import('@/queues/export.processor')
    const result = await processExport(
      {
        officeId: officeA.id,
        userId: ownerA.id,
        periodFrom: 'not-a-period',
        periodTo: 'not-a-period',
        includeExported: false,
      },
      'job-export-2',
    )
    expect(result.ok).toBe(false)

    const failed = await prisma.exportBatch.findFirst({
      where: { officeId: officeA.id, status: 'FAILED' },
    })
    expect(failed).not.toBeNull()

    const log = await prisma.jobLog.findFirst({ where: { officeId: officeA.id, queue: 'export' } })
    expect(log!.status).toBe('FAILED')
  })

  it('VIEWER não exporta (can) — POST recusado e nada enfileirado', async () => {
    const { officeA } = await makeTwoOffices()
    const viewer = await makeUser({ officeId: officeA.id, role: 'VIEWER' })
    asSession({ id: viewer.id, email: viewer.email, officeId: officeA.id, role: 'VIEWER' })

    const res = await createExportRoute(
      jsonRequest('/api/exports', 'POST', { periodFrom: '2026-03', periodTo: '2026-03' }),
    )
    expect([403, 404]).toContain(res.status)
    expect(queueAddMock).not.toHaveBeenCalled()
  })

  it('página /exports mostra formulário com clientes e histórico com estado + download', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const client = await makeClient({ officeId: officeA.id, name: 'Cliente Visível Lda' })
    await prisma.exportBatch.create({
      data: {
        officeId: officeA.id,
        createdByUserId: ownerA.id,
        filters: { clientIds: [client.id], periodFrom: '2026-03', periodTo: '2026-03' },
        status: 'COMPLETED',
        r2Key: 'x/exports/z.zip',
        documentCount: 4,
      },
    })
    await prisma.exportBatch.create({
      data: {
        officeId: officeA.id,
        createdByUserId: ownerA.id,
        filters: { periodFrom: '2026-04', periodTo: '2026-04' },
        status: 'FAILED',
        documentCount: 0,
      },
    })

    asSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })
    const { default: Page } = await import('@/app/(dashboard)/exports/page')
    const jsx = await Page()
    const { renderToStaticMarkup } = await import('react-dom/server')
    const html = renderToStaticMarkup(jsx)

    expect(html).toContain('Cliente Visível Lda')
    expect(html).toMatch(/Exportar/)
    expect(html).toMatch(/Concluído/)
    expect(html).toMatch(/Falhou/)
    expect(html).toMatch(/Descarregar/)
  })
})
