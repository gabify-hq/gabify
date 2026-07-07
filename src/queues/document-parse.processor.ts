import { Prisma, type Document } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createEmailProvider } from '@/server/email-providers'
import { uploadToR2, downloadFromR2, buildAttachmentKey } from '@/lib/r2'
import { generateEmailDraft, type ReceivedDocument } from '@/server/services/email-classification'
import { runExtractionCascade } from '@/server/services/extraction'
import { decideSplit, executeSplit } from '@/server/services/pdf-split'
import { sha256 } from '@/server/services/upload-service'
import { DOCUMENT_TYPE_LABELS } from '@/lib/document-types'
import { CLAUDE_MODEL } from '@/lib/anthropic'
import { extractText } from '@/lib/text-extractor'
import { QUEUE_DOCUMENT_PARSE } from '@/lib/redis'
import { createJobLog, updateJobLog } from './job-log'

const VISION_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const DONE_STATUSES = new Set(['CLASSIFIED', 'REVIEWED', 'SPLIT', 'PRE_VALIDATED', 'VALIDATED', 'EXPORTED'])

export interface DocumentParseJobData {
  officeId: string
  /** Email path: attachment to download from the provider */
  attachmentId?: string
  emailAccountId?: string
  /** Manual/ingest/split path: existing Document with the file already in R2 */
  documentId?: string
}

/**
 * Document parsing pipeline — one cascade for every source (S2.1: uploads run
 * the SAME pipeline as email attachments). Logs to JobLog and is idempotent.
 */
export async function processDocumentParse(
  data: DocumentParseJobData,
  jobId: string
): Promise<{ documentId: string; type: string } | undefined> {
  const jobLogId = await createJobLog(data.officeId, QUEUE_DOCUMENT_PARSE, jobId, data)

  try {
    await updateJobLog(jobLogId, 'RUNNING')
    const result = data.documentId
      ? await runParseForDocument(data.documentId, data.officeId)
      : await runParseForAttachment(data.attachmentId!, data.officeId)
    await updateJobLog(jobLogId, 'COMPLETED', result ?? { skipped: true })
    return result
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    await updateJobLog(jobLogId, 'FAILED', undefined, errMsg)
    throw error
  }
}

// ── Manual/ingest/split path ─────────────────────────────────────────────────

async function runParseForDocument(
  documentId: string,
  officeId: string
): Promise<{ documentId: string; type: string } | undefined> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, officeId },
  })
  if (!document || DONE_STATUSES.has(document.status)) return undefined
  if (!document.r2Key) throw new Error(`document ${documentId} has no r2Key`)

  const buffer = await downloadFromR2(document.r2Key)
  const filename = document.originalFilename ?? `${document.id}.bin`
  const mimeType = document.mimeType ?? 'application/octet-stream'

  const outcome = await runSharedPipeline(document, buffer, filename, mimeType)
  if (!outcome) return { documentId, type: 'SPLIT' }

  await writeClassificationAudit(officeId, documentId, outcome.type, outcome.confidence)
  return { documentId, type: outcome.type }
}

// ── Email attachment path ────────────────────────────────────────────────────

