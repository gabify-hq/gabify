import type { DocumentSourceConnector, Page, SourceDocument } from '../sources/types'
import type { ToconlineClient } from './toconline-client'
import { mapSalesDocumentAttributes } from './toconline-sales-mapping'

/**
 * TOConline as a document SOURCE — adapts the TOConline sales pull to the
 * unified `DocumentSourceConnector` contract (U4). The PUSH side is unchanged.
 *
 * This connector is the READ surface only: it lists finalized issued sales
 * documents (one page per call, page-number cursor) and downloads their PDFs.
 * TOConline's pull has extra invariants the generic runner does not model —
 * dry-run previews and the GABIFY: anti-echo filter — so the production pull
 * keeps its own orchestration (toconline-pull-service) and consumes this
 * connector for listing/PDF. The unified `SourceDocument` it emits carries the
 * original attributes in `raw`, so no behaviour changes.
 */

const DEFAULT_PAGE_SIZE = 50

export interface ToconlineSourceConnectorOptions {
  client: ToconlineClient
  /** Documented incremental filter — documents.updated_at > this date. */
  updatedSince?: string
  pageSize?: number
}

function parsePageCursor(cursor: string): number {
  const page = Number(cursor)
  if (!Number.isInteger(page) || page < 1) {
    throw new Error(`Invalid TOConline pagination cursor: "${cursor}"`)
  }
  return page
}

/**
 * Maps documented sales-document header attributes to the unified DTO. VAT rate
 * is expressed in permil (percent × 10) like every other source; monetary
 * values are the integer cents produced by mapSalesDocumentAttributes.
 */
export function toconlineAttributesToSourceDocument(
  externalId: string,
  attributes: Record<string, unknown>,
): SourceDocument {
  const m = mapSalesDocumentAttributes(externalId, attributes)
  return {
    externalId: m.toconlineId,
    documentType: m.documentType,
    series: m.documentType,
    number: 0,
    sequenceNumber: m.documentNumber,
    issueDate: m.issueDate ? m.issueDate.toISOString().slice(0, 10) : '',
    dueDate: m.dueDate ? m.dueDate.toISOString().slice(0, 10) : null,
    customerName: m.buyerName ?? '',
    customerVat: m.buyerNif,
    lines: [], // TOConline lines require a separate call — enriched by the service
    vatBreakdownCents: m.vatBreakdown.map((b) => ({
      ratePermil: Math.round(b.rate * 10),
      baseCents: b.baseCents,
      amountCents: b.vatCents,
    })),
    beforeTaxesCents: m.netCents,
    taxesCents: m.vatCents,
    totalCents: m.totalCents,
    withholdingCents: m.withholdingCents > 0 ? m.withholdingCents : null,
    currency: m.currency,
    raw: attributes,
  }
}

export class ToconlineSourceConnector implements DocumentSourceConnector {
  private readonly client: ToconlineClient
  private readonly updatedSince: string | undefined
  private readonly pageSize: number

  constructor(options: ToconlineSourceConnectorOptions) {
    this.client = options.client
    this.updatedSince = options.updatedSince
    this.pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  }

  async listIssuedDocuments(cursor?: string): Promise<Page<SourceDocument>> {
    const page = cursor === undefined ? 1 : parsePageCursor(cursor)
    const items = await this.client.listFinalizedSalesDocuments({
      pageNumber: page,
      pageSize: this.pageSize,
      updatedSince: this.updatedSince,
    })
    const documents = items.map((item) =>
      toconlineAttributesToSourceDocument(item.id, item.attributes),
    )
    // A full page means more may follow (the API exposes no total count).
    const nextCursor = items.length === this.pageSize ? String(page + 1) : null
    return { items: documents, nextCursor }
  }

  async fetchPdf(externalId: string): Promise<Buffer | null> {
    const url = await this.client.getSalesDocumentPdfUrl(externalId)
    if (!url) return null
    return this.client.downloadPublicFile(url)
  }
}
