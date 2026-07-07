# TOConline Integration v1 — push de compras

> **Status: IMPLEMENTADO / NÃO TESTADO CONTRA API REAL.** Doc-driven by
> explicit owner decision: every endpoint, field and header comes from the
> official documentation saved in `integrations/toconline/` — the real API was
> never called. Read `INTEGRATION_NOTES.md` (repo root) for the endpoint
> sources, the 12 documented ambiguities/decisions and the mandatory human
> validation checklist before any production use.

## Scope

Push VALIDATED (or EXPORTED) received invoices (`INVOICE_RECEIVED` /
`INVOICE_RECEIPT`) of ONE client to that client's TOConline company as
finalized purchase documents (`document_type: FC`). Out of scope: sales
documents, chart-of-accounts sync, pulling data (except supplier lookups),
other ERPs (the `ExportTarget` interface is ready for them).

## Data flow

```
Accountant (client page) ──POST /api/toconline/push──► eligibility per item
      │                                                 status → PENDING
      │                                                 AuditLog PUSH_REQUESTED
      ▼
BullMQ queue `toconline-push` (1 job per document, idempotent)
      ▼
toconline-push.processor ── JobLog start/end
      ▼
toconline-push-service
  1. SENT already? ──► no-op with warning (never re-pushed)  [INV]
  2. dryRun? ──► write exact requests to ToconlinePushPreview, ZERO network [INV]
  3. supplier: EntityMap cache → GET /api/suppliers?filter[NIF]
               → (absent) AuditLog + POST /api/suppliers → cache        [INV: never duplicated]
  4. remote idempotency: GET /api/commercial_purchases_documents
     ?filter[status]=1&filter[supplier_tax_registration_number]=NIF
     matched on external_reference === "GABIFY:<documentId>"            [INV]
  5. AuditLog TOCONLINE_PUSH_STARTED (BEFORE the external POST)
  6. POST /api/v1/commercial_purchases_documents (header+lines, auto-finalized)
  7. document → SENT + toconlineDocumentId + pushedAt
  Failure at any step → document ERROR + sanitized context; retry resumes safely
```

## Money (A1)

Purchase lines are built from `vatBreakdown` (integer cents): one line per VAT
band — `quantity: 1`, `unit_price` = base in euros converted ONLY at the API
boundary via `euroNumberFromCents` (cent-exact, contract-tested),
`tax_percentage` + `tax_country_region` per band. `retention_total` from
`withholdingAmount`. Exempt (0%) bands are NOT supported in v1 (the API
requires a legal `tax_exemption_reason_id` that cannot be derived — clear PT
error instead of fiscal guessing). Non-EUR documents are refused.

## HTTP client (`src/server/toconline/toconline-client.ts`)

- OAuth per the docs: `GET {OAUTH_URL}/auth` (302 → code, non-interactive) +
  `POST {OAUTH_URL}/token` with `Basic base64(client_id:secret)`.
  `access_token` 4h; `refresh_token` 8h — refresh failure falls back to the
  full authorization_code flow automatically.
- Mandatory headers on every API call: `Content-Type: application/vnd.api+json`,
  `Accept: application/json`, `Authorization: Bearer`.
- 30s timeout; retry with exponential backoff (max 3 retries, ONLY on
  5xx/timeout/network — 4xx never retried); internal rate limit 2 req/s per
  connection; 401 mid-flight → transparent token renewal + single retry.
- Every error message is scrubbed of secrets/tokens (tested by grep).
- Test seam: `fetch-provider.ts` (`setToconlineFetchForTests`) + per-call
  `fetchImpl` injection — all tests run against the doc-derived mock in
  `tests/mocks/toconline-api.ts` with fixtures copied verbatim from the saved
  doc pages.

## Models

| Model | Purpose |
|---|---|
| `ToconlineConnection` | Per-CLIENT (unique `clientId`); 4 integrator values; secret+tokens AES-GCM; `status ACTIVE\|ERROR\|DISABLED`; `dryRun` (born true); `lastError` |
| `ToconlineEntityMap` | `(connectionId, entityType, nif)` unique → TOConline id; suppliers only in v1 |
| `ToconlinePushPreview` | Dry-run output: endpoint, method, redacted headers, exact body |
| `Document.*` | `toconlinePushStatus PENDING\|SENT\|ERROR`, `toconlineDocumentId`, `toconlinePushedAt`, `toconlinePushError` |

