import { describe, it, expect, beforeEach, vi } from 'vitest'
import { truncateAll, prisma } from '../helpers/db'
import { makeOffice, makeUser, makeClient } from '../helpers/factories'
import { encryptToken } from '@/lib/crypto'

// The AI pipeline must NEVER run for API_PULL documents [INV] — any touch fails.
vi.mock('@/lib/anthropic', () => ({
  anthropic: new Proxy(
    {},
    {
      get() {
        throw new Error('AI pipeline touched during InvoiceXpress pull — [INV] violated')
      },
    },
  ),
  CLAUDE_MODEL: 'claude-test',
}))

const queueAddMock = vi.fn(async () => ({}))
vi.mock('@/lib/redis', () => ({
  getEmailSyncQueue: () => ({ add: queueAddMock }),
  getDocumentParseQueue: () => ({ add: queueAddMock }),
  getInvoicexpressPullQueue: () => ({ add: queueAddMock }),
  QUEUE_INVOICEXPRESS_PULL: 'invoicexpress-pull',
  DEFAULT_JOB_OPTIONS: {},
  redisConnection: {},
}))

vi.mock('@/lib/r2', async () => (await import('../mocks/r2')).r2MockFactory())

import { pullDocumentsForInvoicexpressConnection } from '@/server/sources/invoicexpress/invoicexpress-pull-service'
import { processInvoicexpressPull } from '@/queues/invoicexpress-pull.processor'
import { getPushEligibilityError } from '@/server/toconline/toconline-push-service'
import type { Document } from '@prisma/client'

const ACCOUNT_NAME = 'demo-firm'
const API_KEY = 'sk-live-SUPER-SECRET-0123456789abcdef'
const RESOLVED_NIF = '229659179'

