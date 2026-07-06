import { randomInt } from 'crypto'
import { prisma } from '@/lib/prisma'
import { checkIngestRateLimit } from '@/server/rate-limit'
import { getDocumentParseQueue, DEFAULT_JOB_OPTIONS } from '@/lib/redis'
import { validateUploadedFile, createManualDocument } from './upload-service'
import type { ClientIngestAlias } from '@prisma/client'

/**
 * Dedicated per-client ingest addresses (S2.6 hardened by A5).
 *
 * Routing is logical: any inbound provider (Resend Inbound in production, the
 * dev simulate endpoint in tests) normalises the message into
 * InboundIngestPayload and calls processInboundIngest.
 */

// Alphabet without ambiguous glyphs (no 0/1/l/o/i) — token ≥12 chars (A5: ≥10)
const TOKEN_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const TOKEN_LENGTH = 12

function generateToken(): string {
  let token = ''
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    token += TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)]
  }
  return token
}

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'cliente'
}

export async function createIngestAlias(params: {
  officeId: string
  clientId: string
}): Promise<ClientIngestAlias> {
  const client = await prisma.client.findFirstOrThrow({
    where: { id: params.clientId, officeId: params.officeId, deletedAt: null },
    select: { name: true },
  })
  return prisma.clientIngestAlias.create({
    data: {
      officeId: params.officeId,
      clientId: params.clientId,
      alias: `${slugify(client.name)}-${generateToken()}`,
    },
  })
}

/** Regenerates the alias — the old address dies immediately (A5). */
export async function regenerateIngestAlias(params: {
  officeId: string
  clientId: string
}): Promise<ClientIngestAlias> {
  await prisma.clientIngestAlias.updateMany({
    where: { officeId: params.officeId, clientId: params.clientId, active: true },
    data: { active: false },
  })
  return createIngestAlias(params)
}

// ── Inbound processing ───────────────────────────────────────────────────────

export interface InboundIngestPayload {
  to: string[]
  from: string
  subject: string | null
  /** Authentication results as reported by the inbound provider (A5) */
  authentication: { spf: string; dkim: string; dmarc: string }
  attachments: Array<{ filename: string; contentBase64: string; mimeType?: string }>
}

export interface IngestResult {
  accepted: boolean
  quarantined: boolean
  reason?: 'UNKNOWN_ADDRESS' | 'RATE_LIMITED' | 'NO_ATTACHMENTS'
  documentIds: string[]
}

export async function processInboundIngest(payload: InboundIngestPayload): Promise<IngestResult> {
  const domain = (process.env.INGEST_DOMAIN ?? '').toLowerCase()

  // Resolve the target alias from To/CC local parts
  let alias: (ClientIngestAlias & { client: { allowedSenderDomains: string[] } }) | null = null
  let matchedAddress = ''
  for (const recipient of payload.to) {
    const [localPart, recipientDomain] = recipient.toLowerCase().split('@')
    if (!recipientDomain || (domain && recipientDomain !== domain)) continue
    const found = await prisma.clientIngestAlias.findFirst({
      where: { alias: localPart, active: true },
      include: { client: { select: { allowedSenderDomains: true } } },
    })
    if (found) {
      alias = found
      matchedAddress = recipient.toLowerCase()
      break
    }
  }

  if (!alias) {
    console.warn(`[ingest] no active alias for recipients ${payload.to.join(', ')} — rejected`)
    return { accepted: false, quarantined: false, reason: 'UNKNOWN_ADDRESS', documentIds: [] }
  }

  // Rate limit per ingest address (A5: parsing IA costs real money)
  const rate = checkIngestRateLimit(matchedAddress)
  if (!rate.allowed) {
    console.warn(`[ingest] rate limit exceeded for ${matchedAddress}`)
    return { accepted: false, quarantined: false, reason: 'RATE_LIMITED', documentIds: [] }
  }

  // Quarantine decisions (A5): hard DMARC failure or sender outside the allowlist
  let quarantined = false
  if (payload.authentication.dmarc.toLowerCase() === 'fail') {
    quarantined = true
  }
  const senderDomain = payload.from.toLowerCase().split('@')[1] ?? ''
  const allowlist = alias.client.allowedSenderDomains
  if (allowlist.length > 0 && !allowlist.map((d) => d.toLowerCase()).includes(senderDomain)) {
    quarantined = true
  }

  const queue = getDocumentParseQueue()
  const documentIds: string[] = []

  for (const attachment of payload.attachments) {
    const buffer = Buffer.from(attachment.contentBase64, 'base64')
    const validation = await validateUploadedFile(buffer, attachment.filename)
    if (!validation.ok) {
      console.warn(`[ingest] attachment "${attachment.filename}" rejected: ${validation.error}`)
      continue
    }

    const document = await createManualDocument({
      officeId: alias.officeId,
      uploadedByUserId: null,
      filename: attachment.filename,
      mimeType: validation.mimeType,
      buffer,
      clientId: alias.clientId,
      flags: quarantined ? ['SENDER_UNVERIFIED'] : [],
      status: quarantined ? 'NEEDS_REVIEW' : 'PENDING_CLASSIFICATION',
    })
    documentIds.push(document.id)

    // Quarantined documents go to the review queue UNPROCESSED — never parsed
    // as trusted, never silently dropped (A5)
    if (!quarantined) {
      await queue.add(
        'parse-document',
        { documentId: document.id, officeId: alias.officeId },
        DEFAULT_JOB_OPTIONS
      )
    }
  }

  if (documentIds.length === 0 && payload.attachments.length === 0) {
    return { accepted: true, quarantined, reason: 'NO_ATTACHMENTS', documentIds }
  }
  return { accepted: true, quarantined, documentIds }
}
