import { getToconlineFetch } from './fetch-provider'

/**
 * HTTP client for the TOConline commercial API — doc-driven, NEVER tested
 * against the real service (INTEGRATION_NOTES.md). Every endpoint, field and
 * header below exists in `integrations/toconline/docs/` or in the saved
 * OpenAPI spec:
 *
 * - OAuth: GET {OAUTH_URL}/auth (302 → code) + POST {OAUTH_URL}/token with
 *   Basic base64(client_id:secret) — autenticacao-detalhada.md §2.
 * - Mandatory API headers: Content-Type application/vnd.api+json, Accept
 *   application/json, Authorization Bearer — caracteristicas-dos-pedidos.md.
 * - access_token lives 4h (expires_in 14400); refresh_token 8h. When refresh
 *   fails the client falls back to the full authorization_code flow (the GET
 *   /auth answers 302 with the code directly — no user interaction).
 *
 * Robustness: 30s timeout, retry with exponential backoff (max 3 retries,
 * ONLY on 5xx/timeout/network), internal rate limit of 2 req/s per client
 * instance (one instance per connection per job run).
 */

/** Fixed by the TOConline OAuth service (autenticacao-detalhada.md, Passo 1). */
export const TOCONLINE_REDIRECT_URI = 'https://oauth.pstmn.io/v1/callback'

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MIN_INTERVAL_MS = 500 // 2 req/s
const DEFAULT_MAX_RETRIES = 3
const DEFAULT_BACKOFF_BASE_MS = 500
const TOKEN_EXPIRY_MARGIN_MS = 60_000

export class ToconlineApiError extends Error {
  readonly status?: number
  readonly retryable: boolean

  constructor(message: string, options: { status?: number; retryable?: boolean } = {}) {
    super(message)
    this.name = 'ToconlineApiError'
    this.status = options.status
    this.retryable = options.retryable ?? false
  }
}

export interface ToconlineTokens {
  accessToken: string
  refreshToken: string | null
  expiresAt: Date
}

export interface ToconlineClientConfig {
  oauthUrl: string
  apiUrl: string
  oauthClientId: string
  oauthClientSecret: string
  tokens?: {
    accessToken: string | null
    refreshToken: string | null
    expiresAt: Date | null
  }
  /** Called whenever tokens rotate so the caller can persist them (encrypted). */
  onTokens?: (tokens: ToconlineTokens) => void | Promise<void>
  fetchImpl?: typeof fetch
  timeoutMs?: number
  minIntervalMs?: number
  maxRetries?: number
  backoffBaseMs?: number
}

interface TokenEndpointResponse {
  access_token?: string
  expires_in?: number
  refresh_token?: string
}

interface JsonApiResource {
  type: string
  id: string
  attributes?: Record<string, unknown>
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

export class ToconlineClient {
  private readonly cfg: Required<
    Pick<ToconlineClientConfig, 'oauthUrl' | 'apiUrl' | 'oauthClientId' | 'oauthClientSecret'>
  >
  private readonly onTokens?: ToconlineClientConfig['onTokens']
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly minIntervalMs: number
  private readonly maxRetries: number
  private readonly backoffBaseMs: number

  private accessToken: string | null
  private refreshToken: string | null
  private expiresAt: Date | null
  private lastRequestAt = 0
  private rateGate: Promise<void> = Promise.resolve()

  constructor(config: ToconlineClientConfig) {
    this.cfg = {
      oauthUrl: trimTrailingSlash(config.oauthUrl),
      apiUrl: trimTrailingSlash(config.apiUrl),
      oauthClientId: config.oauthClientId,
      oauthClientSecret: config.oauthClientSecret,
    }
    this.onTokens = config.onTokens
    this.fetchImpl = config.fetchImpl ?? getToconlineFetch()
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.minIntervalMs = config.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES
    this.backoffBaseMs = config.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS
    this.accessToken = config.tokens?.accessToken ?? null
    this.refreshToken = config.tokens?.refreshToken ?? null
    this.expiresAt = config.tokens?.expiresAt ?? null
  }

  // ── Credential hygiene [INV]: error strings never carry secrets/tokens ──
  private redact(text: string): string {
    let out = text
    const secrets = [this.cfg.oauthClientSecret, this.accessToken, this.refreshToken].filter(
      (s): s is string => Boolean(s && s.length > 3),
    )
    for (const secret of secrets) {
      out = out.split(secret).join('[REDACTED]')
    }
    return out
  }