/** A finalized invoice with IVA 23% + 25% IRS retention (freelancer case). */
function invoice(id: number, clientExternalId: number) {
  return {
    id,
    status: 'sent',
    archived: false,
    type: 'Invoice',
    sequence_number: `A/${id}`,
    date: '27/06/2026',
    due_date: '27/07/2026',
    retention: '25.0',
    permalink: `https://www.app.invoicexpress.com/documents/${id}`,
    sum: 1000.0,
    before_taxes: 1000.0,
    taxes: 230.0,
    total: 1230.0,
    currency: 'Euro',
    client: { id: clientExternalId, name: 'Cliente Final Lda', country: 'Portugal' },
    items: [
      {
        name: 'Consultoria',
        description: 'Avença mensal',
        unit_price: '1000.0',
        unit: 'service',
        quantity: '1.0',
        discount: 0,
        subtotal: 1000.0,
        tax_amount: 230.0,
        discount_amount: 0,
        total: 1230.0,
        tax: { id: 31597, name: 'IVA23', value: 23 },
      },
    ],
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** Mock IVX API: one invoices page, /clients/{id} for NIF, and PDF endpoints. */
function makeIvxMock(invoices: ReturnType<typeof invoice>[]) {
  const clientCalls: string[] = []
  const requestedUrls: string[] = []
  const fetchImpl: typeof fetch = async (input) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    requestedUrls.push(href)
    const url = new URL(href)

    if (url.pathname === '/invoices.json') {
      return jsonResponse({
        invoices,
        pagination: { total_entries: invoices.length, per_page: 30, current_page: 1, total_pages: 1 },
      })
    }
    const clientMatch = /^\/clients\/(\d+)\.json$/.exec(url.pathname)
    if (clientMatch) {
      clientCalls.push(clientMatch[1])
      return jsonResponse({ client: { id: Number(clientMatch[1]), name: 'Cliente Final Lda', fiscal_id: RESOLVED_NIF } })
    }
    if (/^\/api\/pdf\/\d+\.json$/.test(url.pathname)) {
      return jsonResponse({ output: { pdfUrl: 'https://invoicexpress-files.example/doc.pdf' } })
    }
    if (url.host === 'invoicexpress-files.example') {
      return new Response('%PDF-1.4 fake', { status: 200, headers: { 'Content-Type': 'application/pdf' } })
    }
    return jsonResponse({ errors: { error: 'not found' } }, 404)
  }
  return { fetchImpl, clientCalls, requestedUrls }
}

async function seedConnection(params?: { pullEnabled?: boolean }) {
  const office = await makeOffice()
  const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
  const client = await makeClient({ officeId: office.id, name: 'Cliente IVX' })
  const connection = await prisma.invoicexpressConnection.create({
    data: {
      officeId: office.id,
      clientId: client.id,
      accountName: ACCOUNT_NAME,
      apiKey: encryptToken(API_KEY),
      pullEnabled: params?.pullEnabled ?? true,
    },
  })
  return { office, owner, client, connection }
}

const fastDeps = (fetchImpl: typeof fetch) => ({ fetchImpl, minIntervalMs: 0 })

describe('InvoiceXpress — pull de faturas emitidas [INV]', () => {
  beforeEach(async () => {
    await truncateAll()
    queueAddMock.mockReset()
  })

  it('IX.a [INV retenção+cêntimos] fatura com retenção IRS → withholding exato, EMITIDA, API_PULL, PRE_VALIDATED', async () => {
    const { office, owner, client, connection } = await seedConnection()
    const mock = makeIvxMock([invoice(900001, 1310176)])

    const result = await pullDocumentsForInvoicexpressConnection(
      { connectionId: connection.id, officeId: office.id, userId: owner.id },
      fastDeps(mock.fetchImpl),
    )
    expect(result.ok).toBe(true)
    expect(result.imported).toBe(1)

    const doc = await prisma.document.findFirstOrThrow({ where: { officeId: office.id, clientId: client.id } })
    expect(doc.source).toBe('API_PULL')
    expect(doc.type).toBe('INVOICE_ISSUED')
    expect(doc.status).toBe('PRE_VALIDATED')
    expect(doc.confidence).toBe(1.0)
    expect(doc.documentNumber).toBe('A/900001')
    expect(Number(doc.totalAmount)).toBe(1230)
    expect(Number(doc.withholdingAmount)).toBe(250) // 25% of 1000.00, derived
    expect(doc.buyerNif).toBe(RESOLVED_NIF) // resolved via /clients

    const bands = doc.vatBreakdown as unknown as Array<{ rate: number; baseCents: number; vatCents: number }>
    expect(bands).toEqual([{ region: 'PT', rate: 23, baseCents: 100000, vatCents: 23000 }])
  })

  it('IX.b [INV NIF] N documentos do mesmo cliente final → UMA chamada a /clients', async () => {
    const { office, owner, connection } = await seedConnection()
    const mock = makeIvxMock([invoice(900001, 55), invoice(900002, 55), invoice(900003, 55)])

    const result = await pullDocumentsForInvoicexpressConnection(
      { connectionId: connection.id, officeId: office.id, userId: owner.id },
      fastDeps(mock.fetchImpl),
    )
    expect(result.imported).toBe(3)
    expect(mock.clientCalls).toEqual(['55']) // exactly one lookup for the three docs

    const docs = await prisma.document.findMany({ where: { officeId: office.id } })
    expect(docs).toHaveLength(3)
    expect(docs.every((d) => d.buyerNif === RESOLVED_NIF)).toBe(true)

    // CLIENT cache row persisted for future runs
    const cache = await prisma.sourceEntityMap.findFirstOrThrow({
      where: { clientId: connection.clientId, system: 'INVOICEXPRESS', entityType: 'CLIENT', externalId: '55' },
    })
    expect(cache.value).toBe(RESOLVED_NIF)
  })

  it('IX.c [INV dedup] segundo pull do mesmo id → zero novos', async () => {
    const { office, owner, connection } = await seedConnection()
    const first = await pullDocumentsForInvoicexpressConnection(
      { connectionId: connection.id, officeId: office.id, userId: owner.id },
      fastDeps(makeIvxMock([invoice(900001, 55), invoice(900002, 55)]).fetchImpl),
    )
    expect(first.imported).toBe(2)

    const second = await pullDocumentsForInvoicexpressConnection(
      { connectionId: connection.id, officeId: office.id, userId: owner.id },
      fastDeps(makeIvxMock([invoice(900001, 55), invoice(900002, 55)]).fetchImpl),
    )
    expect(second.ok).toBe(true)
    expect(second.imported).toBe(0)
    expect(second.skippedKnown).toBe(2)
    expect(await prisma.document.count({ where: { officeId: office.id } })).toBe(2)
  })

  it('IX.d [INV] IA nunca corre e nenhum job de parse é enfileirado', async () => {
    const { office, owner, connection } = await seedConnection()
    const result = await pullDocumentsForInvoicexpressConnection(
      { connectionId: connection.id, officeId: office.id, userId: owner.id },
      fastDeps(makeIvxMock([invoice(900001, 55)]).fetchImpl),
    )
    expect(result.ok).toBe(true)
    const parseJobs = (queueAddMock.mock.calls as unknown as Array<[string]>).filter(
      ([name]) => name !== 'invoicexpress-pull',
    )
    expect(parseJobs).toHaveLength(0)
  })

  it('IX.e [INV cross-tenant] pull com officeId de outro gabinete → 404 lógico, nada importado', async () => {
    const { connection } = await seedConnection()
    const other = await makeOffice()
    const result = await pullDocumentsForInvoicexpressConnection(
      { connectionId: connection.id, officeId: other.id, userId: null },
      fastDeps(makeIvxMock([invoice(900001, 55)]).fetchImpl),
    )
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/não encontrada/i)
    expect(await prisma.document.count()).toBe(0)
  })

  it('IX.f [INV] a api_key fica cifrada na BD (nunca em claro)', async () => {
    const { office, owner, connection } = await seedConnection()
    await pullDocumentsForInvoicexpressConnection(
      { connectionId: connection.id, officeId: office.id, userId: owner.id },
      fastDeps(makeIvxMock([invoice(900001, 55)]).fetchImpl),
    )
    const raw = await prisma.invoicexpressConnection.findUniqueOrThrow({ where: { id: connection.id } })
    expect(raw.apiKey.startsWith('v2:')).toBe(true)
    expect(raw.apiKey).not.toContain(API_KEY)
  })

  it('IX.g [INV] documentos API_PULL nunca entram no seletor de push TOConline', async () => {
    const { office, owner, connection } = await seedConnection()
    await pullDocumentsForInvoicexpressConnection(
      { connectionId: connection.id, officeId: office.id, userId: owner.id },
      fastDeps(makeIvxMock([invoice(900001, 55)]).fetchImpl),
    )
    const doc = await prisma.document.findFirstOrThrow({ where: { officeId: office.id } })
    const reason = getPushEligibilityError(doc as unknown as Document)
    expect(reason).toBeTruthy()
  })

  it('IX.h processor regista JobLog e lastPullAt avança após sucesso', async () => {
    const { office, owner, connection } = await seedConnection()
    const before = new Date()
    await processInvoicexpressPull(
      { connectionId: connection.id, officeId: office.id, userId: owner.id },
      'job-ivx-1',
      fastDeps(makeIvxMock([invoice(900001, 55)]).fetchImpl),
    )
    const jobLog = await prisma.jobLog.findFirst({
      where: { officeId: office.id, queue: 'invoicexpress-pull', jobId: 'job-ivx-1' },
    })
    expect(jobLog?.status).toBe('COMPLETED')
    const updated = await prisma.invoicexpressConnection.findUniqueOrThrow({ where: { id: connection.id } })
    expect(updated.lastPullAt).not.toBeNull()
    expect(updated.lastPullAt!.getTime()).toBeGreaterThanOrEqual(before.getTime())
  })

  it('IX.i pull desligado → recusa clara, zero rede', async () => {
    const { office, owner, connection } = await seedConnection({ pullEnabled: false })
    const mock = makeIvxMock([invoice(900001, 55)])
    const result = await pullDocumentsForInvoicexpressConnection(
      { connectionId: connection.id, officeId: office.id, userId: owner.id },
      fastDeps(mock.fetchImpl),
    )
    expect(result.ok).toBe(false)
    expect(mock.requestedUrls).toHaveLength(0)
  })
})
