# InvoiceXpress API — saved official documentation

Fetched verbatim on **2026-07-07** from the official documentation portal
`https://docs.invoicexpress.com/` (Redocly site; markdown pages via the
`/llms.txt` index, OpenAPI bundle via the documented download link).

**API version: 2.0.0** (as stated in every page and in `openapi.yaml`).

| File | Source URL | Content |
|---|---|---|
| `openapi.yaml` | https://docs.invoicexpress.com/_bundle/index.yaml | Full official OpenAPI 3.1 spec (authoritative) |
| `index.md` | https://docs.invoicexpress.com/index.html.md | Portal index: auth, IVA exemption codes, servers, security, endpoint map |
| `listinvoices.md` | https://docs.invoicexpress.com/invoices/listinvoices.md | `GET /invoices.json` — list, filters, pagination |
| `getinvoice.md` | https://docs.invoicexpress.com/invoices/getinvoice.md | `GET /{invoices-type}/{document-id}.json` |
| `generatepdf.md` | https://docs.invoicexpress.com/invoices/generatepdf.md | `GET /api/pdf/{document-id}.json` (202 → poll → 200 `output.pdfUrl`) |
| `changeinvoicestate.md` | https://docs.invoicexpress.com/invoices/changeinvoicestate.md | Document state semantics |
| `relateddocs.md` | https://docs.invoicexpress.com/invoices/relateddocs.md | Related documents |
| `getclient.md` | https://docs.invoicexpress.com/clients/getclient.md | Client detail — only place `fiscal_id` (NIF) is exposed |

## Key facts (all verified in the files above — nothing assumed)

- **Format**: JSON only. `Content-Type: application/json` on POST/PUT.
- **Auth**: `api_key` **in the query string** of every request (`Security: apiKeyAuth,
  In: query, Name: api_key`). No header alternative is documented → redaction of the
  key from URLs/errors/logs is mandatory on our side.
- **Base URL**: `https://{account_name}.app.invoicexpress.com`.
- **Rate limit**: 780 requests/minute per account; 429 on excess (index.md).
- **List filters** (`QueryParamns` schema): `type[]` enum `Invoice, InvoiceReceipt,
  CreditNote, DebitNote, Receipt, CashInvoice`; `status[]` enum `draft, sent, settled,
  canceled, second_copy, deleted`; `non_archived` (required trio), plus `archived`,
  `text`, `reference`, `date[from|to]` (dd/mm/yyyy), `due_date[from|to]`,
  `total_before_taxes[from|to]`, `page`, `per_page`.
- **Pagination**: response `pagination { total_entries, per_page, current_page, total_pages }`.
- **Amounts**: JSON numbers (`sum`, `discount`, `before_taxes`, `taxes`, `total`,
  item `subtotal`, `tax_amount`, `discount_amount`, `total`); list-item `unit_price`
  and `quantity` are **strings** (`"1.0"`). `retention` is a **string** (percentage).
- **Dates**: `dd/mm/yyyy` strings.
- **Client in document responses**: `{ id, name, code?, country, email? }` — **no
  `fiscal_id`**; NIF only via `GET /clients/{client-id}.json`.
- **PDF**: `GET /api/pdf/{document-id}.json` → `202` ("keep requesting until 200")
  → `200 { output: { pdfUrl } }`. Takes only `document-id` (no type) → document ids
  are unique across document types.
