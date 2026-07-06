import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getEmailSyncQueue, DEFAULT_JOB_OPTIONS } from '@/lib/redis'
import { checkWebhookRateLimit } from '@/server/rate-limit'

/**
 * Microsoft Graph Change Notification webhook.
 *
 * Graph sends two types of requests:
 * 1. Validation: GET/POST with ?validationToken=<token> — respond with token as text/plain
 * 2. Notification: POST with array of change notifications in body
 *
 * Security (fail-closed, spec rule 7):
 * - GRAPH_WEBHOOK_SECRET missing → 503, nothing processed.
 * - Any notification with a missing/wrong clientState → 401, nothing queued.
 * - Accounts are matched strictly by outlookSubscriptionId — no fallback.
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

  // Fail-closed: without the secret configured, the webhook refuses to operate
  const expectedClientState = process.env.GRAPH_WEBHOOK_SECRET
  if (!expectedClientState) {
    console.error('[graph-webhook] GRAPH_WEBHOOK_SECRET is not configured — refusing notifications')
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  const notifications = body.value ?? []

  // Verify EVERY clientState before queueing anything — one bad notification rejects the batch
  const allValid = notifications.every((n) => n.clientState === expectedClientState)
  if (!allValid) {
    console.warn('[graph-webhook] clientState mismatch — rejecting request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Rate limit per subscription (A11 — Microsoft IPs, never per IP)
  for (const notification of notifications) {
    const rate = checkWebhookRateLimit(`graph:${notification.subscriptionId}`)
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
      )
    }
  }

  const queue = getEmailSyncQueue()

  for (const notification of notifications) {
    const subscriptionId = notification.subscriptionId

    // Strict subscription match — the old "any active OUTLOOK account" fallback is gone
    const account = await prisma.emailAccount.findFirst({
      where: { outlookSubscriptionId: subscriptionId },
    })

    if (!account) {
      console.warn(`[graph-webhook] no account found for subscription ${subscriptionId} — skipped`)
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
