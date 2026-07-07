/**
 * In-memory fake of the TOConline OAuth service + commercial API, driven ONLY
 * by behaviour documented in `integrations/toconline/docs/` (see the fixtures
 * for the exact sources). Used instead of a real network in every test —
 * the integration is doc-driven and was never run against the real API.
 */
import {
  TOKEN_RESPONSE,
  REFRESH_RESPONSE,
  supplierListResponse,
  purchasesListResponse,
  purchaseCreatedResponse,
} from '../fixtures/toconline/responses'

export interface RecordedCall {
  method: string
  url: string
  headers: Record<string, string>
  body: string | null
}

export interface MockSupplier {
  id: string
  tax_registration_number: string
  business_name: string
}

export interface MockPurchase {
  id: string
  status: number
  supplier_tax_registration_number: string
  external_reference: string | null
  payload: Record<string, unknown>
}

interface FailRule {
  match: RegExp
  status: number
  times: number
}

export const MOCK_OAUTH_URL = 'https://mock-oauth.toconline.test/oauth'
export const MOCK_API_URL = 'https://mock-api.toconline.test'
export const MOCK_CLIENT_ID = 'integrator-client-id'
export const MOCK_CLIENT_SECRET = 'integrator-secret-abcdef'

export interface ToconlineMock {
  fetchImpl: typeof fetch
  calls: RecordedCall[]
  state: {
    suppliers: MockSupplier[]
    purchases: MockPurchase[]
    validAccessTokens: Set<string>
    validRefreshTokens: Set<string>
    authCode: string
    tokenGrants: string[]
    nextSupplierId: number
    nextPurchaseId: number
  }
  /** Invalidate every access token — the next API call answers 401 (doc §2.2). */
  expireAccessTokens(): void
  /** Invalidate refresh tokens too — forces the full authorization_code flow. */
  expireRefreshTokens(): void
  /** Answer `status` for the next `times` requests whose URL matches. */
  failNext(match: RegExp, status: number, times?: number): void
  apiCalls(): RecordedCall[]
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json;charset=utf-8' },
  })
}

