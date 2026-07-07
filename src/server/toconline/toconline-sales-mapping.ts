import { centsFromUnknown } from '@/lib/money'

/**
 * Pure mapping of the documented TOConline sales-document header/line
 * attributes into our house shape (integer cents). Extracted from
 * toconline-pull-service so both the pull service and the
 * DocumentSourceConnector adapter (toconline-source-connector) can share it
 * without a circular import. Behaviour is unchanged — this is a pure move.
 */

export interface VatBand {
  region?: string
  rate: number
  baseCents: number
  vatCents: number
}

export interface MappedSalesDocument {
  toconlineId: string
  documentNumber: string
  documentType: string
  issueDate: Date | null
  dueDate: Date | null
  currency: string
  totalCents: number
  netCents: number
  vatCents: number
  withholdingCents: number
  buyerName: string | null
  buyerNif: string | null
  vatBreakdown: VatBand[]
  externalReference: string | null
}

export function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

export function dateAtUtcNoon(value: unknown): Date | null {
  const s = str(value)
  if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null
  return new Date(`${s.slice(0, 10)}T12:00:00.000Z`)
}

/**
 * Pure mapping of the documented sales-document header attributes
 * (docs/apis_versoes-anteriores_vendas_documentos-de-venda.md response
 * example) into our shape. VAT bands come from the per-rate header fields
 * vat_incidence_{ise,red,int,nor} / vat_total_* / vat_percentage_* — euros
 * converted to integer cents HERE and nowhere else.
 */
export function mapSalesDocumentAttributes(
  toconlineId: string,
  attrs: Record<string, unknown>,
): MappedSalesDocument {
  const region = str(attrs.customer_tax_country_region) ?? str(attrs.operation_country) ?? 'PT'

  const bands: VatBand[] = []
  const bandSpecs = [
    { incidence: 'vat_incidence_ise', total: null, percentage: null, fixedRate: 0 },
    { incidence: 'vat_incidence_red', total: 'vat_total_red', percentage: 'vat_percentage_red' },
    { incidence: 'vat_incidence_int', total: 'vat_total_int', percentage: 'vat_percentage_int' },
    { incidence: 'vat_incidence_nor', total: 'vat_total_nor', percentage: 'vat_percentage_nor' },
  ] as const
  for (const spec of bandSpecs) {
    const baseCents = centsFromUnknown(attrs[spec.incidence]) ?? 0
    if (baseCents === 0) continue
    const vatCents = spec.total ? (centsFromUnknown(attrs[spec.total]) ?? 0) : 0
    const rate =
      'fixedRate' in spec
        ? spec.fixedRate
        : ((): number => {
            const p = attrs[spec.percentage as string]
            const n = typeof p === 'number' ? p : Number(str(p) ?? NaN)
            return Number.isFinite(n) ? n : 0
          })()
    bands.push({ region, rate, baseCents, vatCents })
  }

  return {
    toconlineId,
    documentNumber: str(attrs.document_no) ?? `TOC-${toconlineId}`,
    documentType: str(attrs.document_type) ?? 'FT',
    issueDate: dateAtUtcNoon(attrs.date),
    dueDate: dateAtUtcNoon(attrs.due_date),
    currency: str(attrs.currency_iso_code) ?? 'EUR',
    totalCents: centsFromUnknown(attrs.gross_total) ?? 0,
    netCents: centsFromUnknown(attrs.net_total) ?? 0,
    vatCents: centsFromUnknown(attrs.tax_payable) ?? 0,
    withholdingCents: centsFromUnknown(attrs.retention_value) ?? 0,
    buyerName: str(attrs.customer_business_name),
    buyerNif: str(attrs.customer_tax_registration_number),
    vatBreakdown: bands,
    externalReference: str(attrs.external_reference),
  }
}

/** Line attributes (documented table) → house convention (integer cents). */
export function mapSalesDocumentLines(
  lines: Array<Record<string, unknown>>,
): Array<{ description: string; qty: number; unitPriceCents: number; vatRate: number; totalCents: number }> {
  return lines.map((line) => {
    const qty = typeof line.quantity === 'number' ? line.quantity : Number(str(line.quantity) ?? 1)
    const rate =
      typeof line.tax_percentage === 'number'
        ? line.tax_percentage
        : Number(str(line.tax_percentage) ?? 0)
    return {
      description: str(line.description) ?? '',
      qty: Number.isFinite(qty) ? qty : 1,
      unitPriceCents: centsFromUnknown(line.unit_price) ?? 0,
      vatRate: Number.isFinite(rate) ? rate : 0,
      totalCents: centsFromUnknown(line.amount) ?? 0,
    }
  })
}
