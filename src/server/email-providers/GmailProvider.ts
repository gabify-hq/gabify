import type { EmailProvider } from './EmailProvider'
import type { SyncResult, WatchResult, EmailDraft } from '@/types'
import type { EmailAccount } from '@prisma/client'

/**
 * GmailProvider — Gmail API implementation.
 *
 * Key concepts:
 * - Incremental sync: users.history.list with startHistoryId
 *   Returns changes since last historyId. Store new historyId after each sync.
 * - Push notifications: Gmail Pub/Sub
 *   POST /gmail/v1/users/me/watch with topicName
 *   Google publishes to Pub/Sub → Cloud Run / Railway endpoint receives push
 * - Token refresh: accessToken expires in 1h. Use refreshToken with OAuth2 client.
 *
 * Docs: https://developers.google.com/gmail/api/guides/push
 */
export class GmailProvider implements EmailProvider {
  private account: EmailAccount

  constructor(account: EmailAccount) {
    this.account = account
  }

  async syncInbox(): Promise<SyncResult> {
    // TODO: implement Gmail incremental sync
    // 1. Check token expiry, refresh if needed
    // 2. If no historyId: GET /gmail/v1/users/me/messages?labelIds=INBOX (initial sync)
    //    Store historyId from first message
    // 3. If historyId: GET /gmail/v1/users/me/history?startHistoryId={historyId}&historyTypes=messageAdded
    // 4. For each new message: GET /gmail/v1/users/me/messages/{id}?format=full
    //    Upsert InboundEmail + EmailThread in DB
    // 5. For each message with attachments: queue document-parse job
    // 6. Store new historyId from response

    throw new Error('TODO: GmailProvider.syncInbox not implemented')
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
    // TODO: implement
    // 1. Check token expiry, refresh if needed
    // 2. GET /gmail/v1/users/me/messages/{messageId}/attachments/{attachmentId}
    // 3. Decode base64url body.data → Buffer

    throw new Error('TODO: GmailProvider.getAttachment not implemented')
  }

  async sendReply(messageId: string, draft: EmailDraft): Promise<void> {
    // TODO: implement
    // 1. Check token expiry, refresh if needed
    // 2. Build RFC 2822 message with In-Reply-To and References headers
    // 3. POST /gmail/v1/users/me/messages/send
    //    Body: { raw: base64url(RFC2822 message), threadId }

    throw new Error('TODO: GmailProvider.sendReply not implemented')
  }

  async watchChanges(webhookUrl: string): Promise<WatchResult> {
    // TODO: implement
    // 1. POST /gmail/v1/users/me/watch
    //    { topicName: "projects/{project}/topics/{topic}", labelIds: ["INBOX"] }
    // 2. Store historyId from response as initial sync point
    // 3. Store pubSubSubscription on EmailAccount
    // Note: watch expires after 7 days — schedule renewal

    throw new Error('TODO: GmailProvider.watchChanges not implemented')
  }

  // ── Private helpers ──

  private async refreshTokenIfNeeded(): Promise<void> {
    // TODO: check this.account.gmailTokenExpiry
    // If expired or within 5 min: use googleapis OAuth2 client to refresh
    // Update EmailAccount with new tokens (encrypted)
    throw new Error('TODO: Gmail token refresh not implemented')
  }

  private getGmailClient() {
    // TODO: return googleapis gmail('v1') client with auth
    // Use this.account.gmailAccessToken (decrypt first)
    throw new Error('TODO: Gmail client not implemented')
  }
}
