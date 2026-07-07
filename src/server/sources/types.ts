/**
 * Document source contract — v2 (unified).
 *
 * A "document source" is an external invoicing platform Gabify PULLS issued
 * documents from. Moloni was the first implementation; the InvoiceXpress
 * connector and the TOConline pull flow adopt this same contract (see the
 * sources-unification slice — HANDOFF.md).
 *
 * Shape reconciliation (U1): the contract keeps ONE representation per concept
 * and every connector adapts to it:
 *  - VAT rate is expressed in **permil** (integer-safe: 23% → 230). Moloni
 *    already produced permil; the InvoiceXpress mapper converts its percent
 *    rate to permil (numeric-equivalence proven in `rate-equivalence.test.ts`).
 *  - All monetary values are integers in **cents**; floats never cross this
 *    boundary.
 *  - Core fields are shared by every source; source-specific enrichments
 *    (IRS withholding, ATCUD, due date, document status, …) are optional and
 *    documented — a connector sets only what its API exposes.
 *
 * Connectors are PURE: credentials and token state come in by parameter, data
 * comes out. No persistence, no schema access.
 */

/** One page of results plus the cursor to resume from. */
export interface Page<T> {
  items: T[]
  /** Opaque cursor for the next page, or null when this is the last page. */
  nextCursor: string | null
}

/**
 * A single line (product/service) of a source document.
 *
 * Sources model lines differently, so only `description` and `quantity` are
 * guaranteed. Moloni reports unit price + discount percent + per-line taxes;
 * InvoiceXpress reports per-line subtotal/tax/discount amounts and a single
 * rate. Each connector fills the fields its API exposes and omits the rest —
 * the full original payload is always preserved in `SourceDocument.raw`.
 */
export interface SourceDocumentLine {
  description: string
  /** Quantity as reported by the source. */
  quantity: number
  /** Unit price in cents (Moloni). */
  unitPriceCents?: number
  /** Discount percentage 0–100 (Moloni). */
  discountPercent?: number
  /**
   * Exemption reason when the line carries no VAT (Moloni — mutually exclusive
   * with tax entries per INTEGRATION_NOTES_MOLONI.md §5).
   */
  exemptionReason?: string | null
  /** Line taxable base in cents (InvoiceXpress). Negative on credit notes. */
  subtotalCents?: number
  /** Line VAT amount in cents (InvoiceXpress). Negative on credit notes. */
  taxAmountCents?: number
  /** Line discount in cents (InvoiceXpress). */
  discountAmountCents?: number
  /** Line VAT rate in permil (InvoiceXpress: 23% → 230). */
  ratePermil?: number
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
 * All monetary values are integers in cents; floats never cross this boundary.
 */
export interface SourceDocument {
  /** Stable identifier in the source system (e.g. Moloni document_id). */
  externalId: string
  /** Document type code as reported by the source (e.g. SAF-T "FT", "Invoice"). */
  documentType: string
  /** Document series name (e.g. Moloni document_set name, IVX series prefix). */
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

  // ── Source-specific enrichments (optional) ──────────────────────────────

  /** Source status string (e.g. IVX "sent"/"settled"/"final"). */
  documentStatus?: string
  /** Raw combined series/number as reported (e.g. IVX "A/28"). */
  sequenceNumber?: string
  /** ATCUD code when present (IVX). */
  atcud?: string | null
  /** Due date, ISO 8601, when present (IVX). */
  dueDate?: string | null
  /**
   * Customer id in the source system, used to resolve the NIF out-of-band
   * (InvoiceXpress exposes the NIF only on GET /clients/{id}, not on document
   * responses — see the pull job's NIF enrichment).
   */
  customerExternalId?: string | null
  /** Taxable base before VAT, in cents (IVX). */
  beforeTaxesCents?: number
  /** Total VAT, in cents (IVX). */
  taxesCents?: number
  /**
   * IRS withholding in cents when the document carries a non-zero retention
   * (InvoiceXpress). Derived from the retention percentage with integer
   * arithmetic. Null / absent when the document has no retention.
   */
  withholdingCents?: number | null
  /** Raw retention percentage string from the source (e.g. "25.0"), if any. */
  retentionPercentRaw?: string | null
  /** Raw currency string exactly as returned (e.g. "Euro"). */
  currencyRaw?: string
  /** Permalink to the document in the source UI, when present. */
  permalink?: string | null
}

/**
 * Contract every document source connector implements.
 *
 * `listIssuedDocuments` never returns drafts — only documents actually issued
 * in the source system — and yields one page per call. Pass the previous
 * page's `nextCursor` to resume; omit it for the first page.
 */
export interface DocumentSourceConnector {
  listIssuedDocuments(cursor?: string): Promise<Page<SourceDocument>>

  /**
   * Downloads the official PDF for a previously listed document.
   * Returns null when the source has no PDF for that reference
   * (e.g. drafts, unknown ids). Optional: not every source exposes PDFs.
   */
  fetchPdf?(externalId: string): Promise<Buffer | null>
}
