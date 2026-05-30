import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getEmailSyncQueue, DEFAULT_JOB_OPTIONS } from '@/lib/redis'

/**
 * Gmail Pub/Sub Push Notification webhook.
 *
 * Google publishes to this endpoint when new messages arrive in watched inboxes.
 * Payload is base64-encoded JSON in request.body.message.data.
 *
 * Security: verify the Google-signed JWT in the Authorization header.
 *
 * Docs: https://developers.google.com/gmail/api/guides/push
 */
export async function POST(request: NextRequest) {
  let body: PubSubPushPayload
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // TODO: verify Google JWT signature
  // const authHeader = request.headers.get('Authorization')
  // await verifyGoogleJWT(authHeader)

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
