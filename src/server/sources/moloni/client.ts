/**
 * Moloni HTTP client — OAuth token lifecycle, transport rules, retry,
 * timeout, rate limiting and credential redaction.
 *
 * Doc-driven behaviour (integrations/moloni/docs/):
 * - token grant via GET https://api.moloni.pt/v1/grant/ with query params
 *   (autenticacao.md); access token valid 1 h, refresh token 14 days
 * - access token reused until close to expiry, never requested per call
 *   (utilizacao.md §Renovação da Access Token)
 * - data calls are POST with access_token in the query string and body
 *   application/x-www-form-urlencoded (utilizacao.md, controlo-de-erros.md)
 * - auth errors: HTTP 400 {error, error_description} (controlo-de-erros.md)
 * - data/validation errors: JSON array of "<code> <field>" strings
 *   (controlo-de-erros.md) — deterministic, never retried
 *
 * The client is pure: credentials and token state come in by parameter,
 * nothing is persisted. New token state is exposed via onTokenState.
 */
import { moloniAuthErrorSchema, moloniGrantResponseSchema } from './schemas'

const BASE_URL = 'https://api.moloni.pt/v1'
const REQUEST_TIMEOUT_MS = 30_000
const MAX_ATTEMPTS = 3
const RETRY_BACKOFF_BASE_MS = 1_000
/** 2 req/s internal ceiling — INTEGRATION_NOTES_MOLONI.md §8. */
const MIN_REQUEST_INTERVAL_MS = 500
/** Renew when this close to expiry — "usada praticamente na sua totalidade". */
const TOKEN_SAFETY_MARGIN_MS = 60_000

export interface MoloniCredentials {
  clientId: string
  clientSecret: string
  username: string
  password: string
}

export interface MoloniTokenState {
  accessToken: string
  refreshToken: string
  /** Epoch ms after which the access token must not be reused. */
  expiresAtEpochMs: number
}

export interface MoloniLogger {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

export interface MoloniClientDeps {
  fetchFn?: typeof fetch
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  logger?: MoloniLogger
  /** Called whenever a grant issues new tokens (persistence slice hook). */
  onTokenState?: (state: MoloniTokenState) => void
}

export type MoloniApiErrorKind = 'auth' | 'validation' | 'server' | 'timeout' | 'contract'

export class MoloniApiError extends Error {
  readonly kind: MoloniApiErrorKind
  readonly status: number | undefined

  constructor(kind: MoloniApiErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'MoloniApiError'
    this.kind = kind
    this.status = status
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const silentLogger: MoloniLogger = { info: () => {}, warn: () => {}, error: () => {} }

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export class MoloniApiClient {
  private readonly credentials: MoloniCredentials
  private readonly fetchFn: typeof fetch
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly logger: MoloniLogger
  private readonly onTokenState: ((state: MoloniTokenState) => void) | undefined
  private tokenState: MoloniTokenState | null
  private lastRequestAtMs = Number.NEGATIVE_INFINITY

  constructor(credentials: MoloniCredentials, deps?: MoloniClientDeps, initial?: MoloniTokenState) {
    this.credentials = credentials
    this.fetchFn = deps?.fetchFn ?? fetch
    this.now = deps?.now ?? (() => Date.now())
    this.sleep = deps?.sleep ?? defaultSleep
    this.logger = deps?.logger ?? silentLogger
    this.onTokenState = deps?.onTokenState
    this.tokenState = initial ?? null
  }

  /**
   * POSTs to `https://api.moloni.pt/v1/<endpoint>/` with the given params
   * urlencoded in the body and a valid access_token in the query string.
   * Returns the parsed JSON response.
   */
  async call(endpoint: string, params: Record<string, string | number>): Promise<unknown> {
    const accessToken = await this.ensureAccessToken()
    const url = `${BASE_URL}/${endpoint}/?access_token=${encodeURIComponent(accessToken)}`
    const body = new URLSearchParams(
      Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)]))
    ).toString()

    const response = await this.requestWithRetry(endpoint, url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (response.ok) {
      return response.json()
    }
    throw await this.toRequestError(endpoint, response)
  }

  /** Downloads a URL (e.g. a getPDFLink url) and returns the raw bytes. */
  async fetchBinary(url: string): Promise<Buffer> {
    const response = await this.requestWithRetry('binary download', url, { method: 'GET' })
    if (!response.ok) {
      throw new MoloniApiError(
        response.status >= 500 ? 'server' : 'validation',
        `Moloni binary download failed (HTTP ${response.status})`,
        response.status
      )
    }
    return Buffer.from(await response.arrayBuffer())
  }

  // --- token lifecycle -----------------------------------------------------

