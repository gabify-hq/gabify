import { describe, it, expect } from 'vitest'
import {
  makeToconlineMock,
  MOCK_OAUTH_URL,
  MOCK_API_URL,
  MOCK_CLIENT_ID,
  MOCK_CLIENT_SECRET,
} from '../../../tests/mocks/toconline-api'

// 🔴RED — module does not exist until the implementation lands (TDD)
import {
  ToconlineClient,
  ToconlineApiError,
  TOCONLINE_REDIRECT_URI,
} from './toconline-client'

/**
 * Unit tests of the doc-driven HTTP client: OAuth flows, mandatory headers,
 * retry/backoff (5xx/timeout only), 30s timeout, internal 2 req/s rate limit
 * and credential redaction. Everything runs against the doc-derived mock.
 */

function makeClient(
  mockFetch: typeof fetch,
  extra?: Partial<{
    accessToken: string | null
    refreshToken: string | null
    tokenExpiresAt: Date | null
    timeoutMs: number
    minIntervalMs: number
    backoffBaseMs: number
    readOnly: boolean
    onTokens: (t: { accessToken: string; refreshToken: string | null; expiresAt: Date }) => void
  }>,
) {
  return new ToconlineClient({
    oauthUrl: MOCK_OAUTH_URL,
    apiUrl: MOCK_API_URL,
    oauthClientId: MOCK_CLIENT_ID,
    oauthClientSecret: MOCK_CLIENT_SECRET,
    tokens: {
      accessToken: extra?.accessToken ?? null,
      refreshToken: extra?.refreshToken ?? null,
      expiresAt: extra?.tokenExpiresAt ?? null,
    },
    fetchImpl: mockFetch,
    timeoutMs: extra?.timeoutMs,
    minIntervalMs: extra?.minIntervalMs ?? 0,
    backoffBaseMs: extra?.backoffBaseMs ?? 1,
    readOnly: extra?.readOnly,
    onTokens: extra?.onTokens,
  })
}

describe('ToconlineClient — autenticação (doc §2)', () => {
  it('sem tokens: corre o fluxo authorization_code completo e injeta os headers da doc', async () => {
    const mock = makeToconlineMock({
      suppliers: [{ id: '7', tax_registration_number: '509888771', business_name: 'F' }],
    })
    const captured: Array<{ accessToken: string }> = []
    const client = makeClient(mock.fetchImpl, { onTokens: (t) => captured.push(t) })

    const supplier = await client.getSupplierByNif('509888771')
    expect(supplier?.id).toBe('7')

    // Flow order per the docs: GET /auth (302, not followed) → POST /token → API
    const [authCall, tokenCall, apiCall] = mock.calls
    expect(authCall.method).toBe('GET')
    expect(authCall.url).toContain(`${MOCK_OAUTH_URL}/auth?`)
    expect(authCall.url).toContain(`redirect_uri=${encodeURIComponent(TOCONLINE_REDIRECT_URI)}`)
    expect(authCall.url).toContain('response_type=code')
    expect(authCall.url).toContain('scope=commercial')

    expect(tokenCall.method).toBe('POST')
    expect(tokenCall.url).toBe(`${MOCK_OAUTH_URL}/token`)
    expect(tokenCall.headers['content-type']).toBe('application/x-www-form-urlencoded')
    expect(tokenCall.headers['authorization']).toBe(
      `Basic ${Buffer.from(`${MOCK_CLIENT_ID}:${MOCK_CLIENT_SECRET}`).toString('base64')}`,
    )

    expect(apiCall.headers['content-type']).toBe('application/vnd.api+json')
    expect(apiCall.headers['accept']).toBe('application/json')
    expect(apiCall.headers['authorization']).toMatch(/^Bearer /)

    expect(captured).toHaveLength(1) // rotated tokens reported for persistence
  })

  it('401 da API → refresh e repetição transparente; refresh sem refresh_token novo mantém o antigo', async () => {
    const mock = makeToconlineMock({
      suppliers: [{ id: '7', tax_registration_number: '509888771', business_name: 'F' }],
    })
    const seededRefresh = 'unit-refresh-token'
    mock.state.validRefreshTokens.add(seededRefresh)
    const captured: Array<{ accessToken: string; refreshToken: string | null }> = []
    const client = makeClient(mock.fetchImpl, {
      accessToken: 'stale-token',
      refreshToken: seededRefresh,
      tokenExpiresAt: new Date(Date.now() + 3600_000),
      onTokens: (t) => captured.push(t),
    })

    const supplier = await client.getSupplierByNif('509888771')
    expect(supplier?.id).toBe('7')
    expect(mock.state.tokenGrants).toEqual(['refresh_token'])
    // Documented refresh response has no refresh_token → the old one is kept
    expect(captured[0].refreshToken).toBe(seededRefresh)
  })

  it('refresh inválido → recua para o fluxo authorization_code completo', async () => {
    const mock = makeToconlineMock({
      suppliers: [{ id: '7', tax_registration_number: '509888771', business_name: 'F' }],
    })
    const client = makeClient(mock.fetchImpl, {
      accessToken: 'stale-token',
      refreshToken: 'revoked-refresh-token', // mock does not accept it
      tokenExpiresAt: new Date(Date.now() - 1000), // already expired
    })

    const supplier = await client.getSupplierByNif('509888771')
    expect(supplier?.id).toBe('7')
    expect(mock.state.tokenGrants).toEqual(['refresh_token', 'authorization_code'])
  })
})

