import { Queue, Worker, QueueEvents } from 'bullmq'

if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required')

// BullMQ connection options — use URL string, not ioredis instance
// to avoid version conflicts between top-level ioredis and bullmq's bundled ioredis
export const redisConnection = {
  url: process.env.REDIS_URL,
  maxRetriesPerRequest: null as null, // required by BullMQ
  enableReadyCheck: false,
} as const

// Queue names
export const QUEUE_EMAIL_SYNC = 'email-sync'
export const QUEUE_DOCUMENT_PARSE = 'document-parse'
export const QUEUE_SUBSCRIPTION_RENEWAL = 'subscription-renewal'
export const QUEUE_TOCONLINE_PUSH = 'toconline-push'
export const QUEUE_TOCONLINE_PULL = 'toconline-pull'

// Default job options
export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5000,
  },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
}

// Queue instances (lazy-created)
let emailSyncQueue: Queue | null = null
let documentParseQueue: Queue | null = null
let subscriptionRenewalQueue: Queue | null = null
let toconlinePushQueue: Queue | null = null
let toconlinePullQueue: Queue | null = null

export function getEmailSyncQueue(): Queue {
  if (!emailSyncQueue) {
    emailSyncQueue = new Queue(QUEUE_EMAIL_SYNC, { connection: redisConnection })
  }
  return emailSyncQueue
}

export function getDocumentParseQueue(): Queue {
  if (!documentParseQueue) {
    documentParseQueue = new Queue(QUEUE_DOCUMENT_PARSE, { connection: redisConnection })
  }
  return documentParseQueue
}

export function getSubscriptionRenewalQueue(): Queue {
  if (!subscriptionRenewalQueue) {
    subscriptionRenewalQueue = new Queue(QUEUE_SUBSCRIPTION_RENEWAL, { connection: redisConnection })
  }
  return subscriptionRenewalQueue
}

export function getToconlinePushQueue(): Queue {
  if (!toconlinePushQueue) {
    toconlinePushQueue = new Queue(QUEUE_TOCONLINE_PUSH, { connection: redisConnection })
  }
  return toconlinePushQueue
}

export function getToconlinePullQueue(): Queue {
  if (!toconlinePullQueue) {
    toconlinePullQueue = new Queue(QUEUE_TOCONLINE_PULL, { connection: redisConnection })
  }
  return toconlinePullQueue
}

export { Queue, Worker, QueueEvents }
