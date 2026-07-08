import type { EmailProvider } from './EmailProvider'
import type { SyncResult, WatchResult, EmailDraft } from '@/types'
import type { EmailAccount } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ensureFreshOutlookToken } from './token-refresh'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const WEBHOOK_LIFETIME_MINUTES = 4230

// ADDENDUM A4: attachment ingestion limits
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024 // 25MB per attachment
const MAX_ATTACHMENTS_PER_MESSAGE = 15

interface GraphRecipient {
  emailAddress?: { address?: string; name?: string }
}

/**
 * Shape of a message returned by Microsoft Graph delta queries.
 */
interface GraphMessage {
  id: string
  subject?: string
  from?: { emailAddress?: { address?: string; name?: string } }
  toRecipients?: GraphRecipient[]
  ccRecipients?: GraphRecipient[]
  receivedDateTime?: string
  hasAttachments?: boolean
  body?: { content?: string; contentType?: string }
  conversationId?: string
}

interface GraphAttachment {
  '@odata.type'?: string
  id: string
  name?: string
  contentType?: string
  size?: number
  isInline?: boolean
  contentId?: string
}

interface GraphAttachmentsResponse {
  value: GraphAttachment[]
}

interface GraphDeltaResponse {
  value: GraphMessage[]
  '@odata.nextLink'?: string
  '@odata.deltaLink'?: string
}

interface GraphSubscriptionResponse {
  id: string
  expirationDateTime: string
}

/**
 * OutlookProvider — Microsoft Graph API implementation.
 *
 * Uses delta queries for incremental inbox sync and Graph change notifications
 * for real-time webhook delivery. Tokens are AES-256-CBC encrypted at rest.
 *
 * Docs: https://learn.microsoft.com/en-us/graph/delta-query-messages
 */
export class OutlookProvider implements EmailProvider {
  private readonly account: EmailAccount

  constructor(account: EmailAccount) {
    this.account = account
  }

  // ── Public interface ────────────────────────────────────────────────────────

  async syncInbox(): Promise<SyncResult> {
    const token = await this.refreshTokenIfNeeded()

    let url: string
    if (this.account.deltaLink) {
      url = `${GRAPH_BASE}/me/mailFolders/inbox/messages/delta?$deltaToken=${encodeURIComponent(this.account.deltaLink)}`
    } else {
      url = `${GRAPH_BASE}/me/mailFolders/inbox/messages/delta?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,hasAttachments,body,conversationId`
    }

    let newMessages = 0
    let skippedUpdates = 0
    let finalDeltaLink: string | null = null

    while (url) {
      const response = await this.graphGet<GraphDeltaResponse>(url, token)

      for (const message of response.value) {
        const upserted = await this.upsertMessage(message, token)
        if (upserted === 'created') {
          newMessages++
        } else {
          skippedUpdates++
        }
      }

      if (response['@odata.deltaLink']) {
        finalDeltaLink = this.extractDeltaToken(response['@odata.deltaLink'])
        url = ''
      } else if (response['@odata.nextLink']) {
        url = response['@odata.nextLink']
      } else {
        url = ''
      }
    }

    if (finalDeltaLink) {
      await prisma.emailAccount.update({
        where: { id: this.account.id },
        data: { deltaLink: finalDeltaLink },
      })
    }

    return {
      provider: 'OUTLOOK',
      emailAccountId: this.account.id,
      messagesProcessed: newMessages + skippedUpdates,
      newMessages,
      errors: [],
      deltaLink: finalDeltaLink ?? undefined,
    }
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
    const token = await this.refreshTokenIfNeeded()
    const url = `${GRAPH_BASE}/me/messages/${messageId}/attachments/${attachmentId}/$value`

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      throw new Error(
        `OutlookProvider.getAttachment failed: ${response.status} ${response.statusText}`
      )
    }

    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  async sendReply(messageId: string, draft: EmailDraft): Promise<void> {
    const token = await this.refreshTokenIfNeeded()
    const url = `${GRAPH_BASE}/me/messages/${messageId}/reply`

    const body = {
      message: {
        body: {
          contentType: 'Text',
          content: draft.bodyText,
        },
      },
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(
        `OutlookProvider.sendReply failed: ${response.status} ${response.statusText}`
      )
    }

    await prisma.inboundEmail.updateMany({
      where: {
        emailAccountId: this.account.id,
        providerMessageId: messageId,
      },
      data: { status: 'PROCESSED' },
    })
  }

