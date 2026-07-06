import type { EmailProvider } from './EmailProvider'
import type { SyncResult, WatchResult, EmailDraft } from '@/types'
import type { EmailAccount } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { encryptToken, decryptToken } from '@/lib/crypto'

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Shape of a Gmail message resource (abbreviated fields we use).
 */
interface GmailMessage {
  id: string
  threadId: string
  payload: GmailMessagePart
  historyId?: string
}

interface GmailMessagePart {
  headers?: GmailHeader[]
  parts?: GmailMessagePart[]
  mimeType?: string
  body?: { data?: string; attachmentId?: string; size?: number }
  filename?: string
}

interface GmailHeader {
  name: string
  value: string
}

interface GmailMessagesListResponse {
  messages?: Array<{ id: string; threadId: string }>
  nextPageToken?: string
  resultSizeEstimate?: number
}

interface GmailHistoryResponse {
  history?: Array<{
    id: string
    messagesAdded?: Array<{ message: { id: string; threadId: string } }>
  }>
  nextPageToken?: string
  historyId: string
}

interface GmailAttachmentResponse {
  data: string
  size: number
}

interface GmailWatchResponse {
  historyId: string
  expiration: string
}

interface GmailTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
}

/**
 * GmailProvider — Gmail API implementation.
 *
 * Uses historyId for incremental inbox sync and Gmail Pub/Sub for real-time
 * webhook delivery. Tokens are AES-256-CBC encrypted at rest.
 *
 * Docs: https://developers.google.com/gmail/api/guides/push
 */
export class GmailProvider implements EmailProvider {
  private readonly account: EmailAccount

  constructor(account: EmailAccount) {
    this.account = account
  }

  // ── Public interface ────────────────────────────────────────────────────────

  async syncInbox(): Promise<SyncResult> {
    const token = await this.refreshTokenIfNeeded()

    let newMessages = 0
    let skippedUpdates = 0
    let finalHistoryId: string | null = null

    if (!this.account.historyId) {
      // Initial sync: fetch last 50 messages
      const listUrl = `${GMAIL_BASE}/messages?labelIds=INBOX&maxResults=50`
      const listData = await this.gmailGet<GmailMessagesListResponse>(listUrl, token)

      const messageRefs = listData.messages ?? []

      for (const ref of messageRefs) {
        const message = await this.gmailGet<GmailMessage>(
          `${GMAIL_BASE}/messages/${ref.id}?format=full`,
          token
        )

        const result = await this.upsertMessage(message)
        if (result === 'created') {
          newMessages++
        } else {
          skippedUpdates++
        }

        // Track the highest historyId across all messages so the next
        // incremental sync starts from the true latest cursor, not just
        // the first message's (potentially stale) historyId.
        if (
          message.historyId &&
          (!finalHistoryId || BigInt(message.historyId) > BigInt(finalHistoryId))
        ) {
          finalHistoryId = message.historyId
        }
      }
    } else {
      // Incremental sync using historyId
      const historyUrl = `${GMAIL_BASE}/history?startHistoryId=${encodeURIComponent(
        this.account.historyId
      )}&historyTypes=messageAdded&labelId=INBOX`

      const historyData = await this.gmailGet<GmailHistoryResponse>(historyUrl, token)

      finalHistoryId = historyData.historyId

      const historyItems = historyData.history ?? []
      for (const item of historyItems) {
        const added = item.messagesAdded ?? []
        for (const { message: ref } of added) {
          const message = await this.gmailGet<GmailMessage>(
            `${GMAIL_BASE}/messages/${ref.id}?format=full`,
            token
          )

          const result = await this.upsertMessage(message)
          if (result === 'created') {
            newMessages++
          } else {
            skippedUpdates++
          }
        }
      }
    }

    if (finalHistoryId) {
      await prisma.emailAccount.update({
        where: { id: this.account.id },
        data: { historyId: finalHistoryId },
      })
    }

    return {
      provider: 'GMAIL',
      emailAccountId: this.account.id,
      messagesProcessed: newMessages + skippedUpdates,
      newMessages,
      errors: [],
      historyId: finalHistoryId ?? undefined,
    }
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
    const token = await this.refreshTokenIfNeeded()
    const url = `${GMAIL_BASE}/messages/${messageId}/attachments/${attachmentId}`

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      throw new Error(
        `GmailProvider.getAttachment failed: ${response.status} ${response.statusText}`
      )
    }

    const data = (await response.json()) as GmailAttachmentResponse

