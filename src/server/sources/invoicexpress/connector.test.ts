import { describe, it, expect } from 'vitest'
import { InvoicexpressConnector } from './connector'
import { createMockFetch, pdfAcceptedResponse, pdfReadyResponse, TEST_ACCOUNT_NAME, TEST_API_KEY } from './fixtures'

function makeConnector(fetchImpl: typeof fetch, overrides: Record<string, unknown> = {}) {
  return new InvoicexpressConnector({
    accountName: TEST_ACCOUNT_NAME,
    apiKey: TEST_API_KEY,
    fetchImpl,
    minIntervalMs: 0,
    backoffBaseMs: 1,
    pdfPollDelayMs: 1,
    ...overrides,
  })
}

describe('InvoicexpressConnector.listIssuedDocuments', () => {
  it('[INV] walks all pages and returns the complete list without duplicates', async () => {
    const { fetchImpl } = createMockFetch()
    const connector = makeConnector(fetchImpl)
    const result = await connector.listIssuedDocuments()
    const ids = result.documents.map((doc) => doc.externalId)
    // page 1: 900001, 900002 (+draft 900003 dropped); page 2 repeats 900002, adds 900004
    expect(ids).toEqual(['900001', '900002', '900004'])
    expect(new Set(ids).size).toBe(ids.length)
    expect(result.cursor.nextPage).toBeNull()
    expect(result.cursor.totalPages).toBe(2)
  })

  it('[INV] never returns drafts even when the API includes them in a page', async () => {
    const { fetchImpl } = createMockFetch()
    const connector = makeConnector(fetchImpl)
    const result = await connector.listIssuedDocuments()
    expect(result.documents.every((doc) => doc.status !== 'draft')).toBe(true)
    expect(result.documents.some((doc) => doc.externalId === '900003')).toBe(false)
  })

  it('[INV] resumes from a cursor: fromPage 2 only processes the second page', async () => {
    const { fetchImpl, requestedUrls } = createMockFetch()
    const connector = makeConnector(fetchImpl)
    const result = await connector.listIssuedDocuments({ fromPage: 2 })
    expect(result.documents.map((doc) => doc.externalId)).toEqual(['900002', '900004'])
    expect(result.cursor.nextPage).toBeNull()
    const pages = requestedUrls.map((url) => new URL(url).searchParams.get('page'))
    expect(pages).toEqual(['2'])
  })

  it('requests only finalized statuses and non-archived docs, all documented sale types', async () => {
    const { fetchImpl, requestedUrls } = createMockFetch()
    const connector = makeConnector(fetchImpl)
    await connector.listIssuedDocuments()
    const params = new URL(requestedUrls[0]).searchParams
    expect(params.getAll('status[]').sort()).toEqual(['second_copy', 'sent', 'settled'])
    expect(params.getAll('type[]').sort()).toEqual([
      'CashInvoice',
      'CreditNote',
      'DebitNote',
      'Invoice',
      'InvoiceReceipt',
      'Receipt',
    ])
    expect(params.get('non_archived')).toBe('true')
  })

  it('supports the documented date window filters (dd/mm/yyyy)', async () => {
    const { fetchImpl, requestedUrls } = createMockFetch()
    const connector = makeConnector(fetchImpl)
    await connector.listIssuedDocuments({ dateFrom: '2026-06-01', dateTo: '2026-06-30' })
    const params = new URL(requestedUrls[0]).searchParams
    expect(params.get('date[from]')).toBe('01/06/2026')
    expect(params.get('date[to]')).toBe('30/06/2026')
  })

  it('[INV] credit notes come out with negative cents end to end', async () => {
    const { fetchImpl } = createMockFetch()
    const connector = makeConnector(fetchImpl)
    const result = await connector.listIssuedDocuments()
    const creditNote = result.documents.find((doc) => doc.type === 'CreditNote')
    expect(creditNote).toBeDefined()
    expect(creditNote?.totalCents).toBe(-6150)
    expect(creditNote?.vatBreakdownCents).toEqual([{ rate: 23, baseCents: -5000, amountCents: -1150 }])
  })

  it('[INV] the api_key never appears in the serialized result (raw included)', async () => {
    const { fetchImpl } = createMockFetch()
    const connector = makeConnector(fetchImpl)
    const result = await connector.listIssuedDocuments()
    expect(JSON.stringify(result)).not.toContain(TEST_API_KEY)
  })

  it('[INV] the api_key never appears in errors when the API fails', async () => {
    const { fetchImpl } = createMockFetch({ failListWith: { status: 500 } })
    const connector = makeConnector(fetchImpl, { maxRetries: 1 })
    const error = await connector.listIssuedDocuments().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    const serialized = `${String(error)} ${(error as Error).message} ${(error as Error).stack ?? ''}`
    expect(serialized).not.toContain(TEST_API_KEY)
  })

  it('rejects malformed API responses via the strict contract schemas', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ invoices: 'not-an-array' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    const connector = makeConnector(fetchImpl)
    await expect(connector.listIssuedDocuments()).rejects.toThrow()
  })
})

describe('InvoicexpressConnector.fetchPdf', () => {
  it('polls through documented 202 responses until the 200 with output.pdfUrl', async () => {
    const { fetchImpl, requestedUrls } = createMockFetch({
      pdfSequence: [
        { status: 202, body: pdfAcceptedResponse },
        { status: 202, body: pdfAcceptedResponse },
        { status: 200, body: pdfReadyResponse },
      ],
    })
    const connector = makeConnector(fetchImpl)
    const result = await connector.fetchPdf('900001')
    expect(result.pdfUrl).toBe(pdfReadyResponse.output.pdfUrl)
    const pdfCalls = requestedUrls.filter((url) => url.includes('/api/pdf/900001.json'))
    expect(pdfCalls).toHaveLength(3)
  })

  it('gives up after the configured attempts when the PDF stays pending, without leaking the key', async () => {
    const { fetchImpl } = createMockFetch({
      pdfSequence: Array.from({ length: 10 }, () => ({ status: 202, body: pdfAcceptedResponse })),
    })
    const connector = makeConnector(fetchImpl, { pdfMaxAttempts: 3 })
    const error = await connector.fetchPdf('900001').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(/pdf/i)
    expect(String(error)).not.toContain(TEST_API_KEY)
  })
})