async function runParseForAttachment(
  attachmentId: string,
  officeId: string
): Promise<{ documentId: string; type: string } | undefined> {
  const attachment = await prisma.emailAttachment.findUniqueOrThrow({
    where: { id: attachmentId },
    include: {
      inboundEmail: { include: { emailAccount: true, client: true } },
      document: true,
    },
  })

  const alreadyClassified =
    attachment.document && DONE_STATUSES.has(attachment.document.status)
  if (alreadyClassified) {
    // Idempotency: classification skip must not prevent draft generation
    await maybeGenerateDraftForEmail(attachment.inboundEmail.id, officeId)
    return undefined
  }

  // 1. Download attachment from the provider
  const account = attachment.inboundEmail.emailAccount
  const provider = createEmailProvider(account)
  const buffer = await provider.getAttachment(
    attachment.inboundEmail.providerMessageId,
    attachment.providerAttachmentId ?? attachment.id
  )

  // 2. Upload to R2
  const ext = getExtension(attachment.filename, attachment.mimeType)
  const r2Key = buildAttachmentKey(
    officeId,
    attachment.inboundEmail.clientId,
    attachment.inboundEmailId,
    attachmentId,
    ext
  )
  await uploadToR2(r2Key, buffer, attachment.mimeType)
  await prisma.emailAttachment.update({
    where: { id: attachmentId },
    data: { r2Key, uploadedAt: new Date() },
  })

  // 3. Ensure the Document row (upsert — job may retry)
  const document = await prisma.document.upsert({
    where: { attachmentId },
    create: {
      officeId,
      attachmentId,
      source: 'EMAIL',
      clientId: attachment.inboundEmail.clientId,
      status: 'PENDING_CLASSIFICATION',
      r2Key,
      originalFilename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: buffer.length,
      contentSha256: sha256(buffer),
    },
    update: { r2Key },
  })

  const outcome = await runSharedPipeline(document, buffer, attachment.filename, attachment.mimeType)
  if (!outcome) return { documentId: document.id, type: 'SPLIT' }

  await writeClassificationAudit(officeId, document.id, outcome.type, outcome.confidence)

  // Draft generation only applies to the email path
  await maybeGenerateDraftForEmail(attachment.inboundEmail.id, officeId, outcome.confidence)

  return { documentId: document.id, type: outcome.type }
}

// ── Shared pipeline: text → split → extraction cascade ──────────────────────

async function runSharedPipeline(
  document: Document,
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<{ type: string; confidence: number } | null> {
  const isImage = VISION_MIME_TYPES.has(mimeType)
  const isPdf = mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')

  // Text extraction (images handled by Vision; scanned PDFs return null)
  const textContent = isImage ? null : await extractText(buffer, filename)
  let current = await prisma.document.update({
    where: { id: document.id },
    data: { textContent },
  })

  // Multi-invoice split (S2.2/A6) — PDFs only, before classification
  if (isPdf && current.parentDocumentId === null) {
    const pageCount = await countPdfPages(buffer)
    if (pageCount > 1) {
      const decision = await decideSplit({ document: current, buffer, pageCount })
      if (decision.action === 'split') {
        await executeSplit({ document: current, buffer, boundaries: decision.boundaries })
        return null // parent is SPLIT — children take over
      }
      if (decision.action === 'too-large') {
        current = await prisma.document.update({
          where: { id: current.id },
          data: { flags: { push: 'TOO_LARGE_FOR_AUTOSPLIT' } },
        })
      }
      // low-confidence: suggestion persisted in the split cache; continue as single doc
    }
  }

  const outcome = await runExtractionCascade({
    document: current,
    buffer,
    filename,
    mimeType,
  })
  return { type: outcome.type, confidence: outcome.confidence }
}

async function countPdfPages(buffer: Buffer): Promise<number> {
  try {
    const { PDFDocument } = await import('pdf-lib')
    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true })
    return pdf.getPageCount()
  } catch {
    return 1
  }
}

async function writeClassificationAudit(
  officeId: string,
  documentId: string,
  type: string,
  confidence: number
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      officeId,
      action: 'document_classified',
      entityType: 'Document',
      entityId: documentId,
      aiGenerated: true,
      metadata: { type, confidence },
    },
  })
}

// ── Draft generation (email path only) ───────────────────────────────────────

const DRAFT_CONFIDENCE_THRESHOLD = 0.7

/**
 * Generates a draft reply for the email when all conditions hold.
 * Race-safe via the EmailAction(inboundEmailId, type) unique constraint;
 * AuditLog written with the REAL id BEFORE the external AI call (A12/G5).
 */
