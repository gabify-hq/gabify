/**
 * Polling cadence policy (§1.3): accounts with a healthy webhook are polled as
 * a fallback every 5 minutes; accounts without one keep the 30s cadence.
 * The scheduler ticks every 30s — webhook-backed accounts poll every 10th tick.
 */

export const WEBHOOK_POLL_EVERY_N_TICKS = 10

export interface WebhookStateFields {
  provider: string
  outlookSubscriptionId: string | null
  outlookSubscriptionExpiry: Date | null
  pubSubSubscription: string | null
  gmailWatchExpiry: Date | null
}

export function hasActiveWebhook(account: WebhookStateFields, now: Date): boolean {
  if (account.provider === 'OUTLOOK') {
    return (
      account.outlookSubscriptionId !== null &&
      account.outlookSubscriptionExpiry !== null &&
      account.outlookSubscriptionExpiry > now
    )
  }
  if (account.provider === 'GMAIL') {
    return account.gmailWatchExpiry !== null && account.gmailWatchExpiry > now
  }
  return false
}

export function shouldPollOnTick(account: WebhookStateFields, tick: number, now: Date): boolean {
  if (!hasActiveWebhook(account, now)) return true
  return tick % WEBHOOK_POLL_EVERY_N_TICKS === 0
}
