import { InvoicexpressApiError, InvoicexpressClient } from './invoicexpress-client'
import { mapListInvoiceToSourceDocument, toApiDate } from './mapping'
import { listInvoicesResponseSchema, pdfResponseSchema } from './schemas'
import type { InvoicexpressSourceDocument, ListIssuedDocumentsResult } from './types-local'

/**
 * Pull connector for InvoiceXpress as a SOURCE of issued sale documents.
 * Pure connector: credentials in, data out — ZERO persistence (the DB slice is
 * designed in HANDOFF_IVX.md).
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
  fetchImpl?: typeof fetch
  timeoutMs?: number
  minIntervalMs?: number
  maxRetries?: number
  backoffBaseMs?: number
  perPage?: number
  pdfMaxAttempts?: number
  pdfPollDelayMs?: number
}

export interface ListIssuedDocumentsOptions {
  /** Resume cursor: first page to request (1-based). Defaults to 1. */
  fromPage?: number
  /** Optional issue-date window, ISO yyyy-mm-dd (converted to dd/mm/yyyy). */
  dateFrom?: string
  dateTo?: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class InvoicexpressConnector {
  private readonly client: InvoicexpressClient
  private readonly perPage: number
  private readonly pdfMaxAttempts: number
  private readonly pdfPollDelayMs: number

  constructor(config: InvoicexpressConnectorConfig) {
    this.client = new InvoicexpressClient(config)
    this.perPage = config.perPage ?? DEFAULT_PER_PAGE
    this.pdfMaxAttempts = config.pdfMaxAttempts ?? DEFAULT_PDF_MAX_ATTEMPTS
    this.pdfPollDelayMs = config.pdfPollDelayMs ?? DEFAULT_PDF_POLL_DELAY_MS
  }

  /**
   * Lists every finalized issued sale document, walking the documented
   * pagination from `fromPage` to the last page. Deduplicates by externalId
   * across pages and never returns drafts/canceled/deleted documents.
   */
  async listIssuedDocuments(
    options: ListIssuedDocumentsOptions = {},
  ): Promise<ListIssuedDocumentsResult> {
    const startPage = options.fromPage ?? 1
    const seen = new Set<string>()
    const documents: InvoicexpressSourceDocument[] = []

    let page = startPage
    let totalPages = startPage
    do {
      const query: Record<string, string | number | boolean | string[]> = {
        'type[]': [...ISSUED_DOCUMENT_TYPES],
        'status[]': [...FINALIZED_STATUS_FILTER],
        non_archived: true,
        page,
        per_page: this.perPage,
      }
      if (options.dateFrom) query['date[from]'] = toApiDate(options.dateFrom)
      if (options.dateTo) query['date[to]'] = toApiDate(options.dateTo)

      const body = await this.client.getJson('/invoices.json', query)
      const parsed = listInvoicesResponseSchema.safeParse(body)
      if (!parsed.success) {
        throw new InvoicexpressApiError(
          `InvoiceXpress list response does not match the documented contract (page ${page}): ${parsed.error.message}`,
        )
      }

      for (const invoice of parsed.data.invoices) {
        if (EXCLUDED_STATUSES.has(invoice.status)) continue
        const doc = mapListInvoiceToSourceDocument(invoice)
        if (seen.has(doc.externalId)) continue
        seen.add(doc.externalId)
        documents.push(doc)
      }

      totalPages = parsed.data.pagination.total_pages
      page += 1
    } while (page <= totalPages)

    return {
      documents,
      cursor: { nextPage: null, totalPages },
    }
  }

  /**
   * Resolves the PDF URL for a document via `GET /api/pdf/{document-id}.json`,
   * polling through the documented 202 responses until the 200 with
   * `output.pdfUrl` (docs/generatepdf.md).
   */
  async fetchPdf(externalId: string): Promise<{ pdfUrl: string }> {
    for (let attempt = 1; attempt <= this.pdfMaxAttempts; attempt += 1) {
      const { status, body } = await this.client.getJsonWithStatus(
        `/api/pdf/${encodeURIComponent(externalId)}.json`,
      )
      if (status === 200) {
        const parsed = pdfResponseSchema.safeParse(body)
        if (!parsed.success) {
          throw new InvoicexpressApiError(
            `InvoiceXpress PDF response does not match the documented contract: ${parsed.error.message}`,
          )
        }
        return { pdfUrl: parsed.data.output.pdfUrl }
      }
      // 202: "keep requesting until you get a response with HTTP status code 200"
      if (attempt < this.pdfMaxAttempts) await sleep(this.pdfPollDelayMs)
    }
    throw new InvoicexpressApiError(
      `InvoiceXpress PDF for document ${externalId} still pending after ${this.pdfMaxAttempts} attempts (202)`,
    )
  }
}
