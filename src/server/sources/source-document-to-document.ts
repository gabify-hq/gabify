/**
 * Pure mapping of a provider-neutral `SourceDocument` (unified connector
 * contract) into a Prisma `Document` create payload for an API_PULL import.
 *
 * Shared by every source pull job (Moloni, InvoiceXpress, …) so the invariants
 * live in ONE place:
 *  - source API_PULL, type INVOICE_ISSUED, status PRE_VALIDATED, confidence 1.0
 *    (API-exact data — the AI pipeline is NEVER invoked on these);
 *  - money stays in integer cents until the boundary, then Decimal strings for
 *    the `@db.Decimal` columns and integer cents inside JSONB (house rule A1);
 *  - VAT rate is permil in the contract → percent (rate/10) in the stored
 *    `vatBreakdown` band, matching the TOConline pull shape
 *    `[{region, rate, baseCents, vatCents}]`.
 */
import type { Prisma } from '@prisma/client'
import { decimalStringFromCents } from '@/lib/money'
import type { SourceDocument, SourceDocumentLine } from './types'

/** ISO YYYY-MM-DD → Date at 12:00 UTC (house convention — avoids TZ drift). */
function dateAtUtcNoon(iso: string | null | undefined): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null
  return new Date(`${iso.slice(0, 10)}T12:00:00.000Z`)
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0)
}

function documentNumberOf(doc: SourceDocument): string {
  if (doc.sequenceNumber && doc.sequenceNumber.trim() !== '') return doc.sequenceNumber
  return `${doc.series}/${doc.number}`
}

/** Stored VAT band: percent rate + integer cents (matches the TOConline pull). */
function toStoredVatBreakdown(doc: SourceDocument): Array<{
  region: string
  rate: number
  baseCents: number
  vatCents: number
}> {
  return doc.vatBreakdownCents.map((band) => ({
    region: 'PT',
    rate: band.ratePermil / 10,
    baseCents: band.baseCents,
    vatCents: band.amountCents,
  }))
}

/** Stored line convention: {description, qty, unitPriceCents, vatRate, totalCents}. */
function toStoredLines(lines: SourceDocumentLine[]): Array<{
  description: string
  qty: number
  unitPriceCents: number
  vatRate: number
  totalCents: number
}> {
  return lines.map((line) => {
    const unitPriceCents = line.unitPriceCents ?? line.subtotalCents ?? 0
    const totalCents =
      line.subtotalCents !== undefined || line.taxAmountCents !== undefined
        ? (line.subtotalCents ?? 0) + (line.taxAmountCents ?? 0)
        : unitPriceCents
    return {
      description: line.description,
      qty: line.quantity,
      unitPriceCents,
      vatRate: line.ratePermil !== undefined ? line.ratePermil / 10 : 0,
      totalCents,
    }
  })
}

export interface SourceDocumentPersistenceContext {
  officeId: string
  clientId: string
  /** classificationSource tag, e.g. "moloni-pull" | "invoicexpress-pull". */
  classificationSource: string
  /** Enriched buyer NIF (Moloni carries it inline; IVX resolves it out-of-band). */
  buyerNif: string | null
}

/**
 * Builds the Document create payload. `netCents`/`vatCents` fall back to the sum
 * of the VAT bands when the source does not report explicit totals (Moloni),
 * and use the reported figures when it does (InvoiceXpress).
 */
export function buildDocumentFromSource(
  doc: SourceDocument,
  ctx: SourceDocumentPersistenceContext,
): Prisma.DocumentUncheckedCreateInput {
  const netCents = doc.beforeTaxesCents ?? sum(doc.vatBreakdownCents.map((b) => b.baseCents))
  const vatCents = doc.taxesCents ?? sum(doc.vatBreakdownCents.map((b) => b.amountCents))
  const withholdingCents = doc.withholdingCents ?? 0
  const documentNumber = documentNumberOf(doc)

  return {
    officeId: ctx.officeId,
    clientId: ctx.clientId,
    source: 'API_PULL',
    type: 'INVOICE_ISSUED',
    status: 'PRE_VALIDATED',
    confidence: 1.0, // API-exact data — no extraction uncertainty
    extractionSource: 'API_PULL',
    classificationSource: ctx.classificationSource,
    documentNumber,
    issueDate: dateAtUtcNoon(doc.issueDate),
    dueDate: dateAtUtcNoon(doc.dueDate),
    currency: doc.currency,
    totalAmount: decimalStringFromCents(doc.totalCents),
    netAmount: decimalStringFromCents(netCents),
    vatAmount: decimalStringFromCents(vatCents),
    withholdingAmount: withholdingCents > 0 ? decimalStringFromCents(withholdingCents) : null,
    // Issued invoices: the client company is the ISSUER; the counterparty is the
    // final customer (buyer). Supplier fields stay null (QR/push semantics).
    buyerName: doc.customerName,
    buyerNif: ctx.buyerNif,
    supplierName: null,
    supplierNif: null,
    atcud: doc.atcud ?? null,
    vatBreakdown: toStoredVatBreakdown(doc) as unknown as Prisma.InputJsonValue,
    documentLines: toStoredLines(doc.lines) as unknown as Prisma.InputJsonValue,
    originalFilename: `${documentNumber.replace(/[\\/:*?"<>|]+/g, '-')}.pdf`,
  }
}