  async watchChanges(webhookUrl: string): Promise<WatchResult> {
    const token = await this.refreshTokenIfNeeded()
    const url = `${GRAPH_BASE}/subscriptions`

    const webhookSecret = process.env.GRAPH_WEBHOOK_SECRET
    if (!webhookSecret) {
      throw new Error('GRAPH_WEBHOOK_SECRET environment variable is not set')
    }

    const expirationDateTime = new Date(
      Date.now() + WEBHOOK_LIFETIME_MINUTES * 60 * 1000
    ).toISOString()

    const body = {
      changeType: 'created,updated',
      notificationUrl: webhookUrl,
      resource: 'me/mailFolders/inbox/messages',
      expirationDateTime,
      clientState: webhookSecret,
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(
        `OutlookProvider.watchChanges failed: ${response.status} ${response.statusText}`
      )
    }

    const data = (await response.json()) as GraphSubscriptionResponse

    return {
      provider: 'OUTLOOK',
      subscriptionId: data.id,
      expiresAt: new Date(data.expirationDateTime),
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /** Serialized per account via pg advisory lock (audit F2.6) — see token-refresh.ts. */
  private async refreshTokenIfNeeded(): Promise<string> {
    return ensureFreshOutlookToken(this.account.id)
  }

  private async graphGet<T>(url: string, token: string): Promise<T> {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      throw new Error(
        `OutlookProvider: Graph GET failed [${url}]: ${response.status} ${response.statusText}`
      )
    }

    return response.json() as Promise<T>
  }

  private async upsertMessage(message: GraphMessage, token: string): Promise<'created' | 'updated'> {
    const fromEmail = message.from?.emailAddress?.address ?? ''
    const fromName = message.from?.emailAddress?.name ?? null
    const receivedAt = message.receivedDateTime
      ? new Date(message.receivedDateTime)
      : new Date()
    const isHtmlBody = message.body?.contentType?.toLowerCase() === 'html'
    const bodyHtml = isHtmlBody ? message.body?.content ?? null : null
    const bodyText = isHtmlBody
      ? stripHtml(message.body?.content ?? '')
      : message.body?.content ?? null
    const toEmails = extractAddresses(message.toRecipients)
    const ccEmails = extractAddresses(message.ccRecipients)

    // Find or create the thread when we have a conversationId — scoped to the
    // account's office (threads are never shared across tenants)
    let threadId: string | null = null
    if (message.conversationId) {
      const existingThread = await prisma.emailThread.findFirst({
        where: {
          providerThreadId: message.conversationId,
          officeId: this.account.officeId,
        },
        select: { id: true },
      })

      if (existingThread) {
        threadId = existingThread.id
      } else {
        const newThread = await prisma.emailThread.create({
          data: {
            officeId: this.account.officeId,
            providerThreadId: message.conversationId,
            subject: message.subject ?? null,
          },
          select: { id: true },
        })
        threadId = newThread.id
      }
    }

    const existing = await prisma.inboundEmail.findUnique({
      where: {
        emailAccountId_providerMessageId: {
          emailAccountId: this.account.id,
          providerMessageId: message.id,
        },
      },
      select: { id: true },
    })

    const { id: emailId } = await prisma.inboundEmail.upsert({
      where: {
        emailAccountId_providerMessageId: {
          emailAccountId: this.account.id,
          providerMessageId: message.id,
        },
      },
      create: {
        emailAccountId: this.account.id,
        providerMessageId: message.id,
        threadId,
        subject: message.subject ?? null,
        fromEmail,
        fromName,
        toEmails,
        ccEmails,
        bodyText,
        bodyHtml,
        receivedAt,
        status: 'UNREAD',
      },
      update: {
        subject: message.subject ?? null,
        fromEmail,
        fromName,
        toEmails,
        ccEmails,
        bodyText,
        bodyHtml,
        threadId,
      },
      select: { id: true },
    })

    if (message.hasAttachments) {
      await this.persistAttachmentMetadata(emailId, message.id, token)
    }

    return existing ? 'updated' : 'created'
  }

  /**
   * Fetches attachment metadata from Graph and persists EmailAttachment rows.
   * File attachments only — inline images and attached messages are skipped,
   * as are attachments over the 25MB cap (A4). Download of the content stays
   * with the document-parse worker (symmetry with GmailProvider).
   */
  private async persistAttachmentMetadata(
    emailId: string,
    providerMessageId: string,
    token: string
  ): Promise<void> {
    const url = `${GRAPH_BASE}/me/messages/${providerMessageId}/attachments?$select=id,name,contentType,size,isInline,contentId`
    const response = await this.graphGet<GraphAttachmentsResponse>(url, token)

    const eligible = (response.value ?? []).filter((att) => {
      if (att['@odata.type'] !== '#microsoft.graph.fileAttachment') return false
      if (att.isInline) return false
      if ((att.size ?? 0) > MAX_ATTACHMENT_BYTES) {
        console.warn(
          `[outlook] attachment "${att.name}" on message ${providerMessageId} exceeds 25MB cap — skipped`
        )
        return false
      }
      return true
    })

    if (eligible.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      console.warn(
        `[outlook] message ${providerMessageId} has ${eligible.length} attachments — processing first ${MAX_ATTACHMENTS_PER_MESSAGE}`
      )
    }

    const toPersist = eligible.slice(0, MAX_ATTACHMENTS_PER_MESSAGE)
    if (toPersist.length === 0) return

    await prisma.emailAttachment.createMany({
      data: toPersist.map((att) => ({
        inboundEmailId: emailId,
        providerAttachmentId: att.id,
        filename: att.name ?? 'anexo',
        mimeType: att.contentType ?? 'application/octet-stream',
        sizeBytes: att.size ?? null,
      })),
      skipDuplicates: true,
    })
  }

  private extractDeltaToken(deltaLinkUrl: string): string {
    try {
      const url = new URL(deltaLinkUrl)
      const token = url.searchParams.get('$deltaToken')
      if (token) return token
    } catch {
      // fall through to return the raw value
    }
    return deltaLinkUrl
  }
}

// ── Module-level helpers ────────────────────────────────────────────────────

function extractAddresses(recipients?: GraphRecipient[]): string[] {
  return (recipients ?? [])
    .map((r) => r.emailAddress?.address ?? '')
    .filter((address) => address.length > 0)
}

/** Minimal HTML→text for message bodies — enough for classification context. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}