  private async ensureAccessToken(): Promise<string> {
    if (this.tokenState && this.now() < this.tokenState.expiresAtEpochMs - TOKEN_SAFETY_MARGIN_MS) {
      return this.tokenState.accessToken
    }
    if (this.tokenState) {
      try {
        await this.grant({
          grant_type: 'refresh_token',
          client_id: this.credentials.clientId,
          client_secret: this.credentials.clientSecret,
          refresh_token: this.tokenState.refreshToken,
        })
        return this.tokenState.accessToken
      } catch (error) {
        // Refresh token may have passed its 14-day validity — the doc says
        // the user must authenticate again (autenticacao.md).
        if (!(error instanceof MoloniApiError) || error.kind !== 'auth') throw error
        this.logger.warn('Moloni refresh token rejected; re-authenticating')
        this.tokenState = null
      }
    }
    await this.grant({
      grant_type: 'password',
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret,
      username: this.credentials.username,
      password: this.credentials.password,
    })
    if (!this.tokenState) {
      throw new MoloniApiError('auth', 'Moloni grant did not produce a token state')
    }
    return (this.tokenState as MoloniTokenState).accessToken
  }

  private async grant(params: Record<string, string>): Promise<void> {
    const url = `${BASE_URL}/grant/?${new URLSearchParams(params).toString()}`
    const response = await this.requestWithRetry('grant', url, { method: 'GET' })
    if (!response.ok) {
      throw await this.toGrantError(response)
    }
    const parsed = moloniGrantResponseSchema.safeParse(await response.json())
    if (!parsed.success) {
      throw new MoloniApiError('contract', 'Moloni grant response does not match the documented shape')
    }
    this.tokenState = {
      accessToken: parsed.data.access_token,
      refreshToken: parsed.data.refresh_token,
      expiresAtEpochMs: this.now() + parsed.data.expires_in * 1_000,
    }
    this.onTokenState?.(this.tokenState)
  }

  private async toGrantError(response: Response): Promise<MoloniApiError> {
    const status = response.status
    const body = await response.json().catch(() => null)
    const parsed = moloniAuthErrorSchema.safeParse(body)
    if (parsed.success) {
      // error/error_description are doc-defined constants, never credentials
      return new MoloniApiError(
        'auth',
        `Moloni authentication failed: ${parsed.data.error} (${parsed.data.error_description})`,
        status
      )
    }
    return new MoloniApiError('auth', `Moloni authentication failed (HTTP ${status})`, status)
  }

  private async toRequestError(endpoint: string, response: Response): Promise<MoloniApiError> {
    const status = response.status
    const body: unknown = await response.json().catch(() => null)
    if (Array.isArray(body)) {
      // "Código de erro + espaço + Nome do campo" — controlo-de-erros.md
      const codes = body.filter((item): item is string => typeof item === 'string').join('; ')
      return new MoloniApiError(
        'validation',
        `Moloni rejected ${endpoint}: ${codes || 'validation error'}`,
        status
      )
    }
    const authBody = moloniAuthErrorSchema.safeParse(body)
    if (authBody.success) {
      return new MoloniApiError(
        'auth',
        `Moloni rejected ${endpoint}: ${authBody.data.error} (${authBody.data.error_description})`,
        status
      )
    }
    return new MoloniApiError(
      status >= 500 ? 'server' : 'validation',
      `Moloni request to ${endpoint} failed (HTTP ${status})`,
      status
    )
  }

  // --- transport -----------------------------------------------------------

  /** Enforces the 2 req/s internal ceiling across every outgoing request. */
  private async throttle(): Promise<void> {
    const waitMs = this.lastRequestAtMs + MIN_REQUEST_INTERVAL_MS - this.now()
    if (waitMs > 0) {
      await this.sleep(waitMs)
    }
    this.lastRequestAtMs = this.now()
  }

  /**
   * Executes the request with a 30s timeout per attempt, retrying up to
   * 3 attempts total — only on 5xx responses and timeouts. 4xx responses
   * are returned to the caller (deterministic; never retried).
   */
  private async requestWithRetry(
    label: string,
    url: string,
    init: { method: string; headers?: Record<string, string>; body?: string }
  ): Promise<Response> {
    let lastError: MoloniApiError | null = null
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      if (attempt > 1) {
        await this.sleep(RETRY_BACKOFF_BASE_MS * 2 ** (attempt - 2))
      }
      await this.throttle()
      const controller = new AbortController()
      const timeoutHandle = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      try {
        const response = await this.fetchFn(url, { ...init, signal: controller.signal })
        if (response.status >= 500) {
          lastError = new MoloniApiError(
            'server',
            `Moloni request to ${label} failed (HTTP ${response.status})`,
            response.status
          )
          this.logger.warn(
            `Moloni ${label} attempt ${attempt}/${MAX_ATTEMPTS} got HTTP ${response.status}`
          )
          continue
        }
        return response
      } catch (error) {
        if (isAbortError(error)) {
          lastError = new MoloniApiError(
            'timeout',
            `Moloni request to ${label} timed out after ${REQUEST_TIMEOUT_MS}ms`
          )
          this.logger.warn(`Moloni ${label} attempt ${attempt}/${MAX_ATTEMPTS} timed out`)
          continue
        }
        // Network-level failure: retry alongside 5xx/timeout. Message is
        // sanitised — never include the URL (query strings carry secrets).
        lastError = new MoloniApiError('server', `Moloni request to ${label} failed: network error`)
        this.logger.warn(`Moloni ${label} attempt ${attempt}/${MAX_ATTEMPTS} network failure`)
        continue
      } finally {
        clearTimeout(timeoutHandle)
      }
    }
    throw lastError ?? new MoloniApiError('server', `Moloni request to ${label} failed`)
  }
}
