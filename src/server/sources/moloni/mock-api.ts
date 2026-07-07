/**
 * In-memory fake of the Moloni HTTP API, used by the [INV] test suites.
 *
 * Behaviour is copied from the saved documentation (integrations/moloni/docs/):
 * - grant endpoint at /v1/grant/ driven by query-string params, issuing
 *   access tokens with expires_in 3600 (autenticacao.md)
 * - every data endpoint requires POST + application/x-www-form-urlencoded
 *   (controlo-de-erros.md) and a valid access_token in the query string
 *   (utilizacao.md)
 * - auth failures are HTTP 400 with {error, error_description}
 *   (controlo-de-erros.md)
 * - documents/getAll honours company_id, qty (max 50) and offset
 *   (documents_documents_getall.md)
 *
 * The mock counts token grants and per-endpoint calls so tests can assert
 * token reuse and retry behaviour.
 */
import type { MoloniDocumentDetail, MoloniDocumentSummary } from './schemas'
import { grantResponseFixture, pdfLinkFixture, summaryOf } from './fixtures'

const ACCESS_TOKEN_TTL_SECONDS = 3600
const MAX_QTY = 50

export interface MoloniApiMockOptions {
  credentials: {
    clientId: string
    clientSecret: string
    username: string
    password: string
  }
  /** Full document details served by getOne; summaries derived for getAll. */
  documents?: MoloniDocumentDetail[]
  /**
   * Explicit getAll pages keyed by offset/qty page index — overrides the
   * derived slicing (used to simulate offset drift/duplicates).
   */
  getAllPages?: MoloniDocumentSummary[][]
  /** Shared virtual clock in epoch ms. Defaults to Date.now. */
  now?: () => number
  /** Fail the first N getAll calls with this HTTP status (retry tests). */
  failGetAll?: { status: number; times: number }
  /** Never resolve data calls; reject on abort signal (timeout tests). */
  hangDataCalls?: boolean
  /** Inject an undocumented extra field into getAll items (contract tests). */
  extraFieldInGetAll?: boolean
}

export interface RecordedRequest {
  url: string
  method: string
  contentType: string | null
  body: string | null
  /** Virtual timestamp (ms) at which the request arrived. */
  atMs: number
}

export interface MoloniApiMock {
  fetchFn: typeof fetch
  counters: {
    grantPassword: number
    grantRefreshToken: number
    getAll: number
    getOne: number
    getPdfLink: number
    pdfDownload: number
  }
  requests: RecordedRequest[]
  issuedAccessTokens: string[]
}

