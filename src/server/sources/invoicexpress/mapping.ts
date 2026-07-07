import { amountToCents, percentToWithholdingCents } from './money'
import type { ListInvoice } from './schemas'
import type {
  InvoicexpressDocumentStatus,
  InvoicexpressDocumentType,
  InvoicexpressSourceDocument,
  SourceDocumentLine,
  VatBreakdownEntry,
} from './types-local'

/**
 * Maps one entry of `GET /invoices.json` to the local SourceDocument DTO.
 * All amounts converted to integer cents at this boundary; credit notes get a
 * negative sign on every monetary field (the API returns them positive).
 */

const DOCUMENT_TYPES: ReadonlySet<string> = new Set([
  'Invoice',
  'InvoiceReceipt',
  'CreditNote',
  'DebitNote',
  'Receipt',
  'CashInvoice',
])

const DOCUMENT_STATUSES: ReadonlySet<string> = new Set([
  'draft',
  'final',
  'sent',
  'settled',
  'canceled',
  'second_copy',
  'deleted',
])

const CURRENCY_MAP: Readonly<Record<string, string>> = {
  Euro: 'EUR',
}

/** dd/mm/yyyy (doc format) → ISO yyyy-mm-dd. */
export function toIsoDate(ddmmyyyy: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ddmmyyyy.trim())
  if (!match) {
    throw new Error(`Invalid dd/mm/yyyy date from API: "${ddmmyyyy}"`)
  }
  return `${match[3]}-${match[2]}-${match[1]}`
}

/** ISO yyyy-mm-dd → dd/mm/yyyy (for the documented date[from|to] filters). */
export function toApiDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim())
  if (!match) {
    throw new Error(`Invalid ISO date for API filter: "${isoDate}"`)
  }
  return `${match[3]}/${match[2]}/${match[1]}`
}

function mapLines(invoice: ListInvoice, sign: 1 | -1): SourceDocumentLine[] {
  return invoice.items.map((item) => ({
    name: item.name ?? null,
    description: item.description ?? null,
    quantityRaw: item.quantity,
    unitPriceRaw: item.unit_price,
    subtotalCents: sign * amountToCents(item.subtotal),
    taxAmountCents: sign * amountToCents(item.tax_amount),
    discountAmountCents: sign * amountToCents(item.discount_amount ?? 0),
    taxRate: item.tax?.value ?? 0,
  }))
}

function buildVatBreakdown(lines: SourceDocumentLine[]): VatBreakdownEntry[] {
  const byRate = new Map<number, VatBreakdownEntry>()
  for (const line of lines) {
    const entry = byRate.get(line.taxRate) ?? {
      rate: line.taxRate,
      baseCents: 0,
      amountCents: 0,
    }
    byRate.set(line.taxRate, {
      rate: entry.rate,
      baseCents: entry.baseCents + line.subtotalCents,
      amountCents: entry.amountCents + line.taxAmountCents,
    })
  }
  return [...byRate.values()].sort((a, b) => a.rate - b.rate)
}

export function mapListInvoiceToSourceDocument(
  invoice: ListInvoice | Record<string, unknown>,
): InvoicexpressSourceDocument {
  const doc = invoice as ListInvoice

  if (!DOCUMENT_TYPES.has(doc.type)) {
    throw new Error(`Undocumented document type from API: "${doc.type}" (id ${doc.id})`)
  }
  if (!DOCUMENT_STATUSES.has(doc.status)) {
    throw new Error(`Undocumented document status from API: "${doc.status}" (id ${doc.id})`)
  }

  const sign: 1 | -1 = doc.type === 'CreditNote' ? -1 : 1
  const lines = mapLines(doc, sign)
  const beforeTaxesCents = sign * amountToCents(doc.before_taxes)
  const retention = doc.retention ?? null
  const withholdingCents = percentToWithholdingCents(beforeTaxesCents, retention)

  return {
    externalId: String(doc.id),
    type: doc.type as InvoicexpressDocumentType,
    status: doc.status as InvoicexpressDocumentStatus,
    sequenceNumber: doc.sequence_number,
    atcud: doc.atcud && doc.atcud !== '' ? doc.atcud : null,
    date: toIsoDate(doc.date),
    dueDate: doc.due_date ? toIsoDate(doc.due_date) : null,
    clientName: doc.client.name,
    clientNif: null, // not exposed on document responses — see INTEGRATION_NOTES_IVX.md
    clientExternalId: String(doc.client.id),
    lines,
    vatBreakdownCents: buildVatBreakdown(lines),
    beforeTaxesCents,
    taxesCents: sign * amountToCents(doc.taxes),
    totalCents: sign * amountToCents(doc.total),
    withholdingCents,
    retentionPercentRaw: withholdingCents !== null ? retention : null,
    currency: CURRENCY_MAP[doc.currency] ?? doc.currency,
    currencyRaw: doc.currency,
    permalink: doc.permalink ?? null,
    raw: invoice as Record<string, unknown>,
  }
}