  // ── Low-level fetch with timeout; network/abort mapped to retryable errors ──
  private async rawFetch(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal, redirect: 'manual' })
    } catch (error) {
      const name = error instanceof Error ? error.name : 'Error'
      const kind = name === 'AbortError' ? 'timeout' : 'network error'
      throw new ToconlineApiError(`TOConline request failed (${kind}): ${init.method ?? 'GET'} ${new URL(url).pathname}`, {
        retryable: true,
      })
    } finally {
      clearTimeout(timer)
    }
  }

  // ── OAuth (doc §2.1–2.3) ─────────────────────────────────────────────────

  private basicAuthHeader(): string {
    const raw = `${this.cfg.oauthClientId}:${this.cfg.oauthClientSecret}`
    return `Basic ${Buffer.from(raw, 'utf-8').toString('base64')}`
  }

  private async tokenRequest(params: URLSearchParams): Promise<TokenEndpointResponse> {
    const response = await this.rawFetch(`${this.cfg.oauthUrl}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        Authorization: this.basicAuthHeader(),
      },
      body: params.toString(),
    })
    if (!response.ok) {
      throw new ToconlineApiError(`TOConline token request rejected (HTTP ${response.status})`, {
        status: response.status,
      })
    }
    return (await response.json()) as TokenEndpointResponse
  }

  /** Full authorization_code flow — non-interactive per the docs (§2.1). */
  private async authenticate(): Promise<void> {
    const authUrl =
      `${this.cfg.oauthUrl}/auth` +
      `?client_id=${encodeURIComponent(this.cfg.oauthClientId)}` +
      `&redirect_uri=${encodeURIComponent(TOCONLINE_REDIRECT_URI)}` +
      `&response_type=code&scope=commercial`
    const authResponse = await this.rawFetch(authUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
    // Expected: 302 with the code in the Location header — never followed
    const location = authResponse.headers.get('Location') ?? authResponse.headers.get('location')
    if (!location) {
      throw new ToconlineApiError(
        `TOConline authorization failed: expected 302 with Location, got HTTP ${authResponse.status}`,
        { status: authResponse.status },
      )
    }
    const code = new URL(location, TOCONLINE_REDIRECT_URI).searchParams.get('code')
    if (!code) {
      throw new ToconlineApiError('TOConline authorization failed: no code in redirect Location')
    }

    const tokens = await this.tokenRequest(
      new URLSearchParams({ grant_type: 'authorization_code', code, scope: 'commercial' }),
    )
    await this.applyTokens(tokens, null)
  }

  private async refresh(): Promise<void> {
    if (!this.refreshToken) {
      throw new ToconlineApiError('TOConline refresh not possible: no refresh token stored')
    }
    const tokens = await this.tokenRequest(
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
        scope: 'commercial',
      }),
    )
    await this.applyTokens(tokens, this.refreshToken)
  }

  private async applyTokens(
    response: TokenEndpointResponse,
    previousRefreshToken: string | null,
  ): Promise<void> {
    if (!response.access_token) {
      throw new ToconlineApiError('TOConline token response missing access_token')
    }
    this.accessToken = response.access_token
    // The documented refresh example has no refresh_token — keep the previous
    // one in that case (INTEGRATION_NOTES.md ambiguity)
    this.refreshToken = response.refresh_token ?? previousRefreshToken
    const expiresInSeconds = response.expires_in ?? 14_400
    this.expiresAt = new Date(Date.now() + expiresInSeconds * 1000)
    await this.onTokens?.({
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      expiresAt: this.expiresAt,
    })
  }

  private tokenLooksValid(): boolean {
    if (!this.accessToken) return false
    if (!this.expiresAt) return true
    return this.expiresAt.getTime() - TOKEN_EXPIRY_MARGIN_MS > Date.now()
  }

  /** Refresh if possible, otherwise re-run the full authorization_code flow. */
  private async renewTokens(): Promise<void> {
    if (this.refreshToken) {
      try {
        await this.refresh()
        return
      } catch {
        // refresh_token only lives 8h — fall back to the full flow
      }
    }
    await this.authenticate()
  }

  private async ensureAccessToken(): Promise<string> {
    if (!this.tokenLooksValid()) {
      await this.renewTokens()
    }
    if (!this.accessToken) {
      throw new ToconlineApiError('TOConline authentication failed: no access token obtained')
    }
    return this.accessToken
  }

  // ── Rate limit: serialize requests ≥ minIntervalMs apart (2 req/s) ──────
  private async waitRateSlot(): Promise<void> {
    const previous = this.rateGate
    let release!: () => void
    this.rateGate = new Promise((resolve) => {
      release = resolve
    })
    await previous
    const wait = this.lastRequestAt + this.minIntervalMs - Date.now()
    if (wait > 0) await sleep(wait)
    this.lastRequestAt = Date.now()
    release()
  }

  // ── API request with auth, 401-refresh-retry, and 5xx/timeout backoff ───
  async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let attempt = 0
    let refreshed = false
    for (;;) {
      const token = await this.ensureAccessToken()
      await this.waitRateSlot()
      let response: Response
      try {
        response = await this.rawFetch(`${this.cfg.apiUrl}${path}`, {
          method,
          headers: {
            // Mandatory on every API request (caracteristicas-dos-pedidos.md)
            'Content-Type': 'application/vnd.api+json',
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
      } catch (error) {
        if (error instanceof ToconlineApiError && error.retryable && attempt < this.maxRetries) {
          attempt += 1
          await sleep(this.backoffBaseMs * 2 ** (attempt - 1))
          continue
        }
        throw error
      }

      if (response.status === 401 && !refreshed) {
        // access_token expired mid-flight (4h life) — renew and retry once,
        // transparently [INV]
        refreshed = true
        await this.renewTokens()
        continue
      }

      if (response.status >= 500 && attempt < this.maxRetries) {
        attempt += 1
        await sleep(this.backoffBaseMs * 2 ** (attempt - 1))
        continue
      }

      if (!response.ok) {
        let detail = ''
        try {
          detail = (await response.text()).slice(0, 500)
        } catch {
          // body unreadable — status alone is enough
        }
        throw new ToconlineApiError(
          this.redact(`TOConline API error HTTP ${response.status} on ${method} ${path.split('?')[0]}: ${detail}`),
          { status: response.status, retryable: response.status >= 500 },
        )
      }

      if (response.status === 204) return undefined as T
      return (await response.json()) as T
    }
  }

  /** Run the full OAuth flow now — used to validate freshly saved credentials. */
  async validateCredentials(): Promise<void> {
    await this.authenticate()
  }

  // ── Documented operations used by the push flow ─────────────────────────

  /** GET /api/suppliers?filter[tax_registration_number]=<NIF> (Compras, Nota 2). */
  async getSupplierByNif(nif: string): Promise<{ id: string; businessName: string } | null> {
    const result = await this.request<{ data?: JsonApiResource[] }>(
      'GET',
      `/api/suppliers?filter[tax_registration_number]=${encodeURIComponent(nif)}`,
    )
    const first = result.data?.[0]
    if (!first) return null
    return {
      id: first.id,
      businessName: String(first.attributes?.business_name ?? ''),
    }
  }

  /** POST /api/suppliers — JSONAPI payload per apis_empresa_fornecedores.md. */
  async createSupplier(params: { nif: string; businessName: string }): Promise<{ id: string }> {
    const result = await this.request<{ data?: JsonApiResource }>('POST', '/api/suppliers', {
      data: {
        type: 'suppliers',
        attributes: {
          tax_registration_number: params.nif,
          business_name: params.businessName,
        },
      },
    })
    if (!result.data?.id) {
      throw new ToconlineApiError('TOConline supplier creation returned no id')
    }
    return { id: result.data.id }
  }

  /**
   * GET /api/commercial_purchases_documents?filter[status]=1&filter[supplier_tax_registration_number]=<NIF>
   * — the documented idempotency filter (v0 doc page §2 + saved spec params).
   */
  async listFinalizedPurchasesBySupplierNif(
    nif: string,
  ): Promise<Array<{ id: string; externalReference: string | null }>> {
    const result = await this.request<{ data?: JsonApiResource[] }>(
      'GET',
      `/api/commercial_purchases_documents?filter[status]=1&filter[supplier_tax_registration_number]=${encodeURIComponent(nif)}`,
    )
    return (result.data ?? []).map((item) => ({
      id: item.id,
      externalReference:
        typeof item.attributes?.external_reference === 'string'
          ? item.attributes.external_reference
          : null,
    }))
  }

  /** POST /api/v1/commercial_purchases_documents — creates header+lines, auto-finalized. */
  async createPurchaseDocument(payload: Record<string, unknown>): Promise<{ id: string }> {
    const result = await this.request<{ data?: JsonApiResource; id?: string }>(
      'POST',
      '/api/v1/commercial_purchases_documents',
      payload,
    )
    // Conservative reading (INTEGRATION_NOTES.md #3): JSONAPI envelope or bare id
    const id = result.data?.id ?? result.id
    if (!id) {
      throw new ToconlineApiError('TOConline purchase creation returned no id')
    }
    return { id: String(id) }
  }
}