interface IssuedToken {
  accessToken: string
  refreshToken: string
  issuedAtMs: number
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function authError(error: string, description: string): Response {
  return json(400, { error, error_description: description })
}

export function createMoloniApiMock(options: MoloniApiMockOptions): MoloniApiMock {
  const now = options.now ?? (() => Date.now())
  const documents = options.documents ?? []
  const issued: IssuedToken[] = []
  let tokenSerial = 0
  let getAllFailuresLeft = options.failGetAll?.times ?? 0

  const mock: MoloniApiMock = {
    fetchFn: undefined as unknown as typeof fetch,
    counters: {
      grantPassword: 0,
      grantRefreshToken: 0,
      getAll: 0,
      getOne: 0,
      getPdfLink: 0,
      pdfDownload: 0,
    },
    requests: [],
    issuedAccessTokens: [],
  }

  function issueTokens(): Response {
    tokenSerial += 1
    const token: IssuedToken = {
      accessToken: `mock-access-token-${tokenSerial}`,
      refreshToken: `mock-refresh-token-${tokenSerial}`,
      issuedAtMs: now(),
    }
    issued.push(token)
    mock.issuedAccessTokens.push(token.accessToken)
    return json(
      200,
      grantResponseFixture({
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
      })
    )
  }

  function isAccessTokenValid(accessToken: string | null): boolean {
    if (!accessToken) return false
    const token = issued.find((t) => t.accessToken === accessToken)
    if (!token) return false
    return now() - token.issuedAtMs < ACCESS_TOKEN_TTL_SECONDS * 1000
  }

  function handleGrant(url: URL): Response {
    const grantType = url.searchParams.get('grant_type')
    const clientOk =
      url.searchParams.get('client_id') === options.credentials.clientId &&
      url.searchParams.get('client_secret') === options.credentials.clientSecret
    if (!clientOk) {
      return authError('invalid_client', 'The client credentials are invalid')
    }
    if (grantType === 'password') {
      mock.counters.grantPassword += 1
      const userOk =
        url.searchParams.get('username') === options.credentials.username &&
        url.searchParams.get('password') === options.credentials.password
      if (!userOk) {
        return authError('invalid_grant', 'Invalid username and password combination')
      }
      return issueTokens()
    }
    if (grantType === 'refresh_token') {
      mock.counters.grantRefreshToken += 1
      const refreshToken = url.searchParams.get('refresh_token')
      const known = issued.some((t) => t.refreshToken === refreshToken)
      if (!known) {
        return authError('invalid_grant', 'Invalid refresh token')
      }
      return issueTokens()
    }
    return authError('unsupported_grant_type', `Grant type ${grantType ?? ''} not supported`)
  }

  function getAllResponse(qty: number, offset: number): MoloniDocumentSummary[] {
    if (options.getAllPages) {
      const pageIndex = qty > 0 ? Math.floor(offset / qty) : 0
      return options.getAllPages[pageIndex] ?? []
    }
    return documents.map((d) => summaryOf(d)).slice(offset, offset + qty)
  }

  function handleData(url: URL, body: URLSearchParams, atMs: number): Response {
    const path = url.pathname
    if (path === '/v1/documents/getAll/') {
      mock.counters.getAll += 1
      if (getAllFailuresLeft > 0 && options.failGetAll) {
        getAllFailuresLeft -= 1
        return new Response('mock server error', { status: options.failGetAll.status })
      }
      const qty = Math.min(Number(body.get('qty') ?? '50'), MAX_QTY)
      const offset = Number(body.get('offset') ?? '0')
      const items: unknown[] = getAllResponse(qty, offset)
      if (options.extraFieldInGetAll) {
        return json(
          200,
          items.map((item) => ({ ...(item as object), undocumented_field: true }))
        )
      }
      return json(200, items)
    }
    if (path === '/v1/documents/getOne/') {
      mock.counters.getOne += 1
      const documentId = Number(body.get('document_id'))
      const detail = documents.find((d) => d.document_id === documentId)
      if (!detail) {
        return json(400, ['2 document_id 1 0'])
      }
      return json(200, detail)
    }
    if (path === '/v1/documents/getPDFLink/') {
      mock.counters.getPdfLink += 1
      const documentId = Number(body.get('document_id'))
      const detail = documents.find((d) => d.document_id === documentId)
      // "Só podem ser pedidos documentos que já não estejam em estado de
      // rascunho (status 0)" — getpdflink doc page
      if (!detail || detail.status === 0) {
        return json(400, ['5 document_id'])
      }
      return json(200, pdfLinkFixture(documentId))
    }
    void atMs
    return new Response('not found', { status: 404 })
  }

  const fetchFn = (async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const urlString =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const url = new URL(urlString)
    const method = init?.method ?? 'GET'
    const headers = new Headers(init?.headers)
    const bodyText = typeof init?.body === 'string' ? init.body : null
    const atMs = now()
    mock.requests.push({
      url: urlString,
      method,
      contentType: headers.get('content-type'),
      body: bodyText,
      atMs,
    })

    if (url.hostname === 'mock.moloni.local' && url.pathname.startsWith('/pdf/')) {
      mock.counters.pdfDownload += 1
      return new Response(Buffer.from(`%PDF ${url.pathname}`), { status: 200 })
    }

    if (url.pathname === '/v1/grant/') {
      return handleGrant(url)
    }

    if (options.hangDataCalls) {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('This operation was aborted', 'AbortError'))
        })
      })
    }

    if (method !== 'POST') {
      return authError('invalid_request', 'Os dados dos pedidos deve ser fornecidos por POST')
    }
    if (headers.get('content-type') !== 'application/x-www-form-urlencoded') {
      return authError(
        'invalid_request',
        'The content type for POST requests must be "application/x-www-form-urlencoded"'
      )
    }
    if (!isAccessTokenValid(url.searchParams.get('access_token'))) {
      return authError('invalid_grant', 'Token is no longer valid')
    }
    return handleData(url, new URLSearchParams(bodyText ?? ''), atMs)
  }) as typeof fetch

  mock.fetchFn = fetchFn
  return mock
}
