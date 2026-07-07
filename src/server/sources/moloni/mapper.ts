/**
 * Maps a Moloni documents/getOne response to the provider-neutral
 * SourceDocument DTO. All floats are converted to cents here, at the
 * boundary (see money.ts); aggregation sums integers only.
 *
 * Field semantics come from integrations/moloni/docs/documents_documents_getone.md
 * and the decisions in INTEGRATION_NOTES_MOLONI.md §§5–6.
 */
import type { SourceDocument, SourceDocumentLine, VatBreakdownEntry } from '../types'
import type { MoloniDocumentDetail } from './schemas'
import { decimalToCents, percentToPermil } from './money'

const DOCUMENT_CURRENCY = 'EUR' // see INTEGRATION_NOTES_MOLONI.md §6

function mapLines(detail: MoloniDocumentDetail): SourceDocumentLine[] {
  return detail.products.map((product) => ({
    description: product.name,
    quantity: product.qty,
    unitPriceCents: decimalToCents(product.price),
    discountPercent: product.discount,
    exemptionReason: product.exemption_reason === '' ? null : product.exemption_reason,
  }))
}

function buildVatBreakdown(detail: MoloniDocumentDetail): VatBreakdownEntry[] {
  const byRate = new Map<number, { baseCents: number; amountCents: number }>()
  for (const product of detail.products) {
    for (const tax of product.taxes) {
      const ratePermil = percentToPermil(tax.value)
      const entry = byRate.get(ratePermil) ?? { baseCents: 0, amountCents: 0 }
      byRate.set(ratePermil, {
        baseCents: entry.baseCents + decimalToCents(tax.incidence_value),
        amountCents: entry.amountCents + decimalToCents(tax.total_value),
      })
    }
  }
  return [...byRate.entries()]
    .map(([ratePermil, totals]) => ({ ratePermil, ...totals }))
    .sort((a, b) => a.ratePermil - b.ratePermil)
}

export function mapMoloniDocument(detail: MoloniDocumentDetail): SourceDocument {
  return {
    externalId: String(detail.document_id),
    documentType: detail.document_type.saft_code,
    series: detail.document_set.name,
    number: detail.number,
    issueDate: detail.date.slice(0, 10),
    customerName: detail.entity_name,
    customerVat: detail.entity_vat === '' ? null : detail.entity_vat,
    lines: mapLines(detail),
    vatBreakdownCents: buildVatBreakdown(detail),
    totalCents: decimalToCents(detail.net_value),
    currency: DOCUMENT_CURRENCY,
    raw: detail,
  }
}
