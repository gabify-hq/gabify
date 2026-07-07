/**
 * Mock API responses for the InvoiceXpress connector test suites.
 *
 * Shapes are copied from the saved official docs
 * (`integrations/invoicexpress/docs/listinvoices.md` and `openapi.yaml`,
 * schemas `InvoiceListAllResponse`, `Pagination`, `PdfResponse`, `401`):
 * same field names, same types (amounts as JSON numbers, list-item
 * `unit_price`/`quantity` as strings, `retention` as string, dates dd/mm/yyyy,
 * currency "Euro"). Only the concrete values vary to cover the [INV] cases.
 */

export const TEST_ACCOUNT_NAME = 'demo-firm'
export const TEST_API_KEY = 'sk-live-SUPER-SECRET-0123456789abcdef'

/**
 * [INV] Invoice with IVA 23% + IRS retention 25% (freelancer case).
 * base 1000.00 → VAT 230.00 → total 1230.00; retention 25% of base = 250.00.
 */
export const invoiceWithRetention = {
  id: 900001,
  status: 'final',
  archived: false,
  type: 'Invoice',
  sequence_number: 'A/28',
  inverted_sequence_number: 'A/28',
  atcud: 'ABCD1234-28',
  date: '27/06/2026',
  due_date: '27/07/2026',
  reference: 'fb30',
  observations: 'Serviços de consultoria — condições habituais',
  retention: '25.0',
  permalink:
    'https://www.app.invoicexpress.com/documents/900001e1ab2ebd5c06def40c346ffbe0ff2b463eb1c0f0',
  saft_hash: 'Tdik',
  sum: 1000.0,
  discount: 0,
  before_taxes: 1000.0,
  taxes: 230.0,
  total: 1230.0,
  currency: 'Euro',
  sequence_id: '12345',
  tax_exemption: '',
  client: { id: 1310176, name: 'João Camões & Associados', country: 'Portugal' },
  items: [
    {
      name: 'Consultoria',
      description: 'Avença mensal de consultoria fiscal',
      unit_price: '1000.0',
      unit: 'service',
      quantity: '1.0',
      discount: 0,
      subtotal: 1000.0,
      tax_amount: 230.0,
      discount_amount: 0,
      total: 1230.0,
      tax: { id: 31597, name: 'IVA23', value: 23 },
    },
  ],
}

/**
 * [INV] Credit note — all monetary values must come out NEGATIVE in cents.
 * base 50.00 → VAT 11.50 → total 61.50.
 */
export const creditNote = {
  id: 900002,
  status: 'settled',
  archived: false,
  type: 'CreditNote',
  sequence_number: 'NC/3',
  inverted_sequence_number: '3/NC',
  atcud: 'EFGH5678-3',
  date: '28/06/2026',
  due_date: '28/06/2026',
  reference: '',
  observations: 'Anulação parcial da fatura A/28',
  retention: '0',
  permalink:
    'https://www.app.invoicexpress.com/documents/900002e1ab2ebd5c06def40c346ffbe0ff2b463eb1c0f0',
  saft_hash: 'J4ay',
  sum: 50.0,
  discount: 0,
  before_taxes: 50.0,
  taxes: 11.5,
  total: 61.5,
  currency: 'Euro',
  sequence_id: '12346',
  tax_exemption: '',
  client: { id: 1310176, name: 'João Camões & Associados', country: 'Portugal' },
  items: [
    {
      name: 'Consultoria',
      description: 'Estorno de horas não prestadas',
      unit_price: '50.0',
      unit: 'service',
      quantity: '1.0',
      discount: 0,
      subtotal: 50.0,
      tax_amount: 11.5,
      discount_amount: 0,
      total: 61.5,
      tax: { id: 31597, name: 'IVA23', value: 23 },
    },
  ],
}

/** [INV] Draft — must NEVER be returned by the connector. */
export const draftInvoice = {
  id: 900003,
  status: 'draft',
  archived: false,
  type: 'Invoice',
  sequence_number: 'rascunho',
  inverted_sequence_number: 'rascunho',
  atcud: '',
  date: '29/06/2026',
  due_date: '29/07/2026',
  reference: '',
  observations: '',
  retention: '0',
  permalink:
    'https://www.app.invoicexpress.com/documents/900003e1ab2ebd5c06def40c346ffbe0ff2b463eb1c0f0',
  saft_hash: '',
  sum: 10.0,
  discount: 0,
  before_taxes: 10.0,
  taxes: 2.3,
  total: 12.3,
  currency: 'Euro',
  sequence_id: '12347',
  tax_exemption: '',
  client: { id: 22, name: 'Cliente Rascunho', country: 'Portugal' },
  items: [],
}

/**
 * [INV] Invoice-receipt with two VAT rates (23% + 6%) and the 19.99 boundary
 * case: 19.99 @ 23% → 4.60 VAT (as the API rounds); 100.00 @ 6% → 6.00 VAT.
 * before_taxes 119.99, taxes 10.60, total 130.59.
 */
