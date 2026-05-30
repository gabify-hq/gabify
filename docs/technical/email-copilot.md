# Module 1 — Email Copilot

Technical documentation for the Email Copilot module.
Cross-cutting concerns (stack, security, deploy) are in `OVERVIEW.md`.

---

## What this module does

Reads the accountant's inbox, classifies emails by client, extracts and archives attachments, classifies documents by content using Claude AI, and generates draft replies for accountant approval.

---

## Data flow

```
External inbox (Outlook / Gmail)
        │
        ▼  webhook notification
/api/webhooks/graph  or  /api/webhooks/gmail
        │
        ▼  queue job
BullMQ: email-sync queue
        │
        ▼
email-sync.worker
  ├── EmailProvider.syncInbox()
  │     └── upsert InboundEmail + EmailThread
  ├── matchClientByEmail()
  │     └── update InboundEmail.clientId
  └── queue attachments
        │
        ▼
BullMQ: document-parse queue
        │
        ▼
document-parse.worker
  ├── EmailProvider.getAttachment() → Buffer
  ├── uploadToR2(key, buffer)
  ├── extractText(buffer, mimeType)          ← TODO
  ├── classifyDocument(text) → Claude API
  ├── upsert Document with classification
  └── create AuditLog (aiGenerated: true)
        │
        ▼
Accountant dashboard
  ├── sees: inbox list, pending documents, draft actions
  └── approves / edits / rejects EmailAction
        │
        ▼  only after approval
EmailProvider.sendReply()
AuditLog updated (approvedBy, approvedAt)
```

---

## EmailProvider abstraction

Single interface for all providers. Business logic never imports provider implementations.

```typescript
interface EmailProvider {
  syncInbox(): Promise<SyncResult>
  getAttachment(messageId: string, attachmentId: string): Promise<Buffer>
  sendReply(messageId: string, draft: EmailDraft): Promise<void>
  watchChanges(webhookUrl: string): Promise<WatchResult>
}

// Only place that branches on provider type
createEmailProvider(account: EmailAccount): EmailProvider
```

### Microsoft Graph (Outlook)

Priority provider — most common in Portuguese accounting firms.

| Concern | Implementation |
|---|---|
| Sync method | Delta queries: `GET /me/mailFolders/inbox/messages/delta` |
| Incremental state | `deltaLink` stored on `EmailAccount.deltaLink` |
| Real-time | Graph change notifications subscription |
| Webhook validation | `clientState` HMAC against `GRAPH_WEBHOOK_SECRET` |
| Token | OAuth2 Authorization Code Flow, stored encrypted |
| Subscription expiry | Max 4230 minutes — renewal job needed (⏳ TODO) |

**Delta query flow:**
```
First sync:  GET /me/mailFolders/inbox/messages/delta
             → pages of messages + @odata.nextLink
             → final page has @odata.deltaLink → store it

Next sync:   GET /me/mailFolders/inbox/messages/delta?$deltaToken=<stored>
             → only changes since last call
             → new deltaLink → overwrite stored
```

### Gmail

| Concern | Implementation |
|---|---|
| Sync method | `users.history.list` with `startHistoryId` |
| Incremental state | `historyId` stored on `EmailAccount.historyId` |
| Real-time | Gmail Pub/Sub push to `/api/webhooks/gmail` |
| Webhook validation | Google-signed JWT verification (⏳ TODO) |
| Token | OAuth2 Authorization Code Flow, stored encrypted |
| Watch expiry | 7 days — renewal job needed (⏳ TODO) |

### IMAP

Compile-safe stub. All methods throw `Error('TODO')`. Satisfies the interface but produces no output. Used only as a fallback for non-Outlook/Gmail mailboxes.

---

## Client matching

Matches `InboundEmail.fromEmail` to a `Client` record.

```
Exact email match → Client.knownEmails   → score 1.0, matchedBy 'known_email'
Domain match      → Client.emailDomains  → score 0.8, matchedBy 'domain'
No match                                 → score 0.0, matchedBy 'none'
```

All comparisons case-insensitive. Result stored as `clientId` + `clientMatchScore` on `InboundEmail`.

---

## Document classification

Claude API classifies document content — never filename.

