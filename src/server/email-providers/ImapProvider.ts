import type { EmailProvider } from './EmailProvider'
import type { SyncResult, WatchResult, EmailDraft } from '@/types'
import type { EmailAccount } from '@prisma/client'

/**
 * ImapProvider — IMAP fallback implementation.
 *
 * STUB ONLY — compile-safe but not implemented.
 * Use for legacy/self-hosted mailboxes where Graph/Gmail are not available.
 *
 * When implementing:
 * - Use `imap` package for connection
 * - Use `mailparser` for parsing raw email messages
 * - No delta/webhook support — polling only
 * - Poll interval: configurable, default 5 minutes
 */
export class ImapProvider implements EmailProvider {
  private account: EmailAccount

  constructor(account: EmailAccount) {
    this.account = account
  }

  async syncInbox(): Promise<SyncResult> {
    // TODO: implement IMAP polling sync
    // 1. Connect to IMAP server using this.account.imapHost/Port/User/Password (decrypt)
    // 2. Open INBOX, search for UNSEEN messages
    // 3. Fetch headers + body for each unseen message
    // 4. Parse with mailparser
    // 5. Upsert InboundEmail in DB
    // 6. Mark messages as seen after processing
    throw new Error('TODO: ImapProvider.syncInbox not implemented')
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
    // TODO: implement IMAP attachment fetch
    // attachmentId for IMAP is the MIME part index
    throw new Error('TODO: ImapProvider.getAttachment not implemented')
  }

  async sendReply(messageId: string, draft: EmailDraft): Promise<void> {
    // TODO: implement via nodemailer SMTP (not IMAP)
    // IMAP is receive-only — use SMTP credentials for sending
    throw new Error('TODO: ImapProvider.sendReply not implemented')
  }

  async watchChanges(_webhookUrl: string): Promise<WatchResult> {
    // IMAP does not support webhooks.
    // Return a WatchResult indicating polling-only mode.
    return {
      provider: 'IMAP',
    }
  }
}
