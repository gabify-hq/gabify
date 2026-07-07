# INTEGRATION_NOTES_MOLONI.md — doc-driven decisions

Status: **IMPLEMENTADO / NÃO LIGADO À BD / NÃO TESTADO CONTRA API REAL**

Every decision below is grounded in the documentation saved verbatim in
`integrations/moloni/docs/` (raw HTML in `integrations/moloni/docs/raw/`),
fetched from https://www.moloni.pt/dev/ on 2026-07-07. Where the doc is
ambiguous, the most conservative reading was taken and is flagged with ⚠️.

---

## 1. Endpoints and transport

| Fact | Source |
|---|---|
| Base URL `https://api.moloni.pt/v1` | `autenticacao.md`, all method pages |
| Token grant: GET `https://api.moloni.pt/v1/grant/` with query params | `autenticacao.md` ("O pedido para estes dois códigos é feito por GET") |
| All data calls: HTTP POST, `access_token` in query string | `utilizacao.md`, `visao-geral.md` |
| POST body content type **must** be `application/x-www-form-urlencoded` | `controlo-de-erros.md` (auth error: "The content type for POST requests must be \"application/x-www-form-urlencoded\"") |
| Responses are JSON | `visao-geral.md` |

⚠️ **JSON body mode not used.** `utilizacao.md` says JSON body mode requires
`json=true` **and** the header `application/x-www-form-urlencoded` — the doc
literally names the urlencoded content type as the "correct header" for JSON
mode, which is contradictory. Conservative reading: send the body
x-www-form-urlencoded (the documented default), no `json` parameter.

## 2. OAuth / token lifecycle

| Fact | Source |
|---|---|
| `grant_type=password` (native apps): client_id, client_secret, username, password → tokens in one call | `autenticacao.md` §Aplicações nativas |
| `grant_type=refresh_token`: client_id, client_secret, refresh_token → **both** tokens renewed | `autenticacao.md` §Fazer refresh ao Access Token |
| Access token valid **1 hour** (`expires_in: 3600` in grant response) | `autenticacao.md` |
| Refresh token valid **14 days** | `autenticacao.md` |
| Access token must be reused "praticamente na sua totalidade" — check validity before each request/process, renew only when expired or about to expire | `utilizacao.md` §Renovação da Access Token |
| Grant errors: HTTP 400 + JSON `{error, error_description}` | `autenticacao.md`, `controlo-de-erros.md` |

Implementation: the connector keeps the access token in memory and reuses it
until `expiresAt - SAFETY_MARGIN (60s)`. It never requests a token per call.
When expired/near-expiry: refresh via `refresh_token` grant if a refresh token
is held, else `password` grant. New token state is surfaced through the
optional `onTokenState` callback so the future persistence slice can store it.

