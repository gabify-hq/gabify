import { type NextRequest, NextResponse } from 'next/server'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { prisma } from '@/lib/prisma'
import { getEmailSyncQueue, DEFAULT_JOB_OPTIONS } from '@/lib/redis'

/**
 * Gmail Pub/Sub Push Notification webhook.
 *
 * Google publishes to this endpoint when new messages arrive in watched inboxes.
 * Payload is base64-encoded JSON in request.body.message.data.
 *
 * Security: verify the Google-signed JWT in the Authorization header.
 * Google uses JWKS at https://www.googleapis.com/oauth2/v3/certs.
 * The JWT audience must match the webhook URL.
 *
 * Docs: https://developers.google.com/gmail/api/guides/push
 */

// Cache the JWKS remotely — createRemoteJWKSet handles caching internally
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs')
)

export async function POST(request: NextRequest) {
  // Fail-closed (spec rule 7): a request without a verifiable Google JWT is rejected.
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    console.warn('[gmail-webhook] missing Authorization header — rejecting')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader
  const webhookUrl =
    process.env.GMAIL_WEBHOOK_URL ??
    `${process.env.NEXTAUTH_URL}/api/webhooks/gmail`
  try {
    await jwtVerify(token, GOOGLE_JWKS, { audience: webhookUrl })
  } catch {
    console.warn('[gmail-webhook] JWT verification failed — rejecting')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: PubSubPushPayload
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Decode the Pub/Sub message
  const messageData = body.message?.data
  if (!messageData) {
    return NextResponse.json({ error: 'No message data' }, { status: 400 })
  }

  let notification: GmailPushNotification
  try {
    const decoded = Buffer.from(messageData, 'base64').toString('utf-8')
    notification = JSON.parse(decoded)
  } catch {
    return NextResponse.json({ error: 'Invalid message data' }, { status: 400 })
  }

  // Find EmailAccount by Gmail user ID (emailAddress)
  const account = await prisma.emailAccount.findFirst({
    where: {
      provider: 'GMAIL',
      email: notification.emailAddress,
    },
  })

  if (!account) {
    console.warn(`[gmail-webhook] no account found for ${notification.emailAddress}`)
    // Return 200 to avoid Pub/Sub retrying — we just don't know this email
    return NextResponse.json({}, { status: 200 })
  }

  const queue = getEmailSyncQueue()

  await queue.add(
    'sync-inbox',
    {
      emailAccountId: account.id,
      officeId: account.officeId,
      triggerSource: 'webhook',
    },
    {
      ...DEFAULT_JOB_OPTIONS,
      jobId: `sync-${account.id}-${notification.historyId}`,
      // dedup by historyId — same notification won't queue twice
    }
  )

  // Always return 200 immediately — Pub/Sub retries on non-200
  return NextResponse.json({}, { status: 200 })
}

// ── Types ──

interface PubSubMessage {
  data: string  // base64-encoded
  messageId: string
  publishTime: string
}

interface PubSubPushPayload {
  message?: PubSubMessage
  subscription?: string
}

interface GmailPushNotification {
  emailAddress: string
  historyId: string
}