**Prompt output schema:**
```json
{
  "type": "INVOICE_RECEIVED",
  "confidence": 0.92,
  "reasoning": "Fatura de fornecedor com NIF e valor de IVA discriminado",
  "extractedDate": "15/04/2025",
  "extractedAmount": 1250.00,
  "extractedVATNumber": "123456789"
}
```

**Confidence thresholds:**

| Range | Status | Behaviour |
|---|---|---|
| ≥ 0.85 | `CLASSIFIED` | Auto-classified, shown to accountant |
| 0.60–0.84 | `NEEDS_REVIEW` | Classified but requires confirmation |
| < 0.60 | `NEEDS_REVIEW` | Manual classification required |

**Supported document types:**
`INVOICE_RECEIVED`, `INVOICE_ISSUED`, `RECEIPT`, `BANK_STATEMENT`, `PAYROLL`, `TAX_DOCUMENT`, `AT_COMMUNICATION`, `SOCIAL_SECURITY`, `CONTRACT`, `BALANCE_SHEET`, `INCOME_STATEMENT`, `OTHER`

**Text extraction (⏳ TODO):**

| MIME type | Library |
|---|---|
| `application/pdf` | pdf-parse |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | mammoth |
| `image/*` | Claude Vision API |
| `text/plain` | `buffer.toString('utf-8')` |

---

## R2 storage

**Key structure:** `<officeId>/<clientId>/<messageId>/<attachmentId>.<ext>`

Client segment falls back to `unmatched` when `clientId` is null at upload time. Once the email is matched to a client, the key is not updated — the `Document.clientId` field is updated instead.

**Access:** all reads via `getSignedDownloadUrl(key, expiresInSeconds)`. Max expiry: 3600s (1 hour) for documents, 900s (15 min) for previews.

---

## Job queues

### email-sync

| Property | Value |
|---|---|
| Queue name | `email-sync` |
| Worker file | `src/queues/email-sync.worker.ts` |
| Concurrency | 5 |
| Triggered by | Webhook (Graph/Gmail) or scheduled |
| Retries | 3, exponential backoff from 5s |
| Idempotent | Yes — upsert on `providerMessageId` |

Job payload: `{ emailAccountId, officeId, triggerSource }`

### document-parse

| Property | Value |
|---|---|
| Queue name | `document-parse` |
| Worker file | `src/queues/document-parse.worker.ts` |
| Concurrency | 3 |
| Triggered by | email-sync worker |
| Retries | 3, exponential backoff from 5s |
| Idempotent | Yes — skip if `Document` already exists for attachment |

Job payload: `{ attachmentId, emailAccountId, officeId }`

---

## Webhook endpoints

### `POST /api/webhooks/graph`

1. `?validationToken` present → respond `200 text/plain` with token (Graph subscription validation)
2. Parse notification array from body
3. Verify `clientState` HMAC (⏳ TODO)
4. For each notification: find `EmailAccount`, queue `email-sync` job
5. Return `202` immediately — never process inline

### `POST /api/webhooks/gmail`

1. Decode base64 `message.data` → `{ emailAddress, historyId }`
2. Verify Google JWT (⏳ TODO)
3. Find `EmailAccount` by `email === emailAddress`
4. Queue `email-sync` with `jobId: sync-<accountId>-<historyId>` (deduplication)
5. Return `200` immediately — Pub/Sub retries on non-200

---

## Schema models used by this module

`EmailAccount`, `InboundEmail`, `EmailThread`, `EmailAttachment`, `EmailAction`, `EmailReview`, `Document`, `DocumentReview`, `AuditLog`, `JobLog`

See `prisma/schema.prisma` for full field definitions.

---

## Known TODOs

| Area | TODO |
|---|---|
| `OutlookProvider` | Full Graph delta query sync implementation |
| `GmailProvider` | Full Gmail API + historyId sync implementation |
| `ImapProvider` | IMAP polling + SMTP send |
| Graph webhook | HMAC `clientState` verification |
| Gmail webhook | Google JWT verification |
| Token encryption | AES-256 encrypt/decrypt for OAuth tokens in providers |
| Text extraction | pdf-parse, mammoth, Claude Vision |
| Graph subscription renewal | Scheduled job before 4230min expiry |
| Gmail watch renewal | Scheduled job before 7-day expiry |
| Draft generation | Wire `generateEmailDraft()` into worker post-classification |
| Health check | `GET /api/health` endpoint for Railway |