export function makeToconlineMock(init?: {
  suppliers?: MockSupplier[]
  purchases?: Array<Omit<MockPurchase, 'payload'> & { payload?: Record<string, unknown> }>
}): ToconlineMock {
  const calls: RecordedCall[] = []
  const failRules: FailRule[] = []
  let tokenSeq = 0

  const state: ToconlineMock['state'] = {
    suppliers: [...(init?.suppliers ?? [])],
    purchases: (init?.purchases ?? []).map((p) => ({ payload: {}, ...p })),
    validAccessTokens: new Set<string>(),
    validRefreshTokens: new Set<string>(),
    authCode: 'mock-authorization-code',
    tokenGrants: [],
    nextSupplierId: 100,
    nextPurchaseId: 500,
  }

  function issueTokens(includeRefresh: boolean) {
    tokenSeq += 1
    const access = `${TOKEN_RESPONSE.access_token}-${tokenSeq}`
    state.validAccessTokens.add(access)
    if (includeRefresh) {
      const refresh = `${TOKEN_RESPONSE.refresh_token}-${tokenSeq}`
      state.validRefreshTokens.add(refresh)
      return { ...TOKEN_RESPONSE, access_token: access, refresh_token: refresh }
    }
    return { ...REFRESH_RESPONSE, access_token: access }
  }

  const fetchImpl: typeof fetch = async (input, initArg) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (initArg?.method ?? 'GET').toUpperCase()
    const headers: Record<string, string> = {}
    const rawHeaders = initArg?.headers ?? {}
    if (rawHeaders instanceof Headers) {
      rawHeaders.forEach((v, k) => {
        headers[k.toLowerCase()] = v
      })
    } else if (Array.isArray(rawHeaders)) {
      for (const [k, v] of rawHeaders) headers[k.toLowerCase()] = v
    } else {
      for (const [k, v] of Object.entries(rawHeaders as Record<string, string>)) {
        headers[k.toLowerCase()] = v
      }
    }
    const body = typeof initArg?.body === 'string' ? initArg.body : null
    calls.push({ method, url, headers, body })

    const failRule = failRules.find((r) => r.times > 0 && r.match.test(url))
    if (failRule) {
      failRule.times -= 1
      return jsonResponse(failRule.status, { error: `mock failure ${failRule.status}` })
    }

    const u = new URL(url)

    // ── OAuth: GET {OAUTH_URL}/auth → 302 with code in Location (doc §2.1) ──
    if (url.startsWith(MOCK_OAUTH_URL) && u.pathname.endsWith('/auth') && method === 'GET') {
      if (
        u.searchParams.get('client_id') !== MOCK_CLIENT_ID ||
        u.searchParams.get('response_type') !== 'code' ||
        u.searchParams.get('scope') !== 'commercial' ||
        !u.searchParams.get('redirect_uri')
      ) {
        return jsonResponse(400, { error: 'invalid authorization request' })
      }
      const redirect = u.searchParams.get('redirect_uri')!
      return new Response(null, {
        status: 302,
        headers: { Location: `${redirect}?code=${state.authCode}` },
      })
    }

    // ── OAuth: POST {OAUTH_URL}/token (doc §2.2/§2.3) ──
    if (url.startsWith(MOCK_OAUTH_URL) && u.pathname.endsWith('/token') && method === 'POST') {
      const expectedBasic = `Basic ${Buffer.from(`${MOCK_CLIENT_ID}:${MOCK_CLIENT_SECRET}`).toString('base64')}`
      if (headers['authorization'] !== expectedBasic) {
        return jsonResponse(401, { error: 'invalid_client' })
      }
      if (headers['content-type'] !== 'application/x-www-form-urlencoded') {
        return jsonResponse(400, { error: 'invalid content type' })
      }
      const params = new URLSearchParams(body ?? '')
      const grant = params.get('grant_type') ?? ''
      state.tokenGrants.push(grant)
      if (params.get('scope') !== 'commercial') {
        return jsonResponse(400, { error: 'invalid_scope' })
      }
      if (grant === 'authorization_code') {
        if (params.get('code') !== state.authCode) return jsonResponse(400, { error: 'invalid_grant' })
        return jsonResponse(200, issueTokens(true))
      }
      if (grant === 'refresh_token') {
        const rt = params.get('refresh_token') ?? ''
        if (!state.validRefreshTokens.has(rt)) return jsonResponse(400, { error: 'invalid_grant' })
        // Documented refresh example carries NO refresh_token field (fixture)
        return jsonResponse(200, issueTokens(false))
      }
      return jsonResponse(400, { error: 'unsupported_grant_type' })
    }

    // ── Commercial API — Bearer required on every request (doc §3) ──
    if (url.startsWith(MOCK_API_URL)) {
      const auth = headers['authorization'] ?? ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (!state.validAccessTokens.has(token)) {
        return jsonResponse(401, { error: 'Unauthorized' })
      }
      // Mandatory headers per docs/caracteristicas-dos-pedidos.md
      if (headers['content-type'] !== 'application/vnd.api+json' || headers['accept'] !== 'application/json') {
        return jsonResponse(400, { error: 'missing mandatory headers' })
      }

      if (u.pathname === '/api/suppliers' && method === 'GET') {
        const nif = u.searchParams.get('filter[tax_registration_number]')
        const matches = nif
          ? state.suppliers.filter((s) => s.tax_registration_number === nif)
          : state.suppliers
        return jsonResponse(200, supplierListResponse(matches))
      }

      if (u.pathname === '/api/suppliers' && method === 'POST') {
        let parsed: {
          data?: { type?: string; attributes?: { tax_registration_number?: unknown; business_name?: unknown } }
        }
        try {
          parsed = JSON.parse(body ?? '')
        } catch {
          return jsonResponse(400, { error: 'invalid JSON' })
        }
        const attrs = parsed.data?.attributes
        if (parsed.data?.type !== 'suppliers' || !attrs?.tax_registration_number || !attrs?.business_name) {
          return jsonResponse(422, { error: 'tax_registration_number and business_name are required' })
        }
        const supplier: MockSupplier = {
          id: String(state.nextSupplierId++),
          tax_registration_number: String(attrs.tax_registration_number),
          business_name: String(attrs.business_name),
        }
        state.suppliers.push(supplier)
        const response = supplierListResponse([supplier])
        return jsonResponse(200, { data: response.data[0] })
      }

      if (u.pathname === '/api/commercial_purchases_documents' && method === 'GET') {
        let matches = state.purchases
        const status = u.searchParams.get('filter[status]')
        if (status !== null) matches = matches.filter((p) => String(p.status) === status)
        const nif = u.searchParams.get('filter[supplier_tax_registration_number]')
        if (nif !== null) matches = matches.filter((p) => p.supplier_tax_registration_number === nif)
        return jsonResponse(200, purchasesListResponse(matches))
      }

      if (u.pathname === '/api/v1/commercial_purchases_documents' && method === 'POST') {
        let payload: Record<string, unknown>
        try {
          payload = JSON.parse(body ?? '')
        } catch {
          return jsonResponse(400, { error: 'invalid JSON' })
        }
        if (payload.document_type !== 'FC' && payload.document_type !== 'DSP') {
          return jsonResponse(422, { error: 'document_type must be FC or DSP' })
        }
        if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
          return jsonResponse(422, { error: 'lines are required' })
        }
        let supplierNif = typeof payload.supplier_tax_registration_number === 'string'
          ? payload.supplier_tax_registration_number
          : ''
        if (typeof payload.supplier_id === 'number') {
          const supplier = state.suppliers.find((s) => Number(s.id) === payload.supplier_id)
          if (!supplier) return jsonResponse(422, { error: 'supplier not found' })
          supplierNif = supplier.tax_registration_number
        }
        const purchase: MockPurchase = {
          id: String(state.nextPurchaseId++),
          status: 1, // v1 POST creates the document already finalized (doc, red hint)
          supplier_tax_registration_number: supplierNif || '999999990',
          external_reference:
            typeof payload.external_reference === 'string' ? payload.external_reference : null,
          payload,
        }
        state.purchases.push(purchase)
        return jsonResponse(200, purchaseCreatedResponse(purchase.id))
      }
    }

    return jsonResponse(404, { error: `no mock route for ${method} ${url}` })
  }

  return {
    fetchImpl,
    calls,
    state,
    expireAccessTokens: () => state.validAccessTokens.clear(),
    expireRefreshTokens: () => state.validRefreshTokens.clear(),
    failNext: (match, status, times = 1) => failRules.push({ match, status, times }),
    apiCalls: () => calls.filter((c) => c.url.startsWith(MOCK_API_URL)),
  }
}

/** A fetch that must never run — used by the dry-run "zero network" [INV] test. */
export function makeForbiddenFetch(): { fetchImpl: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = []
  const fetchImpl: typeof fetch = async (input, initArg) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push({ method: initArg?.method ?? 'GET', url, headers: {}, body: null })
    throw new Error(`network access attempted in dry-run: ${url}`)
  }
  return { fetchImpl, calls }
}
