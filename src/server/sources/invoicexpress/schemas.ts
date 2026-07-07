import { z } from 'zod'

/**
 * Strict zod contracts derived 1:1 from the saved official docs
 * (`integrations/invoicexpress/docs/openapi.yaml`, schemas
 * `InvoiceListAllResponse`, `Pagination`, `PdfResponse`, `202`, `401`).
 *
 * `.strict()` rejects undocumented fields on purpose: the connector is
 * doc-driven and has never seen the real API, so any extra field is a signal
 * that the contract needs revisiting (INTEGRATION_NOTES_IVX.md). Fields the
 * doc marks as examples-only (no `required` list exists in the spec) are
 * optional except the ones the connector cannot work without.
 */

/** `items[].tax` — { id?, name?, value } (`InvoiceListAllResponse`). */
export const listItemTaxSchema = z
  .object({
    id: z.number().int().optional(),
    name: z.string().optional(),
    value: z.number(),
  })
  .strict()

/** List response item — amounts are numbers; unit_price/quantity are STRINGS. */
export const listItemSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    unit_price: z.string(),
    unit: z.string().optional(),
    quantity: z.string(),
    discount: z.number().optional(),
    subtotal: z.number(),
    tax_amount: z.number(),
    discount_amount: z.number().optional(),
    total: z.number().optional(),
    tax: listItemTaxSchema.optional(),
  })
  .strict()

/** `invoices[].client` — { id, name, country } in list responses (no fiscal_id). */
export const listClientSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    country: z.string().optional(),
  })
  .strict()

/** One entry of `invoices[]` in `GET /invoices.json` (`InvoiceListAllResponse`). */
export const listInvoiceSchema = z
  .object({
    id: z.number().int(),
    status: z.string(),
    archived: z.boolean().optional(),
    type: z.string(),
    sequence_number: z.string(),
    inverted_sequence_number: z.string().optional(),
    atcud: z.string().optional(),
    date: z.string(),
    due_date: z.string().optional(),
    reference: z.string().optional(),
    observations: z.string().optional(),
    retention: z.string().optional(),
    permalink: z.string().optional(),
    saft_hash: z.string().optional(),
    sum: z.number(),
    discount: z.number().optional(),
    before_taxes: z.number(),
    taxes: z.number(),
    total: z.number(),
    currency: z.string(),
    sequence_id: z.string().optional(),
    tax_exemption: z.string().optional(),
    client: listClientSchema,
    items: z.array(listItemSchema),
  })
  .strict()

/** `Pagination` schema from the saved docs. */
export const paginationSchema = z
  .object({
    total_entries: z.number().int(),
    per_page: z.number().int(),
    current_page: z.number().int(),
    total_pages: z.number().int(),
  })
  .strict()

/** Full `GET /invoices.json` 200 body (`InvoiceListAllResponse`). */
export const listInvoicesResponseSchema = z
  .object({
    invoices: z.array(listInvoiceSchema),
    pagination: paginationSchema,
  })
  .strict()

/** Documented error envelope (`401` schema): { errors: { error } }. */
export const errorResponseSchema = z
  .object({
    errors: z.object({ error: z.string() }).strict(),
  })
  .strict()

/** `PdfResponse` — 200 of `GET /api/pdf/{document-id}.json`. */
export const pdfResponseSchema = z
  .object({
    output: z.object({ pdfUrl: z.string() }).strict(),
  })
  .strict()

/** `202` schema — PDF still being generated, keep polling. */
export const pdfAcceptedSchema = z
  .object({
    accepted: z.object({ code: z.string(), message: z.string() }).strict(),
  })
  .strict()

export type ListInvoice = z.infer<typeof listInvoiceSchema>
export type ListInvoicesResponse = z.infer<typeof listInvoicesResponseSchema>
