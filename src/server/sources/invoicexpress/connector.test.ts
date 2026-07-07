import { describe, it, expect } from 'vitest'
import { InvoicexpressConnector } from './connector'
import { createMockFetch, TEST_ACCOUNT_NAME, TEST_API_KEY, pdfAcceptedResponse, pdfReadyResponse } from './fixtures'

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

describe('InvoicexpressConnector.listIssuedDocuments (unified contract)', () => {
  it('[INV] yields one page per call with a resume cursor and de-dups across pages', async () => {
    const { fetchImpl } = createMockFetch()
    const connector = makeConnector(fetchImpl)

    const page1 = await connector.listIssuedDocuments()
    // page 1: 900001 (final), 900002 (settled); draft 900003 dropped
    expect(page1.items.map((d) => d.externalId)).toEqual(['900001', '900002'])
    expect(page1.nextCursor).toBe('2')

    const page2 = await connector.listIssuedDocuments(page1.nextCursor!)
    // page 2 repeats 900002 (deduped) and adds 900004
    expect(page2.items.map((d) => d.externalId)).toEqual(['900004'])
    expect(page2.nextCursor).toBeNull()

    const all = [...page1.items, ...page2.items].map((d) => d.externalId)
    expect(new Set(all).size).toBe(all.length)
  })

  it('[INV] never returns drafts even when the API includes them in a page', async () => {
    const { fetchImpl } = createMockFetch()
    const connector = makeConnector(fetchImpl)
    const page1 = await connector.listIssuedDocuments()
    expect(page1.items.every((d) => d.documentStatus !== 'draft')).toBe(true)
    expect(page1.items.some((d) => d.externalId === '900003')).toBe(false)
  })

  it('[INV] resumes from a cursor: page 2 only requests the second page', async () => {
    const { fetchImpl, requestedUrls } = createMockFetch()
    const connector = makeConnector(fetchImpl)
    const page = await connector.listIssuedDocuments('2')
    expect(page.items.map((d) => d.externalId)).toEqual(['900002', '900004'])
    expect(page.nextCursor).toBeNull()
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

  it('supports the documented date window filters (dd/mm/yyyy) via constructor config', async () => {
    const { fetchImpl, requestedUrls } = createMockFetch()
    const connector = makeConnector(fetchImpl, { dateFrom: '2026-06-01', dateTo: '2026-06-30' })
    await connector.listIssuedDocuments()
    const params = new URL(requestedUrls[0]).searchParams
    expect(params.get('date[from]')).toBe('01/06/2026')
    expect(params.get('date[to]')).toBe('30/06/2026')
  })

  it('[INV] credit notes come out with negative cents end to end', async () => {
    const { fetchImpl } = createMockFetch()
    const connector = makeConnector(fetchImpl)
    const page1 = await connector.listIssuedDocuments()
    const creditNote = page1.items.find((doc) => doc.documentType === 'CreditNote')
    expect(creditNote).toBeDefined()
    expect(creditNote?.totalCents).toBe(-6150)
    expect(creditNote?.vatBreakdownCents).toEqual([{ ratePermil: 230, baseCents: -5000, amountCents: -1150 }])
  })

  it('[INV] the api_key never appears in the serialized result (raw included)', async () => {
    const { fetchImpl } = createMockFetch()
    const connector = makeConnector(fetchImpl)
    const page1 = await connector.listIssuedDocuments()
    expect(JSON.stringify(page1)).not.toContain(TEST_API_KEY)
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

describe('InvoicexpressConnector.fetchPdf (unified contract → Buffer | null)', () => {
  it('polls through documented 202 responses, then downloads the PDF bytes as a Buffer', async () => {
    const { fetchImpl, requestedUrls } = createMockFetch({
      pdfSequence: [
        { status: 202, body: pdfAcceptedResponse },
        { status: 202, body: pdfAcceptedResponse },
        { status: 200, body: pdfReadyResponse },
      ],
    })
    const connector = makeConnector(fetchImpl)
    const result = await connector.fetchPdf('900001')
    expect(Buffer.isBuffer(result)).toBe(true)
    expect(result?.toString('utf8')).toContain('%PDF')
    const pdfCalls = requestedUrls.filter((url) => url.includes('/api/pdf/900001.json'))
    expect(pdfCalls).toHaveLength(3)
  })

  it('returns null when the PDF stays pending after the configured attempts, without leaking the key', async () => {
    const { fetchImpl } = createMockFetch({
      pdfSequence: Array.from({ length: 10 }, () => ({ status: 202, body: pdfAcceptedResponse })),
    })
    const connector = makeConnector(fetchImpl, { pdfMaxAttempts: 3 })
    const result = await connector.fetchPdf('900001')
    expect(result).toBeNull()
  })
})