⚠️ The web (`authorization_code`) flow is documented but **not implemented** —
it needs a redirect UI, which belongs to the post-merge slice. The password
grant is the documented path for exactly this situation ("aplicações nativas,
… ou qualquer outra situação onde o anterior não seja aplicável").

## 3. Listing issued documents

- `POST /v1/documents/getAll/` — params `company_id` (required), `qty`
  (default 50, **max 50**), `offset` (default 0), optional filters incl.
  `status` (`documents_documents_getall.md`).
- Response: JSON **array** of document summaries (no lines, no taxes).
- Line/tax detail requires `POST /v1/documents/getOne/` per document
  (`documents_documents_getone.md`). ⚠️ N+1 by API design — no batch detail
  endpoint exists in the doc. Mitigated by the internal rate limiter.

### Draft exclusion
- Status `0` = draft ("rascunho") — `documents_documents_getpdflink.md`
  ("Só podem ser pedidos documentos que já não estejam em estado de rascunho
  (status 0)").
- Status `1` = closed ("fechado") — `documents_invoices.md`
  (generateMBReference: "o documento em causa tem que estar fechado
  (status = 1)").
- ⚠️ The full status enumeration is not documented. Conservative reading:
  filter **client-side** `status !== 0` (drafts out, everything else in) and
  do not pass a `status` filter to the API, since the semantics of other
  values are unknown. Raw `status` is preserved in `SourceDocument.raw`.

### Pagination / cursor
- The response carries no total count. A page is considered "possibly not
  last" when `items.length === qty`; the cursor is the next offset
  (`offset + returned`). ⚠️ If the collection size is an exact multiple of
  `qty`, one extra empty page is fetched — accepted cost, documented here.
- De-dup across pages by `document_id` (offset pagination can shift while
  documents are inserted between page requests).

## 4. Money handling

The doc types every monetary value as `float` (`net_value: float`, etc.).
All conversion to cents happens **at the boundary** in `money.ts
(decimalToCents)`: the number is serialised via `toFixed`-free string
handling and converted with integer arithmetic (round half away from zero at
2 decimals). No chained float arithmetic — sums of cents only.

## 5. VAT breakdown

From `documents_documents_getone.md`, each product carries
`taxes: [{ value: float, incidence_value: float, total_value: float, … }]`:

- `value` = rate in percent (e.g. `23`)
- `incidence_value` = taxable base for that product/tax
- `total_value` = tax amount for that product/tax

`vatBreakdownCents` aggregates per rate: `ratePermil = round(value × 10)`
(23% → 230‰ — integer-safe), `baseCents = Σ incidence_value`,
`amountCents = Σ total_value`, each converted to cents individually before
summing.

⚠️ `taxes` may be an **empty array** ("o conjunto taxes poderá estar vazio
(caso em que o campo exemption_reason … estará forçosamente preenchido)") —
exempt products contribute nothing to the breakdown; `exemption_reason` is
kept in the line DTO. The doc does not discriminate VAT vs stamp-tax entries
in the response shape beyond `saft_type`/`type` ints whose enumeration is not
documented; conservative reading: aggregate **all** tax entries by rate and
preserve `raw` for the future slice to refine.

## 6. Totals and currency

- `totalCents` ← `net_value` (the after-tax document total; `gross_value` is
  pre-tax/discount per the response field ordering — both kept in `raw`).
- ⚠️ Currency: document values are in the company's currency; Moloni PT
  companies operate in EUR. `exchange_currency` (optional) describes a
  *conversion* of the total (`exchange_total_value`), not the base values.
  Conservative reading: `currency: 'EUR'` always; exchange data stays in
  `raw`. Revisit in the real-account validation checklist.

## 7. PDF

- `POST /v1/documents/getPDFLink/` — `company_id` + `document_id` required,
  optional `signed` int; response `{ url: string }`
  (`documents_documents_getpdflink.md`).
- We send `signed=1` — the doc says without it the downloaded document "não
  será assinado", and an unsigned invoice PDF is useless for accounting.
- Drafts cannot be requested (status 0) → `fetchPdf` returns `null` without
  calling the API when the caller passes a draft ref, and `null` on 4xx.
- The `url` is then fetched (GET) and returned as a `Buffer`.

## 8. Errors, retry, limits

- Auth errors: HTTP 400 `{error, error_description}` (`controlo-de-erros.md`).
- Data/validation errors: JSON array of `"<code> <field>"` strings — never
  retried (they are deterministic).
- Retry: **only** HTTP 5xx and timeouts, max 3 attempts total, exponential
  backoff. 4xx never retried.
- Timeout: 30 s per request (AbortController).
- Internal rate limit: 2 req/s (min 500 ms between request starts), across
  all calls of a connector instance, token grants included.
- ⚠️ The doc does not publish a server-side rate limit; 2 req/s is our own
  conservative ceiling from the spec.

## 9. Credential redaction

`client_secret`, `password`, `access_token`, `refresh_token` never appear in
error messages or logs: errors thrown by the client carry a **sanitised URL**
(query values for those keys replaced with `[REDACTED]`) and a body-free
summary. Enforced by test (`grep`-style assertion over thrown errors and a
spied logger).

## 10. Out of scope (per spec)

Push to Moloni, customers/products sync, webhooks, InvoiceXpress (the
`DocumentSourceConnector` contract is ready for it), any schema/UI/export
change. Persistence design lives in `HANDOFF_MOLONI.md`.
