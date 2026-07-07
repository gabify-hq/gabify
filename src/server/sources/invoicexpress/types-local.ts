/**
 * Local DTO contract for the InvoiceXpress source connector.
 *
 * DELIBERATE DUPLICATION: this file intentionally duplicates the concept of
 * `SourceDocument` that also exists in `src/server/sources/types.ts` (owned by
 * the Moloni connector work happening in parallel). The two contracts will be
 * unified in a dedicated post-merge slice (see HANDOFF_IVX.md §"DTO
 * unification"). Do NOT import from `src/server/sources/types.ts` here and do
 * NOT export these types from there — the files must stay independent until
 * both branches are merged.
 *
 * Every field below maps 1:1 to a field documented in
 * `integrations/invoicexpress/docs/` (see README.md there). Nothing is
 * invented; fields the API does not expose on document responses (e.g. the
 * client's fiscal_id/NIF) are explicitly nullable and documented.
 */

/**
 * Sale document types returned by `GET /invoices.json` (`type[]` filter enum in
 * the saved `QueryParamns` schema). `SimplifiedInvoice` exists as a creation
 * path (`simplified_invoices`) but is NOT part of the documented list filter
 * enum — see INTEGRATION_NOTES_IVX.md.
 */
export type InvoicexpressDocumentType =
  | 'Invoice'
  | 'InvoiceReceipt'
  | 'CreditNote'
  | 'DebitNote'
  | 'Receipt'
  | 'CashInvoice'

/**
 * Document statuses (`status[]` filter enum in the saved docs). The response
 * examples additionally show `"final"`, which is not part of the filter enum —
 * treated as finalized (see INTEGRATION_NOTES_IVX.md).
 */
export type InvoicexpressDocumentStatus =
  | 'draft'
  | 'final'
  | 'sent'
  | 'settled'
  | 'canceled'
  | 'second_copy'
  | 'deleted'

/** One VAT rate bucket, aggregated from the document line items. */
export interface VatBreakdownEntry {
  /** VAT rate in percent (e.g. 23 for IVA23) — `items[].tax.value` in the doc. */
  rate: number
  /** Sum of item subtotals at this rate, in cents. Negative for credit notes. */
  baseCents: number
  /** Sum of item tax_amount at this rate, in cents. Negative for credit notes. */
  amountCents: number
}

/** One document line, converted to cents at the boundary. */
export interface SourceDocumentLine {
  /** `items[].name` (may be absent in doc examples). */
  name: string | null
  /** `items[].description`. */
  description: string | null
  /** `items[].quantity` as returned by the API (string in list responses). */
  quantityRaw: string
  /** `items[].unit_price` as returned by the API (string in list responses). */
  unitPriceRaw: string
  /** `items[].subtotal` in cents. Negative for credit notes. */
  subtotalCents: number
  /** `items[].tax_amount` in cents. Negative for credit notes. */
  taxAmountCents: number
  /** `items[].discount_amount` in cents (0 when absent). */
  discountAmountCents: number
  /** `items[].tax.value` — VAT rate in percent. */
  taxRate: number
}

/**
 * A finalized sale document pulled from InvoiceXpress, normalized for Gabify.
 * All monetary values are integer cents (never floats). For credit notes every
 * monetary field carries a NEGATIVE sign.
 */
export interface InvoicexpressSourceDocument {
  /**
   * Document id as string. `GET /api/pdf/{document-id}.json` takes only the id
   * (no type), so ids are unique across document types within an account.
   */
  externalId: string
  type: InvoicexpressDocumentType
  status: InvoicexpressDocumentStatus
  /** `sequence_number`, e.g. "A/28" (series/number). */
  sequenceNumber: string
  /** `atcud` when present. */
  atcud: string | null
  /** Document date converted from dd/mm/yyyy to ISO yyyy-mm-dd. */
  date: string
  /** Due date converted from dd/mm/yyyy to ISO yyyy-mm-dd, when present. */
  dueDate: string | null
  /** `client.name`. */
  clientName: string
  /**
   * Always null in v1: document responses expose no fiscal_id — the NIF only
   * exists on `GET /clients/{client-id}.json` (out of scope for this slice).
   */
  clientNif: string | null
  /** `client.id` — needed later to resolve the NIF via the clients endpoint. */
  clientExternalId: string | null
  lines: SourceDocumentLine[]
  vatBreakdownCents: VatBreakdownEntry[]
  /** `before_taxes` in cents. */
  beforeTaxesCents: number
  /** `taxes` in cents. */
  taxesCents: number
  /** `total` in cents (before IRS retention — see INTEGRATION_NOTES_IVX.md). */
  totalCents: number
  /**
   * IRS withholding in cents, derived as round(before_taxes × retention%) with
   * integer arithmetic. Present only when the document carries a non-zero
   * `retention`. DERIVED VALUE — the API only exposes the percentage string,
   * never the amount (INTEGRATION_NOTES_IVX.md).
   */
  withholdingCents: number | null
  /** Raw `retention` percentage string from the API (e.g. "25.0"), if any. */
  retentionPercentRaw: string | null
  /** ISO 4217 when mappable ("Euro" → "EUR"), otherwise the raw API string. */
  currency: string
  /** Raw `currency` string exactly as returned (e.g. "Euro"). */
  currencyRaw: string
  /** `permalink` to the document in the InvoiceXpress UI, when present. */
  permalink: string | null
  /**
   * Original list-item JSON as returned by the API. Never contains the request
   * URL, therefore never contains the api_key (enforced by tests).
   */
  raw: Record<string, unknown>
}

/** Resumable cursor for `listIssuedDocuments`. */
export interface ListCursor {
  /** Next page to request, or null when the listing is complete. */
  nextPage: number | null
  /** Total pages reported by the API pagination block. */
  totalPages: number
}

export interface ListIssuedDocumentsResult {
  documents: InvoicexpressSourceDocument[]
  cursor: ListCursor
}