## API endpoints

| Route | Action | Notes |
|---|---|---|
| `GET /api/clients/[clientId]/toconline` | `toconline:read` | DTO without secrets |
| `PUT /api/clients/[clientId]/toconline` | `toconline:manage` | Upsert + OAuth validation on save; failure saved as ERROR+lastError |
| `DELETE /api/clients/[clientId]/toconline` | `toconline:manage` | → DISABLED, tokens cleared, dryRun back to true |
| `POST /api/clients/[clientId]/toconline/dry-run` | `toconline:manage` to enable / `toconline:goLive` (OWNER) to disable | Disable audited (`TOCONLINE_DRY_RUN_DISABLED`); action derived before resource (anti-enumeration) |
| `POST /api/toconline/push` | `toconline:manage` | `{clientId, documentIds[≤50]}` → per-item report; eligible docs → PENDING + queued |
| `GET /api/documents/[documentId]/toconline` | `toconline:read` | Push state + previews (redacted) |

All routes: cross-tenant → 404 (tested in the P1 denial loop too).

## RBAC

`toconline:read` — OWNER/ACCOUNTANT/VIEWER. `toconline:manage` —
OWNER/ACCOUNTANT. `toconline:goLive` — OWNER only (disabling dry-run on an
integration never tested against the real API is an owner decision).

## ExportTarget

`src/server/export-targets/`: `ExportTarget` interface + `createExportTarget`
factory (the only kind branch, EmailProvider precedent). `FileExportTarget`
delegates to the existing `runExport` unchanged; `ToconlineExportTarget` wraps
the push service. Future ERPs (Primavera, Sage, Moloni) implement the same
interface.

## UI

Client page → "Integração TOConline" panel (`toconline-integration-panel.tsx`):
credentials form with instructions to obtain the 4 integrator values, status +
dry-run badges, permanent "NÃO testada contra o TOConline real" warning,
OWNER-only go-live with the mandatory explicit warning, validated-invoices
table with selection (ERROR rows retryable), per-document "o que seria
enviado" preview dialog.

## Tests

- `tests/acceptance/toconline.push.test.ts` (13) — supplier by NIF never
  recreated; 23%+6% cent-exact lines + OpenAPI contract; SENT re-push no-op;
  post-supplier failure retry without duplication; expired token transparent
  refresh; dry-run zero network (forbidden fetch); credentials never in
  logs/AuditLog/errors/previews; AuditLog before POST; remote idempotency;
  0%-band and non-EUR clear errors; retention; processor JobLog.
- `tests/acceptance/toconline.routes.test.ts` (6) — OAuth-validating PUT,
  cross-tenant 404 on all routes, VIEWER read-only, OWNER-only go-live,
  per-item push report, previews without secrets.
- `src/server/toconline/toconline-client.test.ts` (9) — auth flows, retry
  matrix, timeout, rate limit, redaction.
- `src/components/dashboard/toconline-integration-panel.test.tsx` (4).
- Contract helper: `tests/helpers/toconline-contract.ts` validates generated
  payloads against `integrations/toconline/openapi.json` (+ the doc-page line
  fields the spec truncates).

## Known TODOs

| TODO | Detail |
|---|---|
| Human validation against the real API | Follow the checklist in `INTEGRATION_NOTES.md` on a TEST company; then revisit ambiguities #1/#3/#4/#6 (content-type, POST response shape, external_reference echo, numeric supplier_id) |
| Exempt (0%) VAT bands | Requires mapping legal exemption reasons (M01–M99) to `tax_exemption_reason_id` — deliberate v1 refusal |
| Non-EUR documents | Requires `currency_conversion_rate` which Gabify does not store |
| `retention_type` | Omitted (API defaults to TD); confirm the right type per document category with an accountant |
| Railway service | `worker-toconline-push` not added to `railway.toml` yet — deploy when going live |
