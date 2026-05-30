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

export { Queue, Worker, QueueEvents }
