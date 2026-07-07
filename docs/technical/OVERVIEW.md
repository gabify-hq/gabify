# Gabify — Technical Overview

Cross-cutting concerns: architecture, stack, security, deployment, testing, environment variables.
For module-specific documentation, see the sibling files in this directory.

---

## Service topology

```
┌─────────────────────────────────────────────────────────┐
│                        Railway                          │
│                                                         │
│  ┌──────────────┐   ┌──────────────┐  ┌─────────────┐  │
│  │  Web (Next)  │   │ email-sync   │  │ doc-parse   │  │
│  │  :3000       │   │ worker       │  │ worker      │  │
│  └──────┬───────┘   └──────┬───────┘  └──────┬──────┘  │
│         │                  │                  │         │
│  ┌──────▼──────────────────▼──────────────────▼──────┐  │
│  │              PostgreSQL + Redis                   │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

External services:
  Microsoft Graph API  ──► webhooks ──► /api/webhooks/graph
  Gmail Pub/Sub        ──► webhooks ──► /api/webhooks/gmail
  Cloudflare R2        ◄── upload / signed URL
  Anthropic Claude API ◄── classification + draft generation
  Resend               ◄── magic links + notifications
```

---

## Stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Framework | Next.js | 16 (App Router) | TypeScript strict mode |
| UI | Tailwind CSS + shadcn/ui | 4.x | |
| ORM | Prisma | 7.x | pg adapter, migrations only |
| Database | PostgreSQL | 15+ | |
| Job queue | BullMQ | latest | Redis-backed |
| Storage | Cloudflare R2 | S3-compatible | Private bucket, signed URLs |
| Auth | Auth.js | v5 beta | Magic links via Resend |
| Email | Resend | latest | Magic links + notifications |
| AI | Anthropic Claude API | claude-sonnet-4-5 | Classification + drafts |
| Deploy | Railway | | web + 2 worker services |
| Tests | Vitest | 4.x | Unit project (co-located, mocked) + acceptance project (real test DB) |

---

## Database schema — model map

```
Office ──< User
       ──< Client
       ──< EmailAccount
       ──< AuditLog
       ──< JobLog
       ──< Invitation      (closed onboarding — entry only by invite)

EmailAccount ──< InboundEmail
InboundEmail >── Client          (nullable, matched post-sync)
             ──< EmailAttachment
             ──< EmailAction
             >── EmailThread

EmailAttachment ──1 Document
EmailAction     ──1 EmailReview
                ──1 AuditLog     (nullable)
Document        ──1 DocumentReview

Client ──< BankAccount ──< BankStatementImport ──< BankTransaction
BankTransaction ──< ReconciliationSuggestion >── Document
                ──1 ReconciliationEntry ──< Document (reconciledEntryId)
Office ──< BankRule   (applied before matching; IGNORE / SUGGEST_CLIENT)
```

Bank reconciliation module detail: [bank-reconciliation.md](bank-reconciliation.md).

### Cross-cutting schema decisions

**Money (ADDENDUM A1)** — monetary values are NEVER floats: `Decimal @db.Decimal(14,2)` in columns; **integer cents** inside JSONB (`vatBreakdown`, `documentLines`). All arithmetic (coherence checks, export sums, VAT summary) runs on integer cents or decimal.js; coherence tolerance is 2 cents.

**Document pipeline** — one extraction cascade for every source (email attachment, manual upload, dedicated ingest mailbox, split children): AT fiscal QR (authoritative, zero AI) → UBL/XML (deterministic) → Claude with a strict Zod schema. States: `NEEDS_REVIEW → PRE_VALIDATED → VALIDATED → EXPORTED` (+ `SPLIT` lateral); reviews use optimistic locking (`version` + `expectedVersion`, A7).

**Soft deletes** — `deletedAt DateTime?` on Office, User, Client. All queries filter `where: { deletedAt: null }`. No hard deletes.

**Immutable AuditLog** — no `updatedAt`. Written once, never modified. Entry created before any AI-triggered external action.

**Encrypted credential fields** — OAuth tokens and IMAP passwords stored encrypted at service layer. Schema type is `String` — encryption/decryption in provider implementations.

---

## Security model

