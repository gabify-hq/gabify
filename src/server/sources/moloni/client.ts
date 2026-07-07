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
 *
 * The client is pure: credentials and token state come in by parameter,
 * nothing is persisted. New token state is exposed via onTokenState.
 */

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

export class MoloniApiClient {
  constructor(credentials: MoloniCredentials, deps?: MoloniClientDeps, initial?: MoloniTokenState) {
    void credentials
    void deps
    void initial
    throw new Error('Not implemented (RED)')
  }

  /**
   * POSTs to `https://api.moloni.pt/v1/<endpoint>/` with the given params
   * urlencoded in the body and a valid access_token in the query string.
   * Returns the parsed JSON response.
   */
  async call(endpoint: string, params: Record<string, string | number>): Promise<unknown> {
    void endpoint
    void params
    throw new Error('Not implemented (RED)')
  }

  /** Downloads a URL (e.g. a getPDFLink url) and returns the raw bytes. */
  async fetchBinary(url: string): Promise<Buffer> {
    void url
    throw new Error('Not implemented (RED)')
  }
}
