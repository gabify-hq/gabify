import { describe, it, expect, vi } from 'vitest'
import { InvoicexpressClient, InvoicexpressApiError } from './invoicexpress-client'
import {
  createMockFetch,
  jsonResponse,
  listPage1,
  unauthorizedResponse,
  TEST_ACCOUNT_NAME,
  TEST_API_KEY,
} from './fixtures'

function makeClient(fetchImpl: typeof fetch, overrides: Record<string, unknown> = {}) {
  return new InvoicexpressClient({
    accountName: TEST_ACCOUNT_NAME,
    apiKey: TEST_API_KEY,
    fetchImpl,
    minIntervalMs: 0,
    backoffBaseMs: 1,
    ...overrides,
  })
}

describe('InvoicexpressClient', () => {
  it('targets the documented account subdomain and passes api_key in the query string', async () => {
    const { fetchImpl, requestedUrls } = createMockFetch()
    const client = makeClient(fetchImpl)
    await client.getJson('/invoices.json', { page: 1 })
    expect(requestedUrls).toHaveLength(1)
    const url = new URL(requestedUrls[0])
    expect(url.origin).toBe(`https://${TEST_ACCOUNT_NAME}.app.invoicexpress.com`)
    expect(url.searchParams.get('api_key')).toBe(TEST_API_KEY)
    expect(url.searchParams.get('page')).toBe('1')
  })

  it('serializes array query params in the documented form style (type[]=A&type[]=B)', async () => {
    const { fetchImpl, requestedUrls } = createMockFetch()
    const client = makeClient(fetchImpl)
    await client.getJson('/invoices.json', { 'type[]': ['Invoice', 'CreditNote'] })
    expect(requestedUrls[0]).toContain('type%5B%5D=Invoice')
    expect(requestedUrls[0]).toContain('type%5B%5D=CreditNote')
  })

  it('retries on 5xx and eventually succeeds', async () => {
    const { fetchImpl, requestedUrls } = createMockFetch({
      failListWith: { status: 500, times: 2 },
    })
    const client = makeClient(fetchImpl)
    const body = (await client.getJson('/invoices.json', { page: 1 })) as typeof listPage1
    expect(body.pagination.current_page).toBe(1)
    expect(requestedUrls).toHaveLength(3)
  })

  it('gives up after maxRetries on persistent 5xx with a redacted error', async () => {
    const { fetchImpl, requestedUrls } = createMockFetch({ failListWith: { status: 503 } })
    const client = makeClient(fetchImpl, { maxRetries: 3 })
    const error = await client.getJson('/invoices.json', {}).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(InvoicexpressApiError)
    expect((error as InvoicexpressApiError).status).toBe(503)
    expect(requestedUrls).toHaveLength(4) // 1 attempt + 3 retries
    expect(String(error)).not.toContain(TEST_API_KEY)
  })

  it('[INV] does NOT retry on 4xx and never leaks the api_key in the error', async () => {
    const calls: string[] = []
    const fetchImpl: typeof fetch = async (input) => {
      calls.push(String(input))
      return jsonResponse(unauthorizedResponse, 401)
    }
    const client = makeClient(fetchImpl)
    const error = await client.getJson('/invoices.json', {}).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(InvoicexpressApiError)
    expect((error as InvoicexpressApiError).status).toBe(401)
    expect(calls).toHaveLength(1)
    const serialized = `${String(error)} ${(error as Error).message} ${(error as Error).stack ?? ''}`
    expect(serialized).not.toContain(TEST_API_KEY)
  })

  it('[INV] redacts the api_key from network-level failures that embed the URL', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      throw new TypeError(`fetch failed: unable to connect to ${String(input)}`)
    }
    const client = makeClient(fetchImpl, { maxRetries: 1 })
    const error = await client.getJson('/invoices.json', { page: 1 }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(InvoicexpressApiError)
    const serialized = `${String(error)} ${(error as Error).message} ${(error as Error).stack ?? ''}`
    expect(serialized).not.toContain(TEST_API_KEY)
  })

  it('aborts requests that exceed the timeout and retries them', async () => {
    let calls = 0
    const fetchImpl: typeof fetch = (input, init) => {
      calls += 1
      if (calls === 1) {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        })
      }
      return Promise.resolve(jsonResponse(listPage1))
    }
    const client = makeClient(fetchImpl, { timeoutMs: 20 })
    const body = (await client.getJson('/invoices.json', {})) as typeof listPage1
    expect(body.invoices.length).toBeGreaterThan(0)
    expect(calls).toBe(2)
  })

  it('spaces consecutive requests by the configured minimum interval (rate limit)', async () => {
    const timestamps: number[] = []
    const fetchImpl: typeof fetch = async () => {
      timestamps.push(Date.now())
      return jsonResponse(listPage1)
    }
    const client = makeClient(fetchImpl, { minIntervalMs: 60 })
    await client.getJson('/invoices.json', {})
    await client.getJson('/invoices.json', {})
    expect(timestamps).toHaveLength(2)
    expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(50)
  })

  it('never logs the api_key (console spy across success and failure)', async () => {
    const spies = [
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'info'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'error'),
    ]
    try {
      const { fetchImpl } = createMockFetch()
      const okClient = makeClient(fetchImpl)
      await okClient.getJson('/invoices.json', { page: 1 })

      const failing = createMockFetch({ failListWith: { status: 500 } })
      const badClient = makeClient(failing.fetchImpl, { maxRetries: 1 })
      await badClient.getJson('/invoices.json', {}).catch(() => undefined)

      const allOutput = spies
        .flatMap((spy) => spy.mock.calls)
        .flat()
        .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
        .join('\n')
      expect(allOutput).not.toContain(TEST_API_KEY)
    } finally {
      spies.forEach((spy) => spy.mockRestore())
    }
  })
})
