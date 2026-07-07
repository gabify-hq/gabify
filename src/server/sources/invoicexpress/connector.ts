import { InvoicexpressApiError, InvoicexpressClient } from './invoicexpress-client'
import { mapListInvoiceToSourceDocument, toApiDate } from './mapping'
import { clientDetailResponseSchema, listInvoicesResponseSchema, pdfResponseSchema } from './schemas'
import type { DocumentSourceConnector, Page, SourceDocument } from '../types'

/**
 * Pull connector for InvoiceXpress as a SOURCE of issued sale documents.
 *
 * Implements the unified `DocumentSourceConnector` contract
 * (`src/server/sources/types.ts`): pure connector, credentials in, data out,
 * ZERO persistence. One page of `SourceDocument`s per `listIssuedDocuments`
 * call; pass the previous `nextCursor` (the 1-based page number) to resume.
 * The optional issue-date window is a constructor option (the contract signature
 * carries only the pagination cursor).
 *
 * Doc-driven, never tested against the real API (INTEGRATION_NOTES_IVX.md).
 */

/**
 * All sale document types in the documented `type[]` list-filter enum
 * (docs/openapi.yaml `QueryParamns`). `SimplifiedInvoice` is deliberately
 * absent — it is not part of the documented enum (INTEGRATION_NOTES_IVX.md).
 */
const ISSUED_DOCUMENT_TYPES = [
  'Invoice',
  'InvoiceReceipt',
  'CreditNote',
  'DebitNote',
  'Receipt',
  'CashInvoice',
] as const

/**
 * Finalized statuses per the documented `status[]` enum. `draft`, `canceled`
 * and `deleted` are excluded on the request; `final` appears in response
 * examples but not in the filter enum, so a defensive client-side guard also
 * drops anything non-finalized that slips through (INTEGRATION_NOTES_IVX.md).
 */
const FINALIZED_STATUS_FILTER = ['sent', 'settled', 'second_copy'] as const
const EXCLUDED_STATUSES: ReadonlySet<string> = new Set(['draft', 'canceled', 'deleted'])

const DEFAULT_PER_PAGE = 30
const DEFAULT_PDF_MAX_ATTEMPTS = 5
const DEFAULT_PDF_POLL_DELAY_MS = 1_000

export interface InvoicexpressConnectorConfig {
  accountName: string
  apiKey: string
  /** Optional issue-date window, ISO yyyy-mm-dd (converted to dd/mm/yyyy). */
  dateFrom?: string
  dateTo?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  minIntervalMs?: number
  maxRetries?: number
  backoffBaseMs?: number
  perPage?: number
  pdfMaxAttempts?: number
  pdfPollDelayMs?: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parsePageCursor(cursor: string): number {
  const page = Number(cursor)
  if (!Number.isInteger(page) || page < 1) {
    throw new InvoicexpressApiError(`Invalid InvoiceXpress pagination cursor: "${cursor}"`)
  }
  return page
}

export class InvoicexpressConnector implements DocumentSourceConnector {
  private readonly client: InvoicexpressClient
  private readonly dateFrom?: string
  private readonly dateTo?: string
  private readonly perPage: number
  private readonly pdfMaxAttempts: number
  private readonly pdfPollDelayMs: number
  /**
   * External ids already returned by this instance — page pagination can repeat
   * documents across pages when the collection shifts upstream.
   */
  private readonly seenExternalIds = new Set<string>()

  constructor(config: InvoicexpressConnectorConfig) {
    this.client = new InvoicexpressClient(config)
    this.dateFrom = config.dateFrom
    this.dateTo = config.dateTo
    this.perPage = config.perPage ?? DEFAULT_PER_PAGE
    this.pdfMaxAttempts = config.pdfMaxAttempts ?? DEFAULT_PDF_MAX_ATTEMPTS
    this.pdfPollDelayMs = config.pdfPollDelayMs ?? DEFAULT_PDF_POLL_DELAY_MS
  }

