# Document Sources — Moloni & InvoiceXpress (and the unified contract)

> ⚠️ **IMPLEMENTED / NEVER TESTED AGAINST THE REAL APIs.** All three source
> connectors (Moloni, InvoiceXpress, TOConline pull) are doc-driven. Before any
> production use, run the human validation checklist at the bottom of this file.

Module owner: sources-unification slice (`feature/sources-unification`).

## What a "source" is

A **document source** is an external invoicing platform Gabify PULLS issued
sale documents from (the client company's own outgoing invoices). Sources are
read-only from Gabify's side — importing never writes back to the external
system. This is the opposite direction of the TOConline **push** (purchases →
TOConline), which is unchanged.

## The unified contract

`src/server/sources/types.ts` — `DocumentSourceConnector`:

```ts
interface DocumentSourceConnector {
  listIssuedDocuments(cursor?: string): Promise<Page<SourceDocument>>
  fetchPdf?(externalId: string): Promise<Buffer | null>
}
```

- **One page per call**, opaque `cursor` (offset for Moloni, page number for
  InvoiceXpress / TOConline). `nextCursor === null` on the last page.
- `SourceDocument` is provider-neutral: **all money is integer cents**, **VAT
  rate is permil** (23 % → 230). Core fields are shared; source-specific
  enrichments (`withholdingCents`, `dueDate`, `atcud`, `documentStatus`,
  `customerExternalId`, …) are optional.

Implementations:

| Connector | File | Cursor | PDF |
|---|---|---|---|
| Moloni | `sources/moloni/connector.ts` | getAll offset | getPDFLink (signed) |
| InvoiceXpress | `sources/invoicexpress/connector.ts` | page number | 202-poll → download |
| TOConline (pull) | `toconline/toconline-source-connector.ts` | page number | url_for_print |

> **U1 note (rate representation):** Moloni already emitted permil. The
> InvoiceXpress mapper converts its percent rate via a dedicated
> `percentToPermil` with the same rounding; numeric equivalence is proven in
> `src/server/sources/rate-equivalence.test.ts`.

## Persistence

`prisma/schema.prisma` (migration `unify-source-connections`):

- **`MoloniConnection`** — per client: `companyId`, `username`/`password`
  (AES-256-GCM), OAuth `accessToken`/`refreshToken` (AES-256-GCM), `pullEnabled`
  (default false), `lastPullAt`, `status` (ATIVA | ERRO | DESLIGADA),
  `lastError`, soft delete.
- **`InvoicexpressConnection`** — per client: `accountName`, `apiKey`
  (AES-256-GCM), same lifecycle fields.
- **`SourceEntityMap`** — ONE generic dedup/cache table (replaces one
  `ToconlineEntityMap` per connector):
  - `entityType 'SALES_DOCUMENT'` → `externalId` = source doc id,
    `documentId` = created `Document`. Re-pull of a known id is a no-op.
  - `entityType 'CLIENT'` → `externalId` = source customer id, `value` =
    resolved NIF (InvoiceXpress enrichment cache).
  - Unique `(system, entityType, externalId, clientId)` — the spec's
    `(system, externalId, clientId)` hardened with `entityType` so a document
    id and a customer id that collide as strings never clash.

Credentials encryption uses `src/lib/crypto.ts` (`TOKEN_ENCRYPTION_KEY`).
Moloni developer-app credentials come from the env (`MOLONI_CLIENT_ID` /
`MOLONI_CLIENT_SECRET`), never the DB.

## Pull jobs

Shared runner `src/server/sources/source-pull.ts` (`runSourcePull`):

1. paginate the connector until `nextCursor === null`;
2. per document: dedup via `SourceEntityMap` (SALES_DOCUMENT) → skip if known;
3. resolve buyer NIF (hook — inline for Moloni, `/clients/{id}` cache for IVX);
4. `buildDocumentFromSource` → a `Document` with **source API_PULL, type
   INVOICE_ISSUED, status PRE_VALIDATED, confidence 1.0** (the AI pipeline is
   NEVER touched);
5. best-effort PDF → R2 (signed URLs only);
6. **one transaction** writes the `Document` + its `SourceEntityMap` row + an
   immutable `AuditLog` entry.

Per-system services own credentials/state:

- `sources/moloni/moloni-pull-service.ts` — decrypts credentials, persists
  refreshed tokens via the connector's `onTokenState`, redacts secrets on error.
- `sources/invoicexpress/invoicexpress-pull-service.ts` — decrypts the api_key,
  narrows the scan with `date[from] = lastPullAt − 24h`, resolves each final
  customer's NIF **once** (in-run memo + `SourceEntityMap` CLIENT cache).

### BullMQ queues / workers

| Queue | Processor | Worker entry | Interval env |
|---|---|---|---|
| `moloni-pull` | `queues/moloni-pull.processor.ts` | `queues/moloni.worker.ts` | `MOLONI_PULL_INTERVAL_MS` (30 min) |
| `invoicexpress-pull` | `queues/invoicexpress-pull.processor.ts` | `queues/invoicexpress.worker.ts` | `INVOICEXPRESS_PULL_INTERVAL_MS` (30 min) |

Each queue hosts a repeatable scan (one job per pull-enabled, non-disabled
connection) plus on-demand "Sincronizar agora" jobs. Idempotent (dedup),
JobLog on start/end, exponential backoff, max 3 retries.

> **Deployment:** `worker:moloni` and `worker:invoicexpress` are **NOT** in
> `railway.toml` — they only go live after the human validation below.

## Ligações (UI + API)

- Client page panel `SourceConnectionsPanel` lists Moloni + InvoiceXpress as
  SOURCE-only entries (no destination toggle, no dry-run): credentials form with
  how-to-obtain instructions, status, last sync + imported count, "Sincronizar
  agora", errors, and a permanent **NÃO TESTADO contra a API real** warning.
- Routes `/api/clients/[clientId]/sources/[system]` (GET/PUT/PATCH/DELETE) and
  `.../sync` (POST). RBAC: `source:read` (every internal role) /
  `source:manage` (OWNER + ACCOUNTANT). CLIENT is denied by the matrix and the
  new routes join the faseP1 CLIENT denial loop. Cross-tenant is always 404.

## TOConline pull on the contract (U4)

The TOConline pull now implements the contract via
`toconline/toconline-source-connector.ts` (listing + PDF). Its production pull
(`toconline-pull-service.ts`) keeps its own orchestration — **dry-run previews**
and the **GABIFY: anti-echo filter** are invariants the generic runner cannot
model — and consumes the connector for listing/PDF. Behaviour is unchanged
(all TOConline suites green). The sales mapping was extracted to
`toconline/toconline-sales-mapping.ts` so both share it.

## Known TODOs

| TODO | Notes |
|---|---|
| Real-API validation of all 3 systems | Mandatory before enabling workers — see checklist below |
| Moloni incremental sync | v1 re-scans from offset 0 each run (dedup makes it correct but chatty); `documents/getModifiedSince` is the documented alternative |
| Connection "test" on save | v1 persists without a live credential check (Moloni company chosen by id, not fetched) |
| InvoiceXpress `clientDetailResponseSchema` | Lenient (`passthrough`) — tighten once the real `/clients` shape is confirmed |

## Human validation checklist (consolidated — one real session for the 3 systems)

**Moloni** (see `HANDOFF_MOLONI.md` §b for the detailed doc-derived list):
- [ ] developer app authorized for the `password` grant; token reuse (1 grant/session)
- [ ] real multi-rate invoice → `vatBreakdownCents` exact to the cent
- [ ] pagination on a company with >50 documents; offset ordering
- [ ] `getPDFLink?signed=1` returns a signed, downloadable PDF

**InvoiceXpress** (see `HANDOFF_IVX.md` §b):
- [ ] `listIssuedDocuments` returns the finalized invoices (compare with the web UI); confirm the status filter
- [ ] real invoice with IRS retention → `withholdingCents` matches the UI
- [ ] credit note comes back positive (the connector applies the negative sign)
- [ ] `GET /clients/{id}` exposes `fiscal_id`; NIF enrichment resolves; strict schema does not break on extra fields
- [ ] `fetchPdf` 202→200 and the pre-signed URL downloads

**TOConline pull** (see `INTEGRATION_NOTES.md`): unchanged — its existing checklist stands.

**Cross-cutting:** force an auth error on each system and grep the logs/DB for
the secret (must never appear); confirm no API_PULL document is offered in the
TOConline push selector.
