import { ReviewQueueClient } from '@/components/dashboard/review-queue-client'

interface ReviewPageProps {
  searchParams: Promise<{ status?: string; clientId?: string; flag?: string }>
}

/**
 * Document review queue (S3.1) — thin shell; the data comes from
 * GET /api/documents (S5.2) on the client, filters map 1:1 to query params.
 */
export default async function ReviewPage({ searchParams }: ReviewPageProps) {
  const { status, clientId, flag } = await searchParams
  return <ReviewQueueClient status={status} clientId={clientId} flag={flag} />
}
