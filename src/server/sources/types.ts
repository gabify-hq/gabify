/**
 * Document source contract — v1.
 *
 * A "document source" is an external invoicing platform Gabify PULLS issued
 * documents from (Moloni is the first implementation; InvoiceXpress and the
 * TOConline pull flow are expected to adopt this contract later).
 *
 * This first version is deliberately shaped by what the Moloni API requires
 * (see integrations/moloni/docs/). It will be refined when a second source
 * migrates onto it — do not speculate about other providers here.
 *
 * Connectors are PURE: credentials and token state come in by parameter,
 * data comes out. No persistence, no schema access.
 */

/** One page of results plus the cursor to resume from. */
export interface Page<T> {
  items: T[]
  /** Opaque cursor for the next page, or null when this is the last page. */
  nextCursor: string | null
}

/** A single line (product/service) of a source document. */
export interface SourceDocumentLine {
  description: string
  /** Quantity as reported by the source. */
  quantity: number
  /** Unit price in cents (converted at the boundary, never floats). */
  unitPriceCents: number
  /** Discount percentage 0–100 as reported by the source. */
  discountPercent: number
  /**
   * Exemption reason when the line carries no VAT (mutually exclusive with
   * tax entries per the Moloni doc — see INTEGRATION_NOTES_MOLONI.md §5).
   */
  exemptionReason: string | null
}

/** VAT totals aggregated per rate, all monetary values in cents. */
export interface VatBreakdownEntry {
  /** Tax rate in permil (integer-safe: 23% → 230). */
  ratePermil: number
  /** Taxable base for this rate, in cents. */
  baseCents: number
  /** Tax amount for this rate, in cents. */
  amountCents: number
}

/**
 * Provider-neutral DTO for one issued document pulled from a source.
 * All monetary values are integers in cents; floats never cross this
 * boundary.
 */
export interface SourceDocument {
  /** Stable identifier in the source system (e.g. Moloni document_id). */
  externalId: string
  /** Document type code as reported by the source (e.g. SAF-T code "FT"). */
  documentType: string
  /** Document series name (e.g. Moloni document_set name). */
  series: string
  /** Sequential number within the series. */
  number: number
  /** Issue date, ISO 8601 (YYYY-MM-DD). */
  issueDate: string
  /** Final customer name as printed on the document. */
  customerName: string
  /** Final customer VAT number (NIF), null when absent. */
  customerVat: string | null
  lines: SourceDocumentLine[]
  vatBreakdownCents: VatBreakdownEntry[]
  /** Document total (after taxes and discounts), in cents. */
  totalCents: number
  /** ISO 4217 currency code of the monetary values. */
  currency: string
  /** Original source payload, untouched — for debugging and future mapping. */
  raw: unknown
}

/**
 * Contract every document source connector implements.
 *
 * `listIssuedDocuments` never returns drafts — only documents actually
 * issued in the source system.
 */
export interface DocumentSourceConnector {
  /**
   * Lists issued documents, oldest-offset first, one page per call.
   * Pass the previous page's `nextCursor` to resume; omit for the first page.
   */
  listIssuedDocuments(cursor?: string): Promise<Page<SourceDocument>>

  /**
   * Downloads the official PDF for a previously listed document.
   * Returns null when the source has no PDF for that reference
   * (e.g. drafts, unknown ids). Optional: not every source exposes PDFs.
   */
  fetchPdf?(externalId: string): Promise<Buffer | null>
}