    // Gmail uses base64url encoding (RFC 4648)
    return Buffer.from(data.data, 'base64url')
  }

  async sendReply(messageId: string, draft: EmailDraft): Promise<void> {
    const token = await this.refreshTokenIfNeeded()

    // Fetch the original message to get thread ID and headers
    const originalMessage = await this.gmailGet<GmailMessage>(
      `${GMAIL_BASE}/messages/${messageId}?format=full`,
      token
    )

    const threadId = originalMessage.threadId
    const headers = originalMessage.payload.headers ?? []
    const messageIdHeader =
      headers.find((h) => h.name.toLowerCase() === 'message-id')?.value ?? ''
    const subject =
      headers.find((h) => h.name.toLowerCase() === 'subject')?.value ??
      draft.subject ??
      ''
    const fromHeader =
      headers.find((h) => h.name.toLowerCase() === 'from')?.value ?? ''

    const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`

    // Build RFC 2822 MIME message
    const mimeLines = [
      `To: ${fromHeader}`,
      `Subject: ${replySubject}`,
      `In-Reply-To: ${messageIdHeader}`,
      `References: ${messageIdHeader}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      draft.bodyText,
    ]

    const rawMime = mimeLines.join('\r\n')
    const rawBase64 = Buffer.from(rawMime).toString('base64url')

    const sendUrl = `${GMAIL_BASE}/messages/send`

    const response = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: rawBase64, threadId }),
    })

    if (!response.ok) {
      throw new Error(
        `GmailProvider.sendReply failed: ${response.status} ${response.statusText}`
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

  async watchChanges(_webhookUrl: string): Promise<WatchResult> {
    const token = await this.refreshTokenIfNeeded()

    const pubSubTopic = process.env.GMAIL_PUBSUB_TOPIC
    if (!pubSubTopic) {
      throw new Error('GMAIL_PUBSUB_TOPIC environment variable is not set')
    }

    const watchUrl = `${GMAIL_BASE}/watch`

    const response = await fetch(watchUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topicName: pubSubTopic,
        labelIds: ['INBOX'],
      }),
    })

    if (!response.ok) {
      throw new Error(
        `GmailProvider.watchChanges failed: ${response.status} ${response.statusText}`
      )
    }

    const data = (await response.json()) as GmailWatchResponse

    // Store the initial historyId if we don't have one yet
    if (!this.account.historyId && data.historyId) {
      await prisma.emailAccount.update({
        where: { id: this.account.id },
        data: { historyId: data.historyId },
      })
    }

    return {
      provider: 'GMAIL',
      pubSubSubscription: pubSubTopic,
      expiresAt: new Date(parseInt(data.expiration, 10)),
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async refreshTokenIfNeeded(): Promise<string> {
    const { gmailAccessToken, gmailRefreshToken, gmailTokenExpiry } = this.account

    const isExpiringSoon =
      !gmailTokenExpiry ||
      gmailTokenExpiry.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS

    if (!isExpiringSoon && gmailAccessToken) {
      return decryptToken(gmailAccessToken)
    }

    if (!gmailRefreshToken) {
      throw new Error(
        'GmailProvider: no refresh token available — re-authentication required'
      )
    }

    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    if (!clientId || !clientSecret) {
      throw new Error(
        'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables are required'
      )
    }

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: decryptToken(gmailRefreshToken),
    })

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })

    if (!response.ok) {
      throw new Error(
        `GmailProvider: token refresh failed: ${response.status} ${response.statusText}`
      )
    }

    const tokenData = (await response.json()) as GmailTokenResponse
    const newAccessToken = tokenData.access_token
    const newRefreshToken = tokenData.refresh_token ?? decryptToken(gmailRefreshToken)
    const newExpiry = new Date(Date.now() + tokenData.expires_in * 1000)

    await prisma.emailAccount.update({
      where: { id: this.account.id },
      data: {
        gmailAccessToken: encryptToken(newAccessToken),
        gmailRefreshToken: encryptToken(newRefreshToken),
        gmailTokenExpiry: newExpiry,
      },
    })

    return newAccessToken
  }

  private async gmailGet<T>(url: string, token: string): Promise<T> {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      throw new Error(
        `GmailProvider: GET failed [${url}]: ${response.status} ${response.statusText}`
      )
    }

    return response.json() as Promise<T>
  }

  private async upsertMessage(message: GmailMessage): Promise<'created' | 'updated'> {
    const headers = message.payload.headers ?? []

    const header = (name: string) =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null

    const subject = header('Subject')
    const fromRaw = header('From') ?? ''
    const dateRaw = header('Date')

    const { fromEmail, fromName } = parseFromHeader(fromRaw)
    const receivedAt = dateRaw ? new Date(dateRaw) : new Date()
    const bodyText = extractTextBody(message.payload)
    const bodyHtml = extractHtmlBody(message.payload)
    const toEmails = parseAddressList(header('To'))
    const ccEmails = parseAddressList(header('Cc'))
    const threadId = message.threadId

    // Find or create the email thread — scoped to the account's office
    let dbThreadId: string | null = null
    if (threadId) {
      const existingThread = await prisma.emailThread.findFirst({
        where: { providerThreadId: threadId, officeId: this.account.officeId },
        select: { id: true },
      })

      if (existingThread) {
        dbThreadId = existingThread.id
      } else {
        const newThread = await prisma.emailThread.create({
          data: {
            officeId: this.account.officeId,
            providerThreadId: threadId,
            subject: subject ?? null,
          },
          select: { id: true },
        })
        dbThreadId = newThread.id
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
        threadId: dbThreadId,
        subject,
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
        subject,
        fromEmail,
        fromName,
        toEmails,
        ccEmails,
        bodyText,
        bodyHtml,
        threadId: dbThreadId,
      },
      select: { id: true },
    })

    // Persist attachment metadata — document-parse worker picks these up
    const attachmentParts = extractAttachmentParts(message.payload)
    if (attachmentParts.length > 0) {
      const existingAttachments = await prisma.emailAttachment.findMany({
        where: {
          inboundEmailId: emailId,
          providerAttachmentId: { in: attachmentParts.map((p) => p.providerAttachmentId) },
        },
        select: { providerAttachmentId: true },
      })
      const existingIds = new Set(existingAttachments.map((a) => a.providerAttachmentId))

      const toCreate = attachmentParts.filter((p) => !existingIds.has(p.providerAttachmentId))
      if (toCreate.length > 0) {
        await prisma.emailAttachment.createMany({
          data: toCreate.map((p) => ({
            inboundEmailId: emailId,
            providerAttachmentId: p.providerAttachmentId,
            filename: p.filename,
            mimeType: p.mimeType,
            sizeBytes: p.sizeBytes,
          })),
          skipDuplicates: true,
        })
      }
    }

    return existing ? 'updated' : 'created'
  }
}

