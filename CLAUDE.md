# CLAUDE.md — Gabify

> Full product vision, all modules, and market context: see **CONTEXT.md**

## What is Gabify

Operational platform for Portuguese accounting firms.
Intelligent intake and workflow layer **before** accounting software (Primavera, TOConline, Sage).
Does not replace accounting software — organises the operational chaos before that.

---

## ⚠️ Sacred rules

### 0. Plan before executing

**Always present a step-by-step plan before executing any task. Wait for explicit approval before proceeding.**

### 1. Code is always in English

**All code, variable names, comments, tests, types, database fields, API responses, error messages in code — always in English.**

The only exception: string literals that are displayed to end users in the UI (because users are Portuguese).

```typescript
// CORRECT
const clientMatchScore = 0.85
const status = 'PENDING_REVIEW'
// Error shown to user in Portuguese — this is a UI string, acceptable:
return { error: 'Documento não encontrado' }

// WRONG — never do this
const pontuacaoCorrespondencia = 0.85
const estado = 'AGUARDA_REVISAO'
```

### 2. Unit tests for every new feature

Every new function, service, worker, or utility **must have unit tests**.
No feature is done without tests. Tests live next to the code: `foo.ts` → `foo.test.ts`.

See `.claude/rules/testing.md` for full conventions.

### 3. Documentation updated with every relevant change

Three documents must stay in sync with the code:
- `docs/HOW_IT_WORKS.md` — plain English for clients and stakeholders (single file)
- `docs/technical/OVERVIEW.md` — architecture, stack, security, deploy (cross-cutting)
- `docs/technical/<module>.md` — per-module: data flow, endpoints, TODOs

Update both whenever a feature is implemented or meaningfully changed.

See `.claude/rules/documentation.md` for what triggers an update.

---

## Module roadmap

| Module | Status | Description |
|---|---|---|
| 0 — Foundation | ✅ done | Schema, clients, EmailProvider, workers |
| 1 — Email Copilot | 🔨 Phase 2 | **Dashboard UI (current work)** |
| 2 — Client Portal | 📋 future | Client self-service, magic links, drag & drop |
| 3 — AI Document Parser | 📋 future | OCR + Claude, content-based only |
| 4 — Dashboard & Deadlines | 📋 future | Client status, PT fiscal calendar |
| 5 — Automated Reminders | 📋 future | Email now, WhatsApp later |
| 6 — Organised Export | 📋 future | ZIP: Client/Year/Month/DocType |
| 7 — Accounting Software Integration | 📋 future | TOConline, Primavera, Sage APIs |

**Current scope: Module 1 Phase 2 — Accountant Dashboard UI.**

---

## Core principle: AI as copilot, never pilot

Every action that affects the outside world (send email, notify client, file document) **requires explicit accountant approval**.

- Drafts generated, never sent automatically
- Everything logged in `AuditLog` with timestamp + who approved
- Accountant always has 1-click approve / edit / reject
- AuditLog is immutable — never deleted, never edited

---

## Stack

- **Next.js 14** App Router + TypeScript (strict mode)
- **PostgreSQL** + Prisma ORM (migrations only, never `db push` in prod)
- **BullMQ** + Redis (email sync + document parse workers)
- **Cloudflare R2** (attachments — signed URLs, never public)
- **Auth.js v5** magic links (no passwords ever)
- **Resend** (outbound email)
- **Claude API** (document classification + draft generation)
- **Deploy**: Railway (web + 2 workers separate)

---

## Email Providers (priority order)

1. **Microsoft Graph API** — delta queries for incremental sync (priority — PT firms use Outlook)
2. **Gmail API** — Pub/Sub push notifications
3. **IMAP** — polling fallback, stub only

Always code against the `EmailProvider` interface. Never call provider-specific code from business logic.

---

## Essential commands

```bash
npm run dev                                      # Next.js dev server
npm run worker:email                             # BullMQ email sync worker
npm run worker:documents                         # BullMQ document parse worker
npx prisma migrate dev --name <semantic-name>    # create migration
npx prisma generate                              # regenerate client after schema change
npx prisma studio                                # database GUI
npx tsc --noEmit                                 # type check
npm run lint                                     # lint
```

---

## Project structure

