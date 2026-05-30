# Gabify — Technical Documentation

## Architecture overview

Gabify is a Next.js 14 App Router application with a separate worker process tier. The web process handles HTTP requests; worker processes consume BullMQ job queues for async email sync and document processing.

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

External:
  Microsoft Graph API  ──► webhooks ──► /api/webhooks/graph
  Gmail Pub/Sub        ──► webhooks ──► /api/webhooks/gmail
  Cloudflare R2        ◄── upload/signed URL
  Anthropic Claude API ◄── classification + drafts
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
| Email out | Resend | latest | Magic links + notifications |
| AI | Anthropic Claude API | claude-sonnet-4-5 | Classification + drafts |
| Deploy | Railway | | web + 2 worker services |
| Tests | Vitest | latest | Co-located, no DB in unit tests |

---

## Database schema

### Core models

```
Office ──< User
Office ──< Client
Office ──< EmailAccount
Office ──< AuditLog
Office ──< JobLog

EmailAccount ──< InboundEmail
InboundEmail >── Client (nullable, matched after sync)
InboundEmail ──< EmailAttachment
InboundEmail ──< EmailAction
InboundEmail >── EmailThread

EmailAttachment ──1 Document
EmailAction ──1 EmailReview
EmailAction ──1 AuditLog (nullable)
Document ──1 DocumentReview
```

### Key design decisions

**Soft deletes** — `deletedAt DateTime?` on Office, User, Client. Hard deletes are not used. All queries filter `where: { deletedAt: null }`.

**Immutable AuditLog** — no `updatedAt` field. Entries are written once and never modified. Every AI action creates an entry before the action executes.

**Provider-specific EmailAccount fields** — rather than a separate credentials table, provider-specific fields are co-located on `EmailAccount` with null values for unused providers. This simplifies queries at the cost of some schema width.

**Encrypted credential fields** — `outlookAccessToken`, `gmailAccessToken`, `imapPassword` etc. are stored encrypted at the service layer. The schema stores `String` — encryption/decryption happens in `OutlookProvider`/`GmailProvider` before read/write.

**R2 key structure** — `<officeId>/<clientId>/<messageId>/<attachmentId>.<ext>`. Client segment falls back to `unmatched` when `clientId` is null at upload time.

---

## Email provider abstraction

All email provider logic is behind a single interface:

```typescript
interface EmailProvider {
  syncInbox(): Promise<SyncResult>
  getAttachment(messageId: string, attachmentId: string): Promise<Buffer>
  sendReply(messageId: string, draft: EmailDraft): Promise<void>
  watchChanges(webhookUrl: string): Promise<WatchResult>
}
```

`createEmailProvider(account: EmailAccount): EmailProvider` is the only place that branches on `account.provider`. Business logic never imports provider implementations directly.

### Microsoft Graph (Outlook)

- **Sync**: delta queries — `GET /me/mailFolders/inbox/messages/delta`
- **Incremental**: `deltaLink` stored on `EmailAccount.deltaLink`, passed on each subsequent call
- **Webhooks**: Graph change notifications subscription, `clientState` HMAC for validation
- **Token**: OAuth2 Authorization Code Flow, refresh token stored encrypted
- **Subscription renewal**: must renew before 4230-minute expiry (TODO: scheduled job)

### Gmail

- **Sync**: `users.history.list` with `startHistoryId`
- **Incremental**: `historyId` stored on `EmailAccount.historyId`, updated after each sync
- **Webhooks**: Gmail Pub/Sub push — `POST /api/webhooks/gmail`
- **Token**: OAuth2 Authorization Code Flow, stored encrypted
- **Watch renewal**: expires after 7 days (TODO: scheduled renewal)

### IMAP

Compile-safe stub. Methods throw `Error('TODO')`. Used as fallback for non-Outlook/Gmail mailboxes. Not yet implemented.

---

## Job queue architecture

### Queues

| Queue | Worker file | Concurrency | Triggered by |
|---|---|---|---|
| `email-sync` | `email-sync.worker.ts` | 5 | Webhook (Graph/Gmail) or scheduled |
| `document-parse` | `document-parse.worker.ts` | 3 | email-sync worker |

### email-sync job flow

```
1. Load EmailAccount from DB
2. createEmailProvider(account)
3. provider.syncInbox()
   → upserts InboundEmail + EmailThread
   → stores updated deltaLink/historyId
4. For new unmatched emails: matchClientByEmail() → update clientId
5. For new attachments: queue document-parse jobs
6. Write JobLog (COMPLETED or FAILED)
```

**Idempotency**: Graph may send duplicate notifications. Job is safe to run multiple times — `upsert` on `providerMessageId`, skip if attachment already has `r2Key`.

### document-parse job flow

```
1. Load EmailAttachment + relations
2. Idempotency check: skip if document already exists
3. provider.getAttachment() → Buffer
4. uploadToR2(key, buffer, contentType)
5. Update EmailAttachment.r2Key + uploadedAt
6. Extract text (TODO: pdf-parse / mammoth / Claude Vision)
7. Create Document (PENDING_CLASSIFICATION)
8. classifyDocument(text, documentId) → Claude API
9. Update Document with type, confidence, reasoning, extracted fields
10. Create AuditLog (aiGenerated: true) BEFORE any external action
```

---

## Document classification

