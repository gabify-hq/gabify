/**
 * [INV] HTTP client suite — token lifecycle, transport rules, retry policy,
 * timeout, internal rate limit and credential redaction, all against the
 * doc-derived mock API (mock-api.ts).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MoloniApiClient, MoloniApiError, type MoloniTokenState } from './client'
import { createMoloniApiMock } from './mock-api'
import { invoiceMultiRateDetail } from './fixtures'

const CREDENTIALS = {
  clientId: 'gabify-dev',
  clientSecret: 'super-secret-client-key',
  username: 'contas@escritorio.pt',
  password: 'p4ssw0rd-muito-secreta',
}

/** Virtual clock shared by client and mock; sleep advances it instantly. */
function createClock(startMs = 1_780_000_000_000) {
  let nowMs = startMs
  return {
    now: () => nowMs,
    sleep: async (ms: number) => {
      nowMs += ms
    },
    advance: (ms: number) => {
      nowMs += ms
    },
  }
}

function createHarness(mockOverrides: Parameters<typeof createMoloniApiMock>[0] extends infer T
  ? Partial<T>
  : never = {}) {
  const clock = createClock()
  const mock = createMoloniApiMock({
    credentials: CREDENTIALS,
    documents: [invoiceMultiRateDetail],
    now: clock.now,
    ...mockOverrides,
  })
  const logs: string[] = []
  const logger = {
    info: (m: string) => logs.push(m),
    warn: (m: string) => logs.push(m),
    error: (m: string) => logs.push(m),
  }
  const tokenStates: MoloniTokenState[] = []
  const client = new MoloniApiClient(CREDENTIALS, {
    fetchFn: mock.fetchFn,
    now: clock.now,
    sleep: clock.sleep,
    logger,
    onTokenState: (state) => tokenStates.push(state),
  })
  return { clock, mock, client, logs, tokenStates }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('MoloniApiClient transport', () => {
  it('sends POST + x-www-form-urlencoded with access_token in the query string', async () => {
    const { mock, client } = createHarness()
    await client.call('documents/getAll', { company_id: 5, qty: 50, offset: 0 })

    const dataRequest = mock.requests.find((r) => r.url.includes('/v1/documents/getAll/'))
    expect(dataRequest).toBeDefined()
    expect(dataRequest?.method).toBe('POST')
    expect(dataRequest?.contentType).toBe('application/x-www-form-urlencoded')
    expect(new URL(dataRequest!.url).searchParams.get('access_token')).toBe(
      mock.issuedAccessTokens[0]
    )
    const body = new URLSearchParams(dataRequest?.body ?? '')
    expect(body.get('company_id')).toBe('5')
  })
})

describe('MoloniApiClient token lifecycle', () => {
  it('requests one token and reuses it for many calls within the hour', async () => {
    const { mock, client, clock } = createHarness()
    for (let i = 0; i < 8; i += 1) {
      clock.advance(60_000) // one minute between calls, well within validity
      await client.call('documents/getAll', { company_id: 5, qty: 50, offset: 0 })
    }
    expect(mock.counters.grantPassword).toBe(1)
    expect(mock.counters.grantRefreshToken).toBe(0)
  })

  it('refreshes near expiry and resumes with the new token', async () => {
    const { mock, client, clock } = createHarness()
    await client.call('documents/getAll', { company_id: 5, qty: 50, offset: 0 })
    expect(mock.counters.grantPassword).toBe(1)

    // 3 541 s later: inside the safety margin (60 s) of the 3 600 s validity
    clock.advance(3_541_000)
    await client.call('documents/getAll', { company_id: 5, qty: 50, offset: 0 })

    expect(mock.counters.grantRefreshToken).toBe(1)
    expect(mock.counters.grantPassword).toBe(1) // never re-authenticates with password
    const lastData = mock.requests.filter((r) => r.url.includes('/documents/getAll/')).at(-1)
    expect(new URL(lastData!.url).searchParams.get('access_token')).toBe(
      mock.issuedAccessTokens.at(-1)
    )
  })

  it('exposes new token state via onTokenState so it can be persisted later', async () => {
    const { client, clock, tokenStates, mock } = createHarness()
    await client.call('documents/getAll', { company_id: 5, qty: 50, offset: 0 })

    expect(tokenStates).toHaveLength(1)
    expect(tokenStates[0].accessToken).toBe(mock.issuedAccessTokens[0])
    expect(tokenStates[0].refreshToken).toBeTruthy()
    expect(tokenStates[0].expiresAtEpochMs).toBeGreaterThan(clock.now())
  })

  it('accepts seeded token state and skips the password grant entirely', async () => {
    const first = createHarness()
    await first.client.call('documents/getAll', { company_id: 5, qty: 50, offset: 0 })
    const seeded = first.tokenStates[0]

    // Second client, same mock (same issued token), seeded with stored state.
    const second = new MoloniApiClient(
      CREDENTIALS,
      { fetchFn: first.mock.fetchFn, now: first.clock.now, sleep: first.clock.sleep },
      seeded
    )
    await second.call('documents/getAll', { company_id: 5, qty: 50, offset: 0 })
    expect(first.mock.counters.grantPassword).toBe(1) // still only the first grant
  })
})

describe('MoloniApiClient retry policy', () => {
  it('retries 5xx up to 3 attempts and succeeds', async () => {
    const { mock, client } = createHarness({ failGetAll: { status: 500, times: 2 } })
    const result = await client.call('documents/getAll', { company_id: 5, qty: 50, offset: 0 })
    expect(Array.isArray(result)).toBe(true)
    expect(mock.counters.getAll).toBe(3)
  })

  it('gives up after 3 failed attempts on persistent 5xx', async () => {
    const { mock, client } = createHarness({ failGetAll: { status: 503, times: 99 } })
    await expect(
      client.call('documents/getAll', { company_id: 5, qty: 50, offset: 0 })
    ).rejects.toMatchObject({ kind: 'server', status: 503 })
    expect(mock.counters.getAll).toBe(3)
  })

  it('never retries 4xx validation errors', async () => {
    const { mock, client } = createHarness()
    await expect(
      client.call('documents/getOne', { company_id: 5, document_id: 424242 })
    ).rejects.toMatchObject({ kind: 'validation' })
    expect(mock.counters.getOne).toBe(1)
  })

  it('times out after 30s per attempt and reports a timeout error', async () => {
    vi.useFakeTimers()
    const { client, mock } = createHarness({ hangDataCalls: true })
    const outcome = client
      .call('documents/getAll', { company_id: 5, qty: 50, offset: 0 })
      .then(() => 'resolved')
      .catch((error: unknown) => error)

    // three attempts × 30 s timeout each (backoff sleeps are virtual/instant)
    await vi.advanceTimersByTimeAsync(31_000)
    await vi.advanceTimersByTimeAsync(31_000)
    await vi.advanceTimersByTimeAsync(31_000)

    const error = await outcome
    expect(error).toBeInstanceOf(MoloniApiError)
    expect((error as MoloniApiError).kind).toBe('timeout')
    expect(mock.counters.getAll).toBe(0) // requests hung before reaching a handler
    const hungCalls = mock.requests.filter((r) => r.url.includes('/documents/getAll/'))
    expect(hungCalls).toHaveLength(3)
  })
})

describe('MoloniApiClient rate limiting', () => {
  it('spaces request starts at least 500ms apart (2 req/s)', async () => {
    const { mock, client } = createHarness()
    await client.call('documents/getAll', { company_id: 5, qty: 50, offset: 0 })
    await client.call('documents/getAll', { company_id: 5, qty: 50, offset: 0 })
    await client.call('documents/getAll', { company_id: 5, qty: 50, offset: 0 })

    const stamps = mock.requests.map((r) => r.atMs)
    for (let i = 1; i < stamps.length; i += 1) {
      expect(stamps[i] - stamps[i - 1]).toBeGreaterThanOrEqual(500)
    }
  })
})

describe('MoloniApiClient credential redaction', () => {
  it('never leaks credentials or tokens through errors or logs', async () => {
    const { mock, client, logs } = createHarness({ failGetAll: { status: 500, times: 99 } })
    const error = await client
      .call('documents/getAll', { company_id: 5, qty: 50, offset: 0 })
      .catch((e: unknown) => e as Error)

    const secrets = [
      CREDENTIALS.clientSecret,
      CREDENTIALS.password,
      ...mock.issuedAccessTokens,
      'mock-refresh-token',
    ]
    const haystack = [
      (error as Error).message,
      (error as Error).stack ?? '',
      JSON.stringify(error),
      ...logs,
    ].join('\n')

    for (const secret of secrets) {
      expect(haystack).not.toContain(secret)
    }
  })

  it('redacts grant failures too (wrong credentials)', async () => {
    const clock = createClock()
    const mock = createMoloniApiMock({ credentials: CREDENTIALS, now: clock.now })
    const logs: string[] = []
    const badClient = new MoloniApiClient(
      { ...CREDENTIALS, password: 'wrong-password-value' },
      {
        fetchFn: mock.fetchFn,
        now: clock.now,
        sleep: clock.sleep,
        logger: { info: (m) => logs.push(m), warn: (m) => logs.push(m), error: (m) => logs.push(m) },
      }
    )
    const error = await badClient
      .call('documents/getAll', { company_id: 5, qty: 50, offset: 0 })
      .catch((e: unknown) => e as Error)

    expect(error).toBeInstanceOf(MoloniApiError)
    expect((error as MoloniApiError).kind).toBe('auth')
    const haystack = [
      (error as Error).message,
      (error as Error).stack ?? '',
      JSON.stringify(error),
      ...logs,
    ].join('\n')
    expect(haystack).not.toContain('wrong-password-value')
    expect(haystack).not.toContain(CREDENTIALS.clientSecret)
  })
})
