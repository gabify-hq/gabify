# Assistant — read-only Q&A (v1)

Chat where the accountant asks natural-language questions about THEIR office
data ("EDP invoices above 100€ in May", "23% VAT total per supplier this
quarter"). The assistant NEVER writes anything — enforced by architecture,
not by prompt. Kabilio "Kabi" parity target.

## Data flow

```
question (pt-PT)
  → POST /api/assistant/query        guard('assistant:query') + rate limit 20/min
  → assistant-service.answerQuestion
      → Claude (ASSISTANT_MODEL, Haiku by default) with the CLOSED tool catalog
      → tool_use → executeAssistantTool(officeId FROM SESSION, name, input)
          · officeId-like keys stripped from model input (forgery ignored)
          · zod .strict() validation — invalid input → error tool_result,
            loop continues
          · execution is a Prisma read / raw SELECT scoped to officeId
      → loop (max 5 tool executions; the 6th request is cut)
      → AuditLog ASSISTANT_QUERY (question + toolsInvoked) BEFORE returning
  → { answer, results[] } — the UI renders tables from `results` (server
    data), never from model text
```

## Anti text-to-SQL architecture

The LLM never produces SQL or free-form queries. It can only pick tools from
`src/server/services/assistant-tools.ts`:

| Tool | Reads | Notes |
|---|---|---|
| `search_documents` | `Document` | AND filters (client, supplier, NIF, status, period, amount in cents, text), max 50 |
| `aggregate_documents` | `Document` (+`vatBreakdown` JSONB) | groupBy supplier/client/vatRate/month × metric total/base/vat — SQL `SUM` over integer cents; vatRate uses `jsonb_array_elements` |
| `find_duplicate_suspects` | `Document` | `flags has DUPLICATE_SUSPECT` + `duplicateOfId` |
| `search_bank_transactions` | `BankTransaction` | account/status/period/amount(signed cents)/text, max 50 |
| `reconciliation_summary` | `BankTransaction` | count + `SUM(amountCents)` per status |

All aggregation arithmetic happens in PostgreSQL over integer cents (A1) —
the model presents numbers, it never computes them.

## Guard rails (all covered by `tests/acceptance/assistant.test.ts`)

| Invariant | Enforcement |
|---|---|
| No write tools | Catalog has exactly the 5 tools; architecture test greps the module for Prisma write calls |
| Tenancy | `officeId` injected from session; model-provided `officeId`/`office_id` stripped; every query filters by it |
| Cross-office questions | Return the (empty) results of the OWN office, never foreign data |
| AuditLog | `ASSISTANT_QUERY` with question + tools invoked, written before the answer returns (also on failure, with `failed: true`) |
| RBAC | `assistant:query` — OWNER/ACCOUNTANT/VIEWER allowed; unknown roles denied (explicit matrix lookup) |
| Rate limit | 20 questions/min/user (`RATE_LIMIT_ASSISTANT_PER_MIN`) |
| Robustness | Invalid tool params → zod rejection as error tool_result, loop continues; 6th tool call cut; model error/timeout/empty answer → clean 502 pt-PT message, never a raw 500 |
| Prompt injection | Document/transaction text reaches the model as tool_result DATA; system prompt marks it as data; scope is server-side so embedded instructions cannot widen it |

## UI — `/assistant`

Mobile-first pt-PT chat (`src/components/dashboard/assistant-chat.tsx`):
in-memory session history only (v1 — zero schema changes), 4 suggested
starter questions, tables rendered from the structured `results` payload with
status badges (global color mapping), contextual links to existing screens
(`/review?flag=DUPLICATE_SUSPECT`, `/review?status=…`, `/documents`,
`/bank?status=…`) and client-side CSV export (UTF-8 BOM, `;`, decimal
comma — A9). Loading/empty/error states with retry. Sidebar link
"Assistente".

## Env vars

| Var | Default | Purpose |
|---|---|---|
| `ASSISTANT_MODEL` | `claude-haiku-4-5-20251001` | Economical model for the Q&A loop |
| `RATE_LIMIT_ASSISTANT_PER_MIN` | `20` | Questions per user per minute |

## Schema

None. No new models, no migrations (parallel-execution constraint). The only
persistence is the existing immutable `AuditLog`.

## Known TODOs / future

| Item | Notes |
|---|---|
| Conversation persistence | v1 keeps history in memory only; a `AssistantConversation` model is future work |
| Streaming responses | Out of scope v1 (nice-to-have) |
| Email questions | Out of scope v1 |
| clientName → clientId deep links | Table links use static screen filters; resolving client names to ids for richer links is future work |