describe('ToconlineClient — retry, timeout e rate limit', () => {
  it('5xx → retry com backoff até 3 vezes; recupera quando o serviço volta', async () => {
    const mock = makeToconlineMock({
      suppliers: [{ id: '7', tax_registration_number: '509888771', business_name: 'F' }],
    })
    mock.failNext(/\/api\/suppliers/, 500, 2)
    const client = makeClient(mock.fetchImpl)

    const supplier = await client.getSupplierByNif('509888771')
    expect(supplier?.id).toBe('7')
    const supplierCalls = mock.calls.filter((c) => c.url.includes('/api/suppliers'))
    expect(supplierCalls).toHaveLength(3) // 2 failures + 1 success
  })

  it('5xx persistente → falha após 1 tentativa + 3 retries', async () => {
    const mock = makeToconlineMock()
    mock.failNext(/\/api\/suppliers/, 503, 100)
    const client = makeClient(mock.fetchImpl)

    await expect(client.getSupplierByNif('509888771')).rejects.toBeInstanceOf(ToconlineApiError)
    const supplierCalls = mock.calls.filter((c) => c.url.includes('/api/suppliers'))
    expect(supplierCalls).toHaveLength(4)
  })

  it('4xx NÃO faz retry', async () => {
    const mock = makeToconlineMock()
    mock.failNext(/\/api\/suppliers/, 422, 100)
    const client = makeClient(mock.fetchImpl)

    await expect(client.getSupplierByNif('509888771')).rejects.toBeInstanceOf(ToconlineApiError)
    const supplierCalls = mock.calls.filter((c) => c.url.includes('/api/suppliers'))
    expect(supplierCalls).toHaveLength(1)
  })

  it('timeout aborta o pedido e conta como retryable', async () => {
    const mock = makeToconlineMock({
      suppliers: [{ id: '7', tax_registration_number: '509888771', business_name: 'F' }],
    })
    let hangs = 1
    const hangingFetch: typeof fetch = (input, init) => {
      const url = String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      if (url.includes('/api/suppliers') && hangs > 0) {
        hangs -= 1
        return new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          )
        })
      }
      return mock.fetchImpl(input, init)
    }
    const client = makeClient(hangingFetch, { timeoutMs: 30 })

    const supplier = await client.getSupplierByNif('509888771')
    expect(supplier?.id).toBe('7') // recovered on retry after the timeout
  })

  it('rate limit interno: pedidos à API espaçados ≥ minIntervalMs (2 req/s → 500ms)', async () => {
    const mock = makeToconlineMock({
      suppliers: [
        { id: '7', tax_registration_number: '509888771', business_name: 'F' },
        { id: '8', tax_registration_number: '504426290', business_name: 'G' },
      ],
    })
    const timestamps: number[] = []
    const timedFetch: typeof fetch = (input, init) => {
      const url = String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      if (url.startsWith(MOCK_API_URL)) timestamps.push(Date.now())
      return mock.fetchImpl(input, init)
    }
    const client = makeClient(timedFetch, { minIntervalMs: 120 })

    await client.getSupplierByNif('509888771')
    await client.getSupplierByNif('504426290')

    expect(timestamps).toHaveLength(2)
    expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(100)
  })

  it('🔴RED readOnly (dry-run pull): GET passa, POST é bloqueado ANTES de tocar na rede', async () => {
    const mock = makeToconlineMock({
      suppliers: [{ id: '7', tax_registration_number: '509888771', business_name: 'F' }],
    })
    const client = makeClient(mock.fetchImpl, { readOnly: true })

    // Reads are allowed (pull works in dry-run)
    const supplier = await client.getSupplierByNif('509888771')
    expect(supplier?.id).toBe('7')

    // Writes are blocked client-side — no HTTP request may leave
    const apiCallsBefore = mock.calls.filter((c) => c.url.startsWith(MOCK_API_URL)).length
    await expect(
      client.createSupplier({ nif: '509888771', businessName: 'X' }),
    ).rejects.toBeInstanceOf(ToconlineApiError)
    const apiCallsAfter = mock.calls.filter((c) => c.url.startsWith(MOCK_API_URL)).length
    expect(apiCallsAfter).toBe(apiCallsBefore) // zero write requests reached the network
  })

  it('erros da API nunca expõem segredos nem tokens na mensagem', async () => {
    const mock = makeToconlineMock()
    mock.failNext(/\/api\/suppliers/, 500, 100)
    const client = makeClient(mock.fetchImpl)

    let caught: unknown
    try {
      await client.getSupplierByNif('509888771')
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(ToconlineApiError)
    const message = (caught as Error).message + JSON.stringify(caught)
    expect(message).not.toContain(MOCK_CLIENT_SECRET)
    for (const token of mock.state.validAccessTokens) {
      expect(message).not.toContain(token)
    }
  })
})
