# Bank Reconciliation v1 (fase C)

Statement-import based reconciliation — **no PSD2/aggregators**, no AI matching,
no PDF statements, EUR-only logic (currency field exists for later).

## Data flow

```
CSV/XLSX statement
      │  POST /api/bank/imports (multipart, magic bytes, ≤10MB, fileHash 409+force)
      ▼
column detection: PT-header heuristic (zero AI) → AI fallback (5-row sample, strict Zod)
      │  human confirms the mapping — MANDATORY (nothing imported before)
      ▼  POST /api/bank/imports/[id]/confirm
BankTransaction rows (integer cents; dedupHash unique per office — duplicates
skipped + reported, never a 500)
      │  automatic, synchronous, deterministic
      ▼
bank rules (priority asc, first match): IGNORE → entry+audit+IGNORED
                                        SUGGEST_CLIENT → redirect candidates
      ▼
matching engine: candidates = documents of the SAME client of the account,
VALIDATED/EXPORTED, not reconciled, SQL-prefiltered by amount tolerance window
      ▼
ReconciliationSuggestion (max 5/tx, score desc)
  score ≥ 75 → autoMatch=true, tx → SUGGESTED (pre-selected in UI, NEVER auto-reconciled)
  45–74     → review suggestion (autoMatch=false)
      │  human action only
      ▼  POST /api/bank/transactions/[id]/reconcile  { documentIds[] | ignore+reason, expectedVersion }
ReconciliationEntry + AuditLog + tx → RECONCILED/IGNORED + Document.reconciledEntryId
      ▲  POST .../unreconcile reverts everything (audited)
```

## Scoring (deterministic, `bank-matching.ts`)

| Component | Weight | Rule |
|---|---|---|
| Amount | 50 | exact `|amountCents|` = 50; within office tolerance (default 2c) = 45; otherwise **eliminated** |
| Date | 25 | vs `dueDate` (fallback `issueDate`): ≤3d = 25; ≤15d = 15; ≤45d = 5 |
| NIF/name | 20 | supplier NIF in description (digit boundary) = 20; normalized name ≥4 chars word-boundary = 12 |
| Reference | +15 | document number in description (space-insensitive) |

Direction: debit (negative) ↔ `INVOICE_RECEIVED`/`INVOICE_RECEIPT`/`RECEIPT`;
credit ↔ `INVOICE_ISSUED`. Multi-document reconciliation is validated at
reconcile time: Σ document totals = `|amountCents|` ± tolerance → otherwise 422.

## Endpoints (all behind `can()`)

| Endpoint | Action | Notes |
|---|---|---|
| `POST /api/bank/accounts` | `bank:manage` | unique (office, client, iban) when iban present |
| `GET /api/bank/accounts` | `bank:read` | cursor 50/200, unreconciled count per account |
| `POST /api/bank/imports` | `bank:import` | step 1; 409 + `canForce` on same fileHash |
| `POST /api/bank/imports/[id]/confirm` | `bank:import` | step 2; conditional PENDING→PROCESSED (409 double-confirm) |
| `GET /api/bank/transactions` | `bank:read` | AND filters (account/status/period/q), suggestions embedded |
| `POST /api/bank/transactions/[id]/reconcile` | `bank:reconcile` | optimistic locking (A7); atomic entry+audit+links |
| `POST /api/bank/transactions/[id]/unreconcile` | `bank:reconcile` | full revert, audited |
| `POST/GET /api/bank/rules`, `PATCH/DELETE /api/bank/rules/[id]` | `bankRule:manage` | OWNER **and** ACCOUNTANT (not settings:manage) |

## Models

`BankAccount`, `BankStatementImport` (PENDING/PROCESSED/FAILED),
`BankTransaction` (UNRECONCILED/SUGGESTED/RECONCILED/IGNORED, `version` for A7,
`dedupHash` unique per office), `ReconciliationSuggestion` (unique tx+doc,
`scoreBreakdown` Json), `ReconciliationEntry` (one per tx; undo deletes it —
AuditLog keeps the trail), `BankRule` (CONTAINS/EQUALS/SIMPLE_REGEX ×
IGNORE/SUGGEST_CLIENT, priority asc). `Office.reconciliationToleranceCents`
(default 2). `Document.reconciledEntryId` — never touches the document state
machine.

## Money

`amountCents Int` (negative = debit) — A1, never float. Dedicated parser
`centsFromBankAmount` (`src/lib/bank-amount.ts`) handles "1.234,56",
"1 234,56", "-45,00", "1234.56", anglo "1,234.56"; separate debit/credit
columns produce the same signed cents as a single signed column.

## UI

`/bank` (accounts per client + reconciliation queue with score breakdown,
1-tap accept for autoMatch, multi-doc checkboxes, ignore with reason, undo),
`/bank/import` (3-step wizard, force path for re-imports),
`/settings/bank-rules` (CRUD). Dashboard shows "por conciliar / sugeridas"
counters. All pt-PT, mobile-first.

## Known TODOs

| TODO | Notes |
|---|---|
| Statement files are not persisted to R2 | only hash+rows; re-download impossible — acceptable v1 |
| CSV parsing assumes header on the first row | statements with preamble lines need manual cleanup |
| No accounting export of reconciled movements | out of scope (spec) |
| `SIMPLE_REGEX` uses native RegExp | pattern length capped at 200; invalid patterns never match |