export async function maybeGenerateDraftForEmail(
  inboundEmailId: string,
  officeId: string,
  classifiedConfidence?: number
): Promise<void> {
  const inboundEmail = await prisma.inboundEmail.findUnique({
    where: { id: inboundEmailId },
    include: {
      client: { select: { name: true } },
      attachments: {
        select: {
          filename: true,
          document: {
            select: {
              type: true,
              status: true,
              confidence: true,
              extractedDate: true,
              extractedAmount: true,
              extractedVATNumber: true,
            },
          },
        },
      },
    },
  })
  if (!inboundEmail) return

  const docs = inboundEmail.attachments
  const allClassified = docs.every((a) => a.document !== null)
  if (!allClassified) return

  const bestConfidence =
    classifiedConfidence ?? Math.max(0, ...docs.map((a) => a.document?.confidence ?? 0))
  if (bestConfidence < DRAFT_CONFIDENCE_THRESHOLD) return

  const existingDraft = await prisma.emailAction.findFirst({
    where: { inboundEmailId, type: 'DRAFT_REPLY' },
    select: { id: true },
  })
  if (existingDraft) return

  // Claim the draft slot — the unique constraint decides concurrent races
  let emailAction
  try {
    emailAction = await prisma.emailAction.create({
      data: {
        inboundEmailId,
        type: 'DRAFT_REPLY',
        status: 'PENDING_REVIEW',
        aiModel: CLAUDE_MODEL,
      },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return // another job already created the draft — exit cleanly
    }
    throw error
  }

  try {
    // AuditLog with the real entityId BEFORE the external AI call (G5 + A12)
    await prisma.auditLog.create({
      data: {
        officeId,
        action: 'draft_generated',
        entityType: 'EmailAction',
        entityId: emailAction.id,
        aiGenerated: true,
        aiModel: CLAUDE_MODEL,
        emailActionId: emailAction.id,
      },
    })

    const officeOwner = await prisma.user.findFirst({
      where: { officeId, role: 'OWNER', deletedAt: null },
      select: { name: true },
    })
    const accountantName = officeOwner?.name ?? 'O Contabilista'

    const receivedDocuments: ReceivedDocument[] = docs
      .filter((a) => a.document?.type)
      .map((a) => ({
        filename: a.filename,
        type: a.document!.type,
        typeLabel:
          DOCUMENT_TYPE_LABELS[a.document!.type as keyof typeof DOCUMENT_TYPE_LABELS] ??
          a.document!.type,
        extractedDate: a.document!.extractedDate
          ? a.document!.extractedDate.toLocaleDateString('pt-PT')
          : null,
        extractedAmount: a.document!.extractedAmount ?? null,
        extractedVATNumber: a.document!.extractedVATNumber ?? null,
      }))

    const draftText = await generateEmailDraft({
      inboundEmailId,
      subject: inboundEmail.subject,
      bodyText: inboundEmail.bodyText,
      clientName: inboundEmail.client?.name ?? null,
      accountantName,
      receivedDocuments,
    })

    await prisma.emailAction.update({
      where: { id: emailAction.id },
      data: { draftContent: draftText },
    })
  } catch (err) {
    // AI generation failed — release the slot so the retry can regenerate,
    // then PROPAGATE (audit F2.7/A-6): the job must fail so BullMQ retries
    // (max 3 via DEFAULT_JOB_OPTIONS) and the JobLog shows FAILED. Swallowing
    // here meant the draft was silently lost forever.
    // The audit entry remains as the immutable record of the attempt.
    await prisma.emailAction.delete({ where: { id: emailAction.id } }).catch(() => undefined)
    console.error('[document-parse] draft generation failed:', err)
    throw err
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getExtension(filename: string, mimeType: string): string {
  const fromFilename = filename.split('.').pop()?.toLowerCase()
  if (fromFilename && fromFilename.length <= 5) return fromFilename

  const mimeMap: Record<string, string> = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/msword': 'doc',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/tiff': 'tiff',
    'text/plain': 'txt',
  }
  return mimeMap[mimeType] ?? 'bin'
}
