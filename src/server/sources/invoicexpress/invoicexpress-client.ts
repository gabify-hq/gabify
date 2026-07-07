import { redactApiKey, redactUrl } from './redact'
import { errorResponseSchema } from './schemas'

/**
 * HTTP client for the InvoiceXpress API — doc-driven, NEVER tested against the
 * real service (INTEGRATION_NOTES_IVX.md). Everything below exists in
 * `integrations/invoicexpress/docs/`:
 *
 * - Base URL `https://{account_name}.app.invoicexpress.com` (index.md, Servers).
 * - Auth: `api_key` in the query string of every request (index.md, Security;
 *   apiKeyAuth In: query). No header alternative is documented, so the key is
 *   injected here and REDACTED from every error/log surface (redact.ts).
 * - JSON only; `Accept: application/json` on requests.
 * - Rate limit: 780 req/min per account, 429 on excess (index.md) — we stay
 *   far below it with an internal gate of 2 req/s per client instance.
 *
 * Robustness: 30s timeout, retry with exponential backoff (max 3 retries,
 * ONLY on 5xx/timeout/network — never on 4xx), mirroring the TOConline client.
 */

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MIN_INTERVAL_MS = 500 // 2 req/s
const DEFAULT_MAX_RETRIES = 3
const DEFAULT_BACKOFF_BASE_MS = 500

export class InvoicexpressApiError extends Error {
  readonly status?: number
  readonly retryable: boolean

  constructor(message: string, options: { status?: number; retryable?: boolean } = {}) {
    super(message)
    this.name = 'InvoicexpressApiError'
    this.status = options.status
    this.retryable = options.retryable ?? false
  }
}

export interface InvoicexpressClientConfig {
  /** Account subdomain, e.g. "demo-firm" for demo-firm.app.invoicexpress.com. */
  accountName: string
  apiKey: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  minIntervalMs?: number
  maxRetries?: number
  backoffBaseMs?: number
}

export type QueryValue = string | number | boolean | string[]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export class InvoicexpressClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly minIntervalMs: number
  private readonly maxRetries: number
  private readonly backoffBaseMs: number

  private lastRequestAt = 0
  private rateGate: Promise<void> = Promise.resolve()

  constructor(config: InvoicexpressClientConfig) {
    if (!/^[a-z0-9-]+$/i.test(config.accountName)) {
      throw new InvoicexpressApiError(`Invalid account name: "${config.accountName}"`)
    }
    this.baseUrl = `https://${config.accountName}.app.invoicexpress.com`
    this.apiKey = config.apiKey
    this.fetchImpl = config.fetchImpl ?? fetch
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.minIntervalMs = config.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES
    this.backoffBaseMs = config.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS
  }

  /**
   * GET a JSON endpoint. `query` values are appended verbatim; array values
   * repeat the key (documented form style, e.g. `type[]=Invoice&type[]=...`).
   * Returns the parsed body; the caller validates it with the zod contracts.
   */
  async getJson(path: string, query: Record<string, QueryValue> = {}): Promise<unknown> {
    const { body } = await this.getJsonWithStatus(path, query)
    return body
  }

  /**
   * Like getJson but also exposes the HTTP status — needed by the PDF endpoint
   * where 202 means "keep polling" (docs/generatepdf.md).
   */
  async getJsonWithStatus(
    path: string,
    query: Record<string, QueryValue> = {},
  ): Promise<{ status: number; body: unknown }> {
    const url = this.buildUrl(path, query)

    let lastError: InvoicexpressApiError | null = null
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      if (attempt > 0) {
        await sleep(this.backoffBaseMs * 2 ** (attempt - 1))
      }
      try {
        return await this.requestOnce(url)
      } catch (error) {
        const apiError =
          error instanceof InvoicexpressApiError
            ? error
            : new InvoicexpressApiError(this.redact(String(error)), { retryable: true })
        if (!apiError.retryable) throw apiError
        lastError = apiError
      }
    }
    throw lastError ?? new InvoicexpressApiError('Request failed with no recorded error')
  }

  /** Exposes redaction so callers can sanitize anything derived from requests. */
  redact(text: string): string {
    return redactApiKey(redactUrl(text), this.apiKey)
  }

  private buildUrl(path: string, query: Record<string, QueryValue>): URL {
    const url = new URL(path, this.baseUrl)
    url.searchParams.set('api_key', this.apiKey)
    for (const [key, value] of Object.entries(query)) {
      if (Array.isArray(value)) {
        for (const entry of value) url.searchParams.append(key, entry)
      } else {
        url.searchParams.set(key, String(value))
      }
    }
    return url
  }

  private async requestOnce(url: URL): Promise<{ status: number; body: unknown }> {
    await this.waitForRateSlot()

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    let response: Response
    try {
      response = await this.fetchImpl(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
    } catch (error) {
      const reason = isAbortError(error)
        ? `timeout after ${this.timeoutMs}ms`
        : this.redact(String(error))
      throw new InvoicexpressApiError(
        `InvoiceXpress request failed (${this.redact(url.toString())}): ${reason}`,
        { retryable: true },
      )
    } finally {
      clearTimeout(timer)
    }

    if (response.status >= 500) {
      throw new InvoicexpressApiError(
        `InvoiceXpress responded ${response.status} (${this.redact(url.toString())})`,
        { status: response.status, retryable: true },
      )
    }

    const body: unknown = await response.json().catch(() => null)

    if (!response.ok && response.status !== 202) {
      const parsedError = errorResponseSchema.safeParse(body)
      const detail = parsedError.success ? parsedError.data.errors.error : 'no error detail'
      throw new InvoicexpressApiError(
        `InvoiceXpress responded ${response.status} (${this.redact(url.toString())}): ${this.redact(detail)}`,
        { status: response.status, retryable: false },
      )
    }

    return { status: response.status, body }
  }

  private async waitForRateSlot(): Promise<void> {
    const previousGate = this.rateGate
    let release: () => void = () => undefined
    this.rateGate = new Promise((resolve) => {
      release = resolve
    })
    await previousGate
    try {
      const waitMs = this.lastRequestAt + this.minIntervalMs - Date.now()
      if (waitMs > 0) await sleep(waitMs)
      this.lastRequestAt = Date.now()
    } finally {
      release()
    }
  }
}