Uses Claude API to classify document content (not filename).

**Prompt structure:**
```
System: accountant document classifier for Portuguese firm
User: document text (up to 8000 chars)
Expected output: JSON { type, confidence, reasoning, extractedDate, extractedAmount, extractedVATNumber }
```

**Confidence thresholds:**

| Range | Status | Action |
|---|---|---|
| ≥ 0.85 | `CLASSIFIED` | Auto-classified, shown to accountant |
| 0.60–0.84 | `NEEDS_REVIEW` | Classified but requires accountant confirmation |
| < 0.60 | `NEEDS_REVIEW` | Manual classification required |

**Portuguese document types:**
`INVOICE_RECEIVED`, `INVOICE_ISSUED`, `RECEIPT`, `BANK_STATEMENT`, `PAYROLL`, `TAX_DOCUMENT`, `AT_COMMUNICATION`, `SOCIAL_SECURITY`, `CONTRACT`, `BALANCE_SHEET`, `INCOME_STATEMENT`, `OTHER`

---

## Client matching

Matching algorithm for `InboundEmail.fromEmail` → `Client`:

```
1. Exact email match against Client.knownEmails  → score 1.0, matchedBy: 'known_email'
2. Domain match against Client.emailDomains      → score 0.8, matchedBy: 'domain'
3. No match                                      → score 0.0, matchedBy: 'none'
```

All comparisons are case-insensitive. Exact match takes priority over domain match. Result stored as `clientId` + `clientMatchScore` on `InboundEmail`.

---

## Webhook security

### Microsoft Graph

Endpoint: `POST /api/webhooks/graph`

1. Validation request: `?validationToken=<token>` → respond `200 text/plain` with token
2. Notification: verify `clientState` HMAC against `GRAPH_WEBHOOK_SECRET` (TODO)
3. Queue `email-sync` job, return `202` immediately

### Gmail Pub/Sub

Endpoint: `POST /api/webhooks/gmail`

1. Verify Google-signed JWT in `Authorization` header (TODO)
2. Decode base64 `message.data` → `{ emailAddress, historyId }`
3. Find `EmailAccount` by `email === emailAddress`
4. Queue `email-sync` job with `jobId: sync-<accountId>-<historyId>` (dedup)
5. Return `200` immediately (Pub/Sub retries on non-200)

---

## Security model

| Concern | Implementation |
|---|---|
| R2 storage | Private bucket. All access via `getSignedUrl()`, max 1h expiry |
| OAuth tokens | AES-256 encrypted before DB storage (TODO: implement encryption layer) |
| Auth | Auth.js v5 magic links. No passwords stored |
| API routes | `getServerSession()` check before any data access |
| Request validation | Zod schema on all POST/PATCH bodies |
| Audit trail | `AuditLog` entry created before every AI-triggered external action |
| Webhook validation | HMAC (Graph) and JWT (Gmail) — partially implemented, see TODOs |

---

## Testing

**Framework:** Vitest

**Conventions:**
- Tests co-located: `foo.ts` → `foo.test.ts`
- No real DB, network, or Redis in unit tests — all mocked
- Test through public interfaces, not internal implementation

**Current test coverage:**

| File | Tests | Coverage |
|---|---|---|
| `src/server/services/client-matching.ts` | 10 | ~95% |
| `src/lib/r2.ts` (`buildAttachmentKey`) | 3 | 100% |

**Run tests:**
```bash
npm run test           # run once
npm run test:watch     # watch mode
npm run test:coverage  # with coverage report
```

---

## Environment variables

See `.env.example` for the full list. Key groups:

| Group | Variables | Purpose |
|---|---|---|
| Database | `DATABASE_URL` | PostgreSQL connection |
| Redis | `REDIS_URL` | BullMQ job queue |
| Auth | `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | Auth.js session |
| R2 | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | Cloudflare R2 |
| Resend | `RESEND_API_KEY`, `FROM_EMAIL` | Outbound email |
| Anthropic | `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` | Claude API |
| Graph API | `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`, `GRAPH_WEBHOOK_SECRET` | Outlook |
| Gmail API | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_PUBSUB_TOPIC` | Gmail |
| Encryption | `ENCRYPTION_KEY` | OAuth token encryption |

---

## Known TODOs / not yet implemented

| Area | TODO |
|---|---|
| `OutlookProvider` | Full Graph delta query implementation |
| `GmailProvider` | Full Gmail API + Pub/Sub implementation |
| `ImapProvider` | IMAP polling + SMTP send |
| Webhook security | Graph HMAC verification, Gmail JWT verification |
| Token encryption | AES-256 encrypt/decrypt for OAuth tokens |
| Text extraction | PDF (pdf-parse), DOCX (mammoth), images (Claude Vision) |
| Subscription renewal | Graph subscription renewal job, Gmail watch renewal |
| Auth middleware | Session-based route protection (currently TODO in routes) |

---

## Deployment (Railway)

Three services defined in `railway.toml`:

| Service | Start command | Purpose |
|---|---|---|
| `web` | `npm run start` | Next.js HTTP server |
| `worker-email-sync` | `npm run worker:email` | BullMQ email sync worker |
| `worker-document-parse` | `npm run worker:documents` | BullMQ document parse worker |

Health check: `GET /api/health` (TODO: implement endpoint)