export const multiRateInvoiceReceipt = {
  id: 900004,
  status: 'sent',
  archived: false,
  type: 'InvoiceReceipt',
  sequence_number: 'FR/7',
  inverted_sequence_number: '7/FR',
  atcud: 'IJKL9012-7',
  date: '30/06/2026',
  due_date: '30/06/2026',
  reference: '',
  observations: 'Pagamento à cobrança',
  retention: '0',
  permalink:
    'https://www.app.invoicexpress.com/documents/900004e1ab2ebd5c06def40c346ffbe0ff2b463eb1c0f0',
  saft_hash: 'Qz8p',
  sum: 119.99,
  discount: 0,
  before_taxes: 119.99,
  taxes: 10.6,
  total: 130.59,
  currency: 'Euro',
  sequence_id: '12348',
  tax_exemption: '',
  client: { id: 44, name: 'Padaria São João, Lda.', country: 'Portugal' },
  items: [
    {
      name: 'Licença software',
      description: 'Licença anual — módulo faturação',
      unit_price: '19.99',
      unit: 'unit',
      quantity: '1.0',
      discount: 0,
      subtotal: 19.99,
      tax_amount: 4.6,
      discount_amount: 0,
      total: 24.59,
      tax: { id: 31597, name: 'IVA23', value: 23 },
    },
    {
      name: 'Pão ração',
      description: 'Fornecimento mensal — taxa reduzida',
      unit_price: '100.0',
      unit: 'unit',
      quantity: '1.0',
      discount: 0,
      subtotal: 100.0,
      tax_amount: 6.0,
      discount_amount: 0,
      total: 106.0,
      tax: { id: 31598, name: 'IVA6', value: 6 },
    },
  ],
}

/** Pagination blocks copied from the doc's `Pagination` schema shape. */
export const listPage1 = {
  invoices: [invoiceWithRetention, creditNote, draftInvoice],
  pagination: { total_entries: 5, per_page: 3, current_page: 1, total_pages: 2 },
}

/**
 * Page 2 repeats the credit note (id 900002) on purpose — the connector must
 * deduplicate by externalId across pages.
 */
export const listPage2 = {
  invoices: [creditNote, multiRateInvoiceReceipt],
  pagination: { total_entries: 5, per_page: 3, current_page: 2, total_pages: 2 },
}

/** `401` schema from the saved docs. */
export const unauthorizedResponse = { errors: { error: 'Invalid API key' } }

/** `PdfResponse` schema from the saved docs. */
export const pdfReadyResponse = {
  output: { pdfUrl: 'https://invoicexpress-files.example/documents/900001.pdf' },
}

/** Bytes the mocked pre-signed PDF URL serves (the connector returns a Buffer). */
export const PDF_BYTES = '%PDF-1.4 fake-invoicexpress-pdf'

/** `202` schema from the saved docs. */
export const pdfAcceptedResponse = {
  accepted: {
    code: '202',
    message:
      'The request will be processed. You need to keep requesting until you get a response with HTTP status code 200.',
  },
}

/** Helper: JSON Response the way the API answers (Content-Type json). */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Mock fetch for the connector suites: routes GET /invoices.json by `page`
 * param and /api/pdf/{id}.json by a scripted sequence. Records every requested
 * URL so tests can grep them (redaction + filter assertions).
 */
export function createMockFetch(
  options: {
    pdfSequence?: Array<{ status: number; body: unknown }>
    failListWith?: { status: number; body?: unknown; times?: number }
  } = {},
): { fetchImpl: typeof fetch; requestedUrls: string[] } {
  const requestedUrls: string[] = []
  const pdfQueue = [...(options.pdfSequence ?? [])]
  let listFailuresLeft = options.failListWith?.times ?? (options.failListWith ? Infinity : 0)

  const fetchImpl: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    requestedUrls.push(url)
    const parsed = new URL(url)

    if (parsed.pathname === '/invoices.json') {
      if (options.failListWith && listFailuresLeft > 0) {
        listFailuresLeft -= 1
        return jsonResponse(options.failListWith.body ?? { errors: { error: 'boom' } }, options.failListWith.status)
      }
      const page = Number(parsed.searchParams.get('page') ?? '1')
      return jsonResponse(page <= 1 ? listPage1 : listPage2)
    }

    if (/^\/api\/pdf\/\d+\.json$/.test(parsed.pathname)) {
      const next = pdfQueue.shift() ?? { status: 200, body: pdfReadyResponse }
      return jsonResponse(next.body, next.status)
    }

    // Pre-signed PDF download URL returned by a 200 PdfResponse.
    if (parsed.host === 'invoicexpress-files.example') {
      return new Response(PDF_BYTES, { status: 200, headers: { 'Content-Type': 'application/pdf' } })
    }

    return jsonResponse({ errors: { error: 'not found' } }, 404)
  }

  return { fetchImpl, requestedUrls }
}
