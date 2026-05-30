# CLAUDE.md — Gabify

Gabify is an operational platform for Portuguese accounting firms. It sits **before** accounting software (Primavera, TOConline, Sage) — it organises operational chaos, it does not replace the accounting layer.

## Core Principle: AI as Copilot, Never Pilot

Every AI action that affects the outside world (sending emails, filing documents, notifying clients) **must be approved by the accountant first**. No exceptions.

- Drafts are generated, never sent automatically
- All AI decisions are logged in `AuditLog` with timestamp + approver
- The accountant always has 1-click approve / edit / reject

## Stack

- **Next.js 14** App Router + TypeScript (strict mode)
- **PostgreSQL** + Prisma ORM (migrations only, never `db push` in prod)
- **BullMQ** + Redis (job queues for email sync and document parsing)
- **Cloudflare R2** (attachment storage — signed URLs only, never public)
- **Auth.js v5** magic links (no passwords)
- **Resend** (outbound email)
- **Claude API** (document classification + draft generation)
- **Deploy target**: Railway

## Email Providers (priority order)

1. **Microsoft Graph API** — delta queries for incremental sync
2. **Gmail API** — Pub/Sub push notifications
3. **IMAP** — polling fallback, stub only

Always code against the `EmailProvider` interface. Never call provider-specific code from business logic.

## Key Commands

```bash
# Dev
npm run dev

# Database
npx prisma migrate dev --name <semantic-name>
npx prisma generate
npx prisma studio

# Jobs
npm run worker:email
npm run worker:documents

# Type check
npx tsc --noEmit

# Lint
npm run lint
```

## Project Structure

```
src/
  app/                    # Next.js App Router
    api/webhooks/         # Microsoft Graph + Gmail push endpoints
    dashboard/
    inbox/
    clients/
    settings/
  lib/                    # Singleton clients (prisma, r2, resend, anthropic, redis)
  server/
    email-providers/      # EmailProvider interface + implementations
    services/             # AI classification, client matching
  queues/                 # BullMQ workers
  components/             # UI components
  types/                  # Global TypeScript types
```

## Critical Rules

### Security
- R2 attachments: **always signed URLs**, never public bucket access
- OAuth tokens: stored encrypted, never logged
- Webhook endpoints: always verify signatures (Graph HMAC, Gmail JWT)
- AuditLog: every AI action must have an entry before execution

### Prisma
- Always `prisma migrate dev` with a semantic name
- Never `prisma db push` outside local dev
- After schema changes: run `prisma generate` before writing service code

### Email Provider Interface
Every provider must implement:
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
- All API routes use Zod for request validation

### BullMQ Workers
- Workers must be idempotent (safe to retry)
- Always log job start/end to `JobLog`
- Failed jobs: exponential backoff, max 3 retries

## Module 1: Email Copilot

The only module in scope right now. Other modules (Client Portal, Document Vault, etc.) are documented in `CONTEXT.md` but not being built yet.

Focus: scaffolding foundation — schema, types, client configs, provider abstraction, queue workers. No UI until foundation is solid.
