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
| Framework | Next.js | 14 (App Router) | TypeScript strict mode |
| UI | Tailwind CSS + shadcn/ui | 4.x | |
| ORM | Prisma | 7.x | pg adapter, migrations only |
| Database | PostgreSQL | 15+ | |
| Job queue | BullMQ | latest | Redis-backed |
| Storage | Cloudflare R2 | S3-compatible | Private bucket, signed URLs |
| Auth | Auth.js | v5 beta | Magic links via Resend |
| Email | Resend | latest | Magic links + notifications |
| AI | Anthropic Claude API | claude-sonnet-4-5 | Classification + drafts |
| Deploy | Railway | | web + 2 worker services |
| Tests | Vitest | latest | Co-located, no real DB in unit tests |

---

## Database schema — model map

```
Office ──< User
       ──< Client
       ──< EmailAccount
       ──< AuditLog
       ──< JobLog

EmailAccount ──< InboundEmail
InboundEmail >── Client          (nullable, matched post-sync)
             ──< EmailAttachment
             ──< EmailAction
             >── EmailThread

EmailAttachment ──1 Document
EmailAction     ──1 EmailReview
                ──1 AuditLog     (nullable)
Document        ──1 DocumentReview
```

### Cross-cutting schema decisions

**Soft deletes** — `deletedAt DateTime?` on Office, User, Client. All queries filter `where: { deletedAt: null }`. No hard deletes.

**Immutable AuditLog** — no `updatedAt`. Written once, never modified. Entry created before any AI-triggered external action.

**Encrypted credential fields** — OAuth tokens and IMAP passwords stored encrypted at service layer. Schema type is `String` — encryption/decryption in provider implementations.

---

## Security model

| Concern | Implementation | Status |
|---|---|---|
| R2 storage | Private bucket. All access via `getSignedUrl()`, max 1h expiry | ✅ |
| Auth | Auth.js v5 magic links. No passwords stored anywhere | ✅ |
| API route auth | `getServerSession()` before any data access | ✅ schema |
| Request validation | Zod schema on all POST/PATCH bodies | ✅ schema |
| Audit trail | `AuditLog` entry before every AI-triggered external action | ✅ |
| OAuth token encryption | AES-256 encrypt/decrypt | ⏳ TODO |
| Graph webhook HMAC | Verify `clientState` against `GRAPH_WEBHOOK_SECRET` | ⏳ TODO |
| Gmail webhook JWT | Verify Google-signed JWT in `Authorization` header | ⏳ TODO |

---

## Testing

**Framework:** Vitest. Tests co-located with source: `foo.ts` → `foo.test.ts`.

**Rules:** no real DB, network, or Redis in unit tests. Test through public interfaces.

**Coverage targets:**

| Layer | Target |
|---|---|
| `src/server/services/` | 90% |
| `src/queues/` | 80% |
| `src/lib/` | 80% |
| `src/app/api/` routes | 70% |

**Current coverage:**

| File | Tests | Notes |
|---|---|---|
| `src/server/services/client-matching.ts` | 10 | ~95% |
| `src/lib/r2.ts` (`buildAttachmentKey`) | 3 | 100% |

```bash
npm run test            # run once
npm run test:watch      # watch mode
npm run test:coverage   # with coverage report
```

---

## Environment variables

| Group | Variables |
|---|---|
| App | `NEXTAUTH_URL`, `NEXTAUTH_SECRET` |
| Database | `DATABASE_URL` |
| Redis | `REDIS_URL` |
| Resend | `RESEND_API_KEY`, `FROM_EMAIL` |
| Anthropic | `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` |
| R2 | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` |
| Graph API | `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`, `GRAPH_WEBHOOK_SECRET` |
| Gmail API | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_PUBSUB_TOPIC` |
| Encryption | `ENCRYPTION_KEY` |

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
