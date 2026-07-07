import { prisma } from '@/lib/prisma'
import { createEmailProvider } from '@/server/email-providers'
import { QUEUE_SUBSCRIPTION_RENEWAL } from '@/lib/redis'
import { createJobLog, updateJobLog } from './job-log'

const RENEWAL_WINDOW_MS = 48 * 60 * 60 * 1000 // renew when expiring in <48h (§1.3)

/**
 * Renews Graph/Gmail webhook subscriptions expiring within 48h.
 * On renewal failure the subscription fields are cleared so the account falls
 * back to 30s polling, and the JobLog records the failure.
 */
export async function processSubscriptionRenewal(jobId: string): Promise<void> {
  // JobLog belongs to an office; use the first affected account's office, or a
  // synthetic "system" log per office as accounts are processed.
  const threshold = new Date(Date.now() + RENEWAL_WINDOW_MS)

  const expiring = await prisma.emailAccount.findMany({
    where: {
      active: true,
      OR: [
        {
          provider: 'OUTLOOK',
          outlookSubscriptionId: { not: null },
          outlookSubscriptionExpiry: { lt: threshold },
        },
        {
          provider: 'GMAIL',
          gmailWatchExpiry: { lt: threshold, not: null },
        },
      ],
    },
  })

  if (expiring.length === 0) return

  const jobLogId = await createJobLog(expiring[0].officeId, QUEUE_SUBSCRIPTION_RENEWAL, jobId, {
    accounts: expiring.map((a) => a.id),
  })
  await updateJobLog(jobLogId, 'RUNNING')

  const failures: Array<{ accountId: string; error: string }> = []
  const webhookBase = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'

  for (const account of expiring) {
    const webhookUrl =
      account.provider === 'OUTLOOK'
        ? `${webhookBase}/api/webhooks/graph`
        : `${webhookBase}/api/webhooks/gmail`
    try {
      const provider = createEmailProvider(account)
      const result = await provider.watchChanges(webhookUrl)

      if (account.provider === 'OUTLOOK') {
        await prisma.emailAccount.update({
          where: { id: account.id },
          data: {
            outlookSubscriptionId: result.subscriptionId ?? null,
            outlookSubscriptionExpiry: result.expiresAt ?? null,
          },
        })
      } else {
        await prisma.emailAccount.update({
          where: { id: account.id },
          data: {
            pubSubSubscription: result.pubSubSubscription ?? null,
            gmailWatchExpiry: result.expiresAt ?? null,
          },
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push({ accountId: account.id, error: message })
      // Clear the subscription — the account falls back to 30s polling
      await prisma.emailAccount.update({
        where: { id: account.id },
        data:
          account.provider === 'OUTLOOK'
            ? { outlookSubscriptionId: null, outlookSubscriptionExpiry: null }
            : { pubSubSubscription: null, gmailWatchExpiry: null },
      })
    }
  }

  if (failures.length > 0) {
    await updateJobLog(jobLogId, 'FAILED', { failures }, `${failures.length} renewal(s) failed`)
  } else {
    await updateJobLog(jobLogId, 'COMPLETED', { renewed: expiring.length })
  }
}
