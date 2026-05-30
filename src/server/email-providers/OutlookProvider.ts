import type { EmailProvider } from './EmailProvider'
import type { SyncResult, WatchResult, EmailDraft } from '@/types'
import type { EmailAccount } from '@prisma/client'

/**
 * OutlookProvider — Microsoft Graph API implementation.
 *
 * Key concepts:
 * - Delta queries: GET /me/mailFolders/inbox/messages/delta
 *   Returns messages changed since last sync. Stores deltaLink for next call.
 * - Change notifications: POST /subscriptions
 *   Webhook subscription for real-time notifications. Max lifetime: 4230 minutes.
 *   Must renew before expiry.
 * - Token refresh: accessToken expires in ~1h. Use refreshToken to get new one.
 *
 * Docs: https://learn.microsoft.com/en-us/graph/delta-query-messages
 */
export class OutlookProvider implements EmailProvider {
  private account: EmailAccount

  constructor(account: EmailAccount) {
    this.account = account
  }

  async syncInbox(): Promise<SyncResult> {
    // TODO: implement Microsoft Graph delta query sync
    // 1. Check token expiry, refresh if needed (refreshOutlookToken)
    // 2. GET /me/mailFolders/inbox/messages/delta?$deltaToken=<deltaLink>
    //    If no deltaLink: GET /me/mailFolders/inbox/messages/delta (initial sync)
    // 3. For each message: upsert InboundEmail + EmailThread in DB
    // 4. For each message with attachments: queue document-parse job
    // 5. Store updated deltaLink from response @odata.deltaLink
    // 6. Return SyncResult with new deltaLink

    throw new Error('TODO: OutlookProvider.syncInbox not implemented')
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
    // TODO: implement
    // 1. Check token expiry, refresh if needed
    // 2. GET /me/messages/{messageId}/attachments/{attachmentId}/$value
    // 3. Return Buffer

    throw new Error('TODO: OutlookProvider.getAttachment not implemented')
  }

  async sendReply(messageId: string, draft: EmailDraft): Promise<void> {
    // TODO: implement
    // 1. Check token expiry, refresh if needed
    // 2. POST /me/messages/{messageId}/reply
    //    Body: { message: { body: { contentType, content } }, comment }
    // 3. Update InboundEmail status to PROCESSED

    throw new Error('TODO: OutlookProvider.sendReply not implemented')
  }

  async watchChanges(webhookUrl: string): Promise<WatchResult> {
    // TODO: implement
    // 1. POST /subscriptions
    //    changeType: "created,updated"
    //    notificationUrl: webhookUrl
    //    resource: "me/mailFolders/inbox/messages"
    //    expirationDateTime: now + 4230 minutes (max)
    //    clientState: HMAC secret for validation
    // 2. Store subscriptionId + expiresAt on EmailAccount
    // 3. Schedule renewal job before expiry

    throw new Error('TODO: OutlookProvider.watchChanges not implemented')
  }

  // ── Private helpers ──

  private async refreshTokenIfNeeded(): Promise<string> {
    // TODO: check this.account.outlookTokenExpiry
    // If expired or within 5 min: POST to https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
    // Update EmailAccount with new tokens (encrypted)
    throw new Error('TODO: token refresh not implemented')
  }

  private getGraphClient() {
    // TODO: return @microsoft/microsoft-graph-client Client instance
    // Use this.account.outlookAccessToken (decrypt first)
    throw new Error('TODO: Graph client not implemented')
  }
}
