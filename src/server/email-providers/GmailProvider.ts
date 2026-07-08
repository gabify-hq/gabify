import type { EmailProvider } from './EmailProvider'
import type { SyncResult, WatchResult, EmailDraft } from '@/types'
import type { EmailAccount } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ensureFreshGmailToken } from './token-refresh'

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
/** Cap for the full-sync rebuild — enough history without unbounded backfill. */
const FULL_SYNC_MAX_MESSAGES = 200

/** Gmail API error carrying the HTTP status — 404 on /history means the cursor expired. */
export class GmailApiError extends Error {
  constructor(
    readonly status: number,
    url: string,
    statusText: string,
  ) {
    super(`GmailProvider: GET failed [${url}]: ${status} ${statusText}`)
    this.name = 'GmailApiError'
  }
}

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

    if (!this.account.historyId) {
      return this.fullSync(token)
    }

    try {
      return await this.incrementalSync(token, this.account.historyId)
    } catch (error) {
      // Gmail returns 404 when startHistoryId is older than its retention
      // (~1 week). Never brick the account (audit F2.5/C-5): drop the cursor
      // and rebuild the watermark with a full sync — next sync is incremental.
      if (error instanceof GmailApiError && error.status === 404) {
        console.warn(
          `[gmail] historyId ${this.account.historyId} expired for account ${this.account.id} — falling back to full sync`
        )
        await prisma.emailAccount.update({
          where: { id: this.account.id },
          data: { historyId: null },
        })
        return this.fullSync(token)
      }
      throw error
    }
  }

  /**
   * Full sync: paginated INBOX listing (audit F2.5 — the old version read a
   * single page of 50). The highest message historyId becomes the watermark.
   */
  private async fullSync(token: string): Promise<SyncResult> {
    let newMessages = 0
    let skippedUpdates = 0
    let finalHistoryId: string | null = null
    let fetched = 0
    let pageToken: string | undefined

    do {
      const listUrl =
        `${GMAIL_BASE}/messages?labelIds=INBOX&maxResults=50` +
        (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '')
      const listData = await this.gmailGet<GmailMessagesListResponse>(listUrl, token)

      for (const ref of listData.messages ?? []) {
        const message = await this.gmailGet<GmailMessage>(
          `${GMAIL_BASE}/messages/${ref.id}?format=full`,
          token
        )
        const result = await this.upsertMessage(message)
        if (result === 'created') newMessages++
        else skippedUpdates++
        fetched++

        // Highest historyId across ALL messages — the true latest cursor
        if (
          message.historyId &&
          (!finalHistoryId || BigInt(message.historyId) > BigInt(finalHistoryId))
        ) {
          finalHistoryId = message.historyId
        }
      }

      pageToken = listData.nextPageToken
    } while (pageToken && fetched < FULL_SYNC_MAX_MESSAGES)

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

  /**
   * Incremental sync: follows nextPageToken until the history is exhausted
   * and ONLY then persists the cursor (audit F2.5/C-4). A crash mid-way
   * leaves the old cursor — the retry re-reads everything (upserts are
   * idempotent); pages are never silently skipped.
   */
  private async incrementalSync(token: string, startHistoryId: string): Promise<SyncResult> {
    let newMessages = 0
    let skippedUpdates = 0
    let finalHistoryId: string | null = null
    let pageToken: string | undefined

    do {
      const historyUrl =
        `${GMAIL_BASE}/history?startHistoryId=${encodeURIComponent(startHistoryId)}` +
        `&historyTypes=messageAdded&labelId=INBOX` +
        (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '')
      const historyData = await this.gmailGet<GmailHistoryResponse>(historyUrl, token)

      finalHistoryId = historyData.historyId ?? finalHistoryId

      for (const item of historyData.history ?? []) {
        for (const { message: ref } of item.messagesAdded ?? []) {
          const message = await this.gmailGet<GmailMessage>(
            `${GMAIL_BASE}/messages/${ref.id}?format=full`,
            token
          )
          const result = await this.upsertMessage(message)
          if (result === 'created') newMessages++
          else skippedUpdates++
        }
      }

      pageToken = historyData.nextPageToken
    } while (pageToken)

    // Cursor advances only after every page was consumed
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

  /** Serialized per account via pg advisory lock (audit F2.6) — see token-refresh.ts. */
  private async refreshTokenIfNeeded(): Promise<string> {
    return ensureFreshGmailToken(this.account.id)
  }

  private async gmailGet<T>(url: string, token: string): Promise<T> {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      throw new GmailApiError(response.status, url, response.statusText)
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
