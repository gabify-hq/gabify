import { amountToCents, percentToPermil, percentToWithholdingCents } from './money'
import type { ListInvoice } from './schemas'
import type { SourceDocument, SourceDocumentLine, VatBreakdownEntry } from '../types'

/**
 * Maps one entry of `GET /invoices.json` to the unified `SourceDocument` DTO
 * (`src/server/sources/types.ts`). All amounts are converted to integer cents
 * at this boundary and VAT rates to permil; credit notes get a negative sign on
 * every monetary field (the API returns them positive).
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

/**
 * Splits a `sequence_number` like "A/28" into the contract's `series` + `number`.
 * The InvoiceXpress format is `<series>/<number>`; when the number part is not
 * an integer the whole string is kept as the series and number falls back to 0.
 */
export function splitSequenceNumber(sequenceNumber: string): { series: string; number: number } {
  const slash = sequenceNumber.lastIndexOf('/')
  if (slash >= 0) {
    const tail = sequenceNumber.slice(slash + 1)
    if (/^\d+$/.test(tail)) {
      return { series: sequenceNumber.slice(0, slash), number: Number(tail) }
    }
  }
  return { series: sequenceNumber, number: 0 }
}

function mapLines(invoice: ListInvoice, sign: 1 | -1): SourceDocumentLine[] {
  return invoice.items.map((item) => ({
    description: item.description ?? item.name ?? '',
    quantity: Number(item.quantity),
    subtotalCents: sign * amountToCents(item.subtotal),
    taxAmountCents: sign * amountToCents(item.tax_amount),
    discountAmountCents: sign * amountToCents(item.discount_amount ?? 0),
    ratePermil: percentToPermil(item.tax?.value ?? 0),
  }))
}

function buildVatBreakdown(lines: SourceDocumentLine[]): VatBreakdownEntry[] {
  const byRate = new Map<number, VatBreakdownEntry>()
  for (const line of lines) {
    const ratePermil = line.ratePermil ?? 0
    const entry = byRate.get(ratePermil) ?? { ratePermil, baseCents: 0, amountCents: 0 }
    byRate.set(ratePermil, {
      ratePermil,
      baseCents: entry.baseCents + (line.subtotalCents ?? 0),
      amountCents: entry.amountCents + (line.taxAmountCents ?? 0),
    })
  }
  return [...byRate.values()].sort((a, b) => a.ratePermil - b.ratePermil)
}

export function mapListInvoiceToSourceDocument(
  invoice: ListInvoice | Record<string, unknown>,
): SourceDocument {
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
  const { series, number } = splitSequenceNumber(doc.sequence_number)

  return {
    externalId: String(doc.id),
    documentType: doc.type,
    series,
    number,
    sequenceNumber: doc.sequence_number,
    documentStatus: doc.status,
    atcud: doc.atcud && doc.atcud !== '' ? doc.atcud : null,
    issueDate: toIsoDate(doc.date),
    dueDate: doc.due_date ? toIsoDate(doc.due_date) : null,
    customerName: doc.client.name,
    customerVat: null, // not exposed on document responses — resolved by the pull job
    customerExternalId: String(doc.client.id),
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
    raw: invoice,
  }
}
