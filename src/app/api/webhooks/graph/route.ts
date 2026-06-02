import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getEmailSyncQueue, DEFAULT_JOB_OPTIONS } from '@/lib/redis'

/**
 * Microsoft Graph Change Notification webhook.
 *
 * Graph sends two types of requests:
 * 1. Validation: GET/POST with ?validationToken=<token> — respond with token as text/plain
 * 2. Notification: POST with array of change notifications in body
 *
 * Security: Graph uses the raw GRAPH_WEBHOOK_SECRET as the clientState value (not HMAC).
 * We verify each notification's clientState matches the secret exactly.
 * On mismatch: log a warning and skip that notification, but still return 202.
 * (Never reveal validation logic via HTTP status codes.)
 *
 * Docs: https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks
 */
export async function POST(request: NextRequest) {
  // 1. Handle subscription validation (Graph sends validationToken query param)
  const validationToken = request.nextUrl.searchParams.get('validationToken')
  if (validationToken) {
    // Respond with token as plain text — required by Graph to confirm endpoint
    return new NextResponse(validationToken, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  // 2. Process change notifications
  let body: GraphNotificationPayload
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const expectedClientState = process.env.GRAPH_WEBHOOK_SECRET
  const queue = getEmailSyncQueue()

  for (const notification of body.value ?? []) {
    // Verify clientState — Graph uses the raw secret as clientState (not HMAC)
    if (expectedClientState && notification.clientState !== expectedClientState) {
      console.warn('[graph-webhook] clientState mismatch — skipping notification')
      continue
    }

    const subscriptionId = notification.subscriptionId

    // Look up EmailAccount by outlookSubscriptionId first, fallback to any active OUTLOOK account
    let account = await prisma.emailAccount.findFirst({
      where: { outlookSubscriptionId: subscriptionId },
    })

    if (!account) {
      // Fallback: find any active OUTLOOK account (temporary until all accounts store subscriptionId)
      account = await prisma.emailAccount.findFirst({
        where: { provider: 'OUTLOOK', active: true },
      })
    }

    if (!account) {
      console.warn(`[graph-webhook] no account found for subscription ${subscriptionId}`)
      continue
    }

    // Queue email sync job — idempotent, safe to queue multiple times
    await queue.add(
      'sync-inbox',
      {
        emailAccountId: account.id,
        officeId: account.officeId,
        triggerSource: 'webhook',
      },
      {
        ...DEFAULT_JOB_OPTIONS,
        jobId: `sync-${account.id}-${Date.now()}`,
        delay: 2000, // small delay to let Graph finish delivering
      }
    )
  }

  // Always return 202 immediately — never process inline
  return NextResponse.json({}, { status: 202 })
}

// ── Types ──

interface GraphNotification {
  subscriptionId: string
  changeType: string
  resource: string
  clientState?: string
  resourceData?: unknown
}

interface GraphNotificationPayload {
  value?: GraphNotification[]
}