// ── Module-level helpers ────────────────────────────────────────────────────

/**
 * Parse a "Name <email@example.com>" or plain "email@example.com" header.
 */
function parseFromHeader(from: string): { fromEmail: string; fromName: string | null } {
  const match = from.match(/^(.+?)\s*<(.+?)>$/)
  if (match) {
    return {
      fromName: match[1].trim().replace(/^"|"$/g, '') || null,
      fromEmail: match[2].trim(),
    }
  }
  return { fromEmail: from.trim(), fromName: null }
}

/**
 * Recursively walk a Gmail message payload to find the first text/plain part.
 * Returns decoded plain-text body or null.
 */
function extractTextBody(part: GmailMessagePart): string | null {
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return Buffer.from(part.body.data, 'base64url').toString('utf-8')
  }

  if (part.parts) {
    for (const child of part.parts) {
      const result = extractTextBody(child)
      if (result !== null) return result
    }
  }

  return null
}

interface AttachmentPart {
  providerAttachmentId: string
  filename: string
  mimeType: string
  sizeBytes: number | null
}

// ADDENDUM A4: attachment ingestion limits
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024 // 25MB per attachment
const MAX_ATTACHMENTS_PER_MESSAGE = 15

/**
 * Recursively walk a Gmail message payload to find all attachment parts.
 * A part is an attachment when it has a non-empty body.attachmentId and a filename.
 * Attachments over the 25MB cap are skipped with a log; at most 15 per message (A4).
 */
function extractAttachmentParts(part: GmailMessagePart): AttachmentPart[] {
  const results = collectAttachmentParts(part).filter((p) => {
    if ((p.sizeBytes ?? 0) > MAX_ATTACHMENT_BYTES) {
      console.warn(`[gmail] attachment "${p.filename}" exceeds 25MB cap — skipped`)
      return false
    }
    return true
  })
  if (results.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    console.warn(
      `[gmail] message has ${results.length} attachments — processing first ${MAX_ATTACHMENTS_PER_MESSAGE}`
    )
  }
  return results.slice(0, MAX_ATTACHMENTS_PER_MESSAGE)
}

function collectAttachmentParts(part: GmailMessagePart): AttachmentPart[] {
  const results: AttachmentPart[] = []

  if (part.body?.attachmentId && part.filename) {
    results.push({
      providerAttachmentId: part.body.attachmentId,
      filename: part.filename,
      mimeType: part.mimeType ?? 'application/octet-stream',
      sizeBytes: part.body.size ?? null,
    })
  }

  if (part.parts) {
    for (const child of part.parts) {
      results.push(...collectAttachmentParts(child))
    }
  }

  return results
}

/**
 * Recursively walk a Gmail message payload to find the first text/html part.
 */
function extractHtmlBody(part: GmailMessagePart): string | null {
  if (part.mimeType === 'text/html' && part.body?.data) {
    return Buffer.from(part.body.data, 'base64url').toString('utf-8')
  }

  if (part.parts) {
    for (const child of part.parts) {
      const result = extractHtmlBody(child)
      if (result !== null) return result
    }
  }

  return null
}

/**
 * Parse a "Name <a@b.pt>, c@d.pt" header into a list of bare addresses.
 */
function parseAddressList(headerValue: string | null): string[] {
  if (!headerValue) return []
  return headerValue
    .split(',')
    .map((entry) => {
      const match = entry.match(/<(.+?)>/)
      return (match ? match[1] : entry).trim()
    })
    .filter((address) => address.length > 0)
}
