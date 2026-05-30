---
description: Security rules for Gabify — applied to all auth, storage, webhook, and API work
---

# Security Rules

## R2 / Storage
- NEVER generate public URLs for attachments — always `getSignedUrl()` with short expiry (max 1 hour)
- NEVER store file paths that reveal internal structure in API responses
- Bucket must remain private — no public access policy

## OAuth Credentials
- NEVER log access tokens, refresh tokens, or client secrets
- NEVER store raw tokens in the database — encrypt with AES-256 before persistence
- Token fields in Prisma schema use `String` but are always encrypted at the service layer

## Webhooks
- Microsoft Graph change notifications: verify HMAC-SHA256 `clientState` on every request
- Gmail Pub/Sub: verify Google JWT signature before processing
- Return 200 immediately on validation failure (do not reveal why it failed)
- Always process webhook payloads in a BullMQ job — never inline in the HTTP handler

## AuditLog
- Every AI-generated action (draft, classification, client match) MUST create an `AuditLog` entry BEFORE any external action
- AuditLog fields required: `officeId`, `userId` (or null if system), `action`, `entityType`, `entityId`, `aiGenerated: true`, `approvedBy`, `approvedAt`
- Never delete AuditLog entries — they are immutable

## API Routes
- All API routes validate request body with Zod before touching the database
- Auth check on every route: `const session = await getServerSession()` — return 401 if null
- Rate limiting on webhook endpoints

## Environment Variables
- NEVER hardcode secrets — always `process.env.VAR_NAME`
- NEVER commit `.env` — only `.env.example` with placeholder values