| Concern | Implementation | Status |
|---|---|---|
| R2 storage | Private bucket. All access via `getSignedUrl()`, max 1h expiry | ✅ |
| Auth | Auth.js v5 magic links. No passwords stored anywhere | ✅ |
| Closed onboarding | Signup only via pending `Invitation` (72h TTL, SHA-256 token hash). Magic link silently not sent for unknown emails (anti-enumeration). First office via `npm run seed:bootstrap` | ✅ |
| Anti-lockout | Last OWNER of an office cannot be deleted or demoted (409) | ✅ |
| API route auth | `auth()` session check before any data access | ✅ |
| Request validation | Zod schema on all POST/PATCH bodies | ✅ |
| Audit trail | `AuditLog` entry with the real entity id before every external action (send, AI call). AuditLog is never updated | ✅ |
| Draft approval | Server-side state machine: `PENDING_REVIEW → APPROVED_SENT / APPROVED_SEND_FAILED / REJECTED`, conditional DB transitions (no read-then-write), max 3 send retries, `EmailReview` + `AuditLog` before `sendReply` | ✅ |
| OAuth token encryption | AES-256-CBC encrypt/decrypt (GCM migration planned — Fase 1) | ✅ |
| Graph webhook | Fail-closed: 503 without `GRAPH_WEBHOOK_SECRET`; 401 on `clientState` mismatch; strict subscription-id account match | ✅ |
| Gmail webhook JWT | Fail-closed: 401 without `Authorization` or with invalid Google-signed JWT | ✅ |
| Attachment limits | 25MB per attachment, 15 per message; inline/item attachments skipped (A4) | ✅ |
| RBAC | Central `can()` matrix with DENY-precedence via `guard()` in every API route. OWNER = all; ACCOUNTANT = all except invitation/user/settings management; VIEWER = reads only. Denial → 404 on resources, 403 on global actions | ✅ |
| Sessions | Database strategy — revocable, role/office read fresh per request; edge proxy does optimistic cookie check only | ✅ |
| Rate limiting | Per endpoint class (A11): API 600/h per user, magic-link 5/h per email+IP, webhooks 120/min per subscription, uploads 60/h user + 300/h office | ✅ |
| Token encryption | AES-256-GCM (v2 prefix) with legacy CBC read + lazy re-encryption | ✅ |
| Webhook subscriptions | Created at OAuth connect, renewed daily when expiring <48h; failure falls back to 30s polling | ✅ |
| Pagination | All list endpoints: default 50, max 200, cursor-based | ✅ |

---

## Testing

**Framework:** Vitest, two projects:

- **unit** — co-located with source (`foo.ts` → `foo.test.ts`); no real DB, network, or Redis.
- **acceptance** — `tests/acceptance/fase*.test.ts`; runs against a dedicated PostgreSQL database (`gabify_test`, auto-created and migrated by the global setup). Providers/AI/Resend always mocked. Files run sequentially (shared DB).

**Rules:** test through public interfaces. `npm run gate` = tsc + eslint + vitest + coverage, and must pass at the end of every slice.

**Coverage targets:**

| Layer | Target |
|---|---|
| `src/server/services/` | 90% |
| `src/queues/` | 80% |
| `src/lib/` | 80% |
| `src/app/api/` routes | 70% |

**Current suite:** 179 unit tests (11 files: providers, crypto, r2, text-extractor, at-fiscal-qr, client-matching, email-classification, API routes) + 39 acceptance tests (Fase 0: onboarding, draft approval, Outlook attachments, webhooks, foundation invariants).

```bash
npm run test            # run once (unit + acceptance)
npm run test:watch      # watch mode
npm run test:coverage   # with coverage report
npm run gate            # tsc + eslint + tests + coverage
```

---

## Environment variables

| Group | Variables |
|---|---|
| App | `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `AUTH_SECRET` |
| Database | `DATABASE_URL`, `TEST_DATABASE_URL` (optional) |
| Redis | `REDIS_URL` |
| Resend | `RESEND_API_KEY`, `FROM_EMAIL` |
| Anthropic | `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` |
| R2 | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` |
| Graph API | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`, `GRAPH_WEBHOOK_SECRET` (required — webhook fail-closed) |
| Gmail API | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_PUBSUB_TOPIC`, `GMAIL_WEBHOOK_URL` |
| Sync | `EMAIL_POLL_INTERVAL_MS` |
| Encryption | `TOKEN_ENCRYPTION_KEY` |
| Bootstrap | `BOOTSTRAP_OWNER_EMAIL`, `BOOTSTRAP_OFFICE_NAME`, `BOOTSTRAP_OWNER_NAME` |

Full descriptions and example values in `.env.example`.

---

## Deployment (Railway)

Three services in `railway.toml`:

| Service | Start command | Purpose |
|---|---|---|
| `web` | `npm run start` | Next.js HTTP server |
| `worker-email-sync` | `npm run worker:email` | BullMQ email sync worker |
| `worker-document-parse` | `npm run worker:documents` | BullMQ document parse worker |

Health check: `GET /api/health` (⏳ TODO: implement endpoint)

---

## Key commands

```bash
npm run dev                                      # Next.js dev server
npm run worker:email                             # email sync worker
npm run worker:documents                         # document parse worker
npx prisma migrate dev --name <semantic-name>    # create migration
npx prisma generate                              # regenerate client
npx prisma studio                                # database GUI
npx tsc --noEmit                                 # type check
npm run lint                                     # lint
npm run test                                     # run tests
```