  /**
   * Lists one page of finalized issued sale documents. `cursor` is the 1-based
   * page number to fetch (omit for the first page); `nextCursor` is the next
   * page, or null on the last page. Drafts/canceled/deleted are never returned
   * and documents already yielded by this instance are de-duplicated.
   */
  async listIssuedDocuments(cursor?: string): Promise<Page<SourceDocument>> {
    const page = cursor === undefined ? 1 : parsePageCursor(cursor)

    const query: Record<string, string | number | boolean | string[]> = {
      'type[]': [...ISSUED_DOCUMENT_TYPES],
      'status[]': [...FINALIZED_STATUS_FILTER],
      non_archived: true,
      page,
      per_page: this.perPage,
    }
    if (this.dateFrom) query['date[from]'] = toApiDate(this.dateFrom)
    if (this.dateTo) query['date[to]'] = toApiDate(this.dateTo)

    const body = await this.client.getJson('/invoices.json', query)
    const parsed = listInvoicesResponseSchema.safeParse(body)
    if (!parsed.success) {
      throw new InvoicexpressApiError(
        `InvoiceXpress list response does not match the documented contract (page ${page}): ${parsed.error.message}`,
      )
    }

    const items: SourceDocument[] = []
    for (const invoice of parsed.data.invoices) {
      if (EXCLUDED_STATUSES.has(invoice.status)) continue
      const doc = mapListInvoiceToSourceDocument(invoice)
      if (this.seenExternalIds.has(doc.externalId)) continue
      this.seenExternalIds.add(doc.externalId)
      items.push(doc)
    }

    const totalPages = parsed.data.pagination.total_pages
    const nextCursor = page < totalPages ? String(page + 1) : null
    return { items, nextCursor }
  }

  /**
   * Resolves a customer's NIF via `GET /clients/{client-id}.json`
   * (`client.fiscal_id`). Document responses never carry the NIF, so the pull
   * job calls this ONCE per final customer (cached). Returns null when the
   * client is unknown (4xx) or exposes no fiscal id.
   */
  async resolveClientNif(externalId: string): Promise<string | null> {
    let body: unknown
    try {
      body = await this.client.getJson(`/clients/${encodeURIComponent(externalId)}.json`)
    } catch (error) {
      if (error instanceof InvoicexpressApiError && error.status && error.status < 500) {
        return null
      }
      throw error
    }
    const parsed = clientDetailResponseSchema.safeParse(body)
    if (!parsed.success) return null
    const nif = parsed.data.client.fiscal_id
    return nif && nif.trim() !== '' ? nif.trim() : null
  }

  /**
   * Resolves and downloads the official PDF for a document. Polls
   * `GET /api/pdf/{document-id}.json` through the documented 202 responses until
   * the 200 with `output.pdfUrl` (docs/generatepdf.md), then downloads the
   * pre-signed URL. Returns null when the document has no PDF (unknown id, or
   * still pending after the configured attempts) — best-effort, never fatal to
   * the pull job.
   */
  async fetchPdf(externalId: string): Promise<Buffer | null> {
    for (let attempt = 1; attempt <= this.pdfMaxAttempts; attempt += 1) {
      let status: number
      let body: unknown
      try {
        ;({ status, body } = await this.client.getJsonWithStatus(
          `/api/pdf/${encodeURIComponent(externalId)}.json`,
        ))
      } catch (error) {
        // 4xx (unknown id) → no PDF available; 5xx already retried by the client.
        if (error instanceof InvoicexpressApiError && error.status && error.status < 500) {
          return null
        }
        throw error
      }

      if (status === 200) {
        const parsed = pdfResponseSchema.safeParse(body)
        if (!parsed.success) {
          throw new InvoicexpressApiError(
            `InvoiceXpress PDF response does not match the documented contract: ${parsed.error.message}`,
          )
        }
        return this.client.fetchBinary(parsed.data.output.pdfUrl)
      }
      // 202: "keep requesting until you get a response with HTTP status code 200"
      if (attempt < this.pdfMaxAttempts) await sleep(this.pdfPollDelayMs)
    }
    return null
  }
}
