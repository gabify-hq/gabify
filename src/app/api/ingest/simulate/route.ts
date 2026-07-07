import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { processInboundIngest } from '@/server/services/ingest-service'

/**
 * Dev/test inbound adapter (A5): simulates receiving an email on the dedicated
 * ingest mailbox. Protected by INGEST_TEST_SECRET; disabled entirely without it
 * and always disabled in production. The production adapter is Resend Inbound —
 * activation steps documented in RELEASE_NOTES_V2.md.
 */

const payloadSchema = z.object({
  to: z.array(z.string()).min(1),
  from: z.string(),
  subject: z.string().nullable().default(null),
  authentication: z
    .object({ spf: z.string(), dkim: z.string(), dmarc: z.string() })
    .default({ spf: 'pass', dkim: 'pass', dmarc: 'pass' }),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        contentBase64: z.string(),
        mimeType: z.string().optional(),
      })
    )
    .default([]),
})

export async function POST(request: NextRequest) {
  const secret = process.env.INGEST_TEST_SECRET
  if (!secret || process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (request.headers.get('x-ingest-test-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = payloadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 422 })
  }

  const result = await processInboundIngest(parsed.data)
  return NextResponse.json({ success: true, data: result })
}
