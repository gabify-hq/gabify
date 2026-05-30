---
description: Rules for implementing and using the EmailProvider abstraction
---

# Email Provider Rules

## The Interface is Sacred
Business logic (classification, matching, draft generation) must ONLY call methods on `EmailProvider`. Never import `OutlookProvider`, `GmailProvider`, or `ImapProvider` directly in service or queue code.

```typescript
// CORRECT
const provider = createEmailProvider(account)
await provider.syncInbox()

// WRONG — never do this
import { OutlookProvider } from './OutlookProvider'
const p = new OutlookProvider(account)
```

## Required Methods (all providers must implement)
```typescript
syncInbox(): Promise<SyncResult>           // incremental sync
getAttachment(msgId, attachId): Promise<Buffer>
sendReply(msgId, draft: EmailDraft): Promise<void>
watchChanges(webhookUrl: string): Promise<WatchResult>
```

## Provider-Specific Sync Strategy
- **Outlook**: use `deltaLink` for Graph delta queries — store in `EmailAccount.deltaLink`
- **Gmail**: use `historyId` for incremental sync — store in `EmailAccount.historyId`
- **IMAP**: polling only — no delta, no webhooks; stub with TODO

## Provider Factory
`createEmailProvider(account: EmailAccount): EmailProvider` — the only place that branches on `account.provider` enum.

## IMAP Stub Rule
IMAP implementation must compile and satisfy the interface but can throw `new Error('TODO: IMAP not implemented')` in method bodies. Never leave it as a type error.

## Credential Handling
- Outlook: `accessToken`, `refreshToken`, `tokenExpiresAt` fields
- Gmail: same OAuth fields
- IMAP: `imapHost`, `imapPort`, `imapUser`, `imapPassword` (encrypted)
- Never mix credential fields between providers