```
prisma/
  schema.prisma          — complete schema (all models)
  config.ts              — Prisma 7 config (pg adapter)

src/
  types/index.ts         — global enums and types
  lib/
    prisma.ts            — Prisma client singleton
    r2.ts                — R2 upload + signed URLs
    anthropic.ts         — Claude API client
    resend.ts            — Resend client
    redis.ts             — BullMQ connection config
    auth.ts              — Auth.js v5 magic links
  server/
    email-providers/
      EmailProvider.ts   — interface (syncInbox, getAttachment, sendReply, watchChanges)
      OutlookProvider.ts — Microsoft Graph (delta queries skeleton)
      GmailProvider.ts   — Gmail API (Pub/Sub skeleton)
      ImapProvider.ts    — IMAP stub
      index.ts           — createEmailProvider factory
    services/
      client-matching.ts         — email → client by domain/known email
      email-classification.ts    — Claude API: classify PT accounting docs + drafts
  queues/
    email-sync.worker.ts         — sync inbox + match clients + queue attachments
    document-parse.worker.ts     — R2 upload + text extract + AI classify + AuditLog
  app/
    api/webhooks/graph/route.ts  — Microsoft Graph change notifications
    api/webhooks/gmail/route.ts  — Gmail Pub/Sub push
    api/auth/[...nextauth]/      — Auth.js handlers
    dashboard/                   — Accountant dashboard (Phase 2 — in progress)
    inbox/                       — Email copilot UI
    clients/                     — Client management
    settings/                    — Email account connections
  components/                    — UI components (shadcn/ui base)
```

---

## Critical rules

### Security
- R2: **always signed URLs**, never public URL. Max expiry 1h for documents, 15min for previews
- OAuth tokens: encrypted before storing in DB, never in logs
- Webhooks: verify signature (Graph HMAC, Gmail JWT) before processing
- AuditLog: entry created **before** any external action, not after

### Prisma
- `prisma migrate dev --name <semantic-name>` — always with descriptive name
- **Never** `prisma db push` outside dev scratch
- After schema change: `prisma generate` before writing service code

### EmailProvider interface
```typescript
interface EmailProvider {
  syncInbox(): Promise<SyncResult>
  getAttachment(messageId: string, attachmentId: string): Promise<Buffer>
  sendReply(messageId: string, draft: EmailDraft): Promise<void>
  watchChanges(webhookUrl: string): Promise<WatchResult>
}
```
Never bypass this interface. Business logic must be provider-agnostic.

### TypeScript
- Strict mode always on
- No `any` — use `unknown` and narrow
- All API routes validate body with Zod before touching the DB

### BullMQ Workers
- Workers must be idempotent (safe to retry)
- Always log job start/end to `JobLog`
- Failures: exponential backoff, max 3 retries

### UI (accountant-focused)
- No decorative elements — no gradients, no hero sections, no marketing patterns
- Tables over cards for list data
- Dense but readable spacing
- Color only for status, not decoration
- Status color mapping (enforce globally):
  - `PENDING_REVIEW` → yellow
  - `APPROVED` → green
  - `REJECTED` → red
  - `PROCESSING` → blue
  - `ERROR` → red
  - `DRAFT` → gray

### Portuguese context
- UI display strings in **PT-PT** (not PT-BR, not English)
- Dates: DD/MM/YYYY
- NIF: 9 digits — extract from documents whenever present
- Timezone: Europe/Lisbon
- AI-generated emails: sound human, PT-PT, professional but natural — no AI-speak

---

## Standard of Work

The marginal cost of completeness is near zero with AI. Do the whole thing.
Do it right, do it with tests, do it with documentation. Do it so well that
the result is genuinely impressive — not politely satisfactory, actually impressive.

- Never offer to "table this for later" when the permanent solution is within reach
- Never leave a dangling thread when tying it off takes 5 more minutes
- Never present a workaround when the real fix exists
- Never stub a function with TODO when implementing it takes the same time

The standard is not "good enough" — it is "holy shit, that's done".

Search before building. Test before shipping. Ship the complete thing.

When asked for something, the answer is the finished product, not a plan to build it.
Time is not an excuse. Fatigue is not an excuse. Complexity is not an excuse.
