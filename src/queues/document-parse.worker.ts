import { Worker, type Job } from 'bullmq'
import { redisConnection, QUEUE_DOCUMENT_PARSE } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { createEmailProvider } from '@/server/email-providers'
import { uploadToR2, buildAttachmentKey } from '@/lib/r2'
import { classifyDocument, classifyImage, classifyPdfDocument, generateEmailDraft, type ReceivedDocument } from '@/server/services/email-classification'
import { DOCUMENT_TYPE_LABELS } from '@/lib/mock-data'
import { CLAUDE_MODEL } from '@/lib/anthropic'
import { extractText } from '@/lib/text-extractor'

// Claude Vision supports these image types — everything else uses text extraction
const VISION_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

export interface DocumentParseJobData {
  attachmentId: string
  emailAccountId: string
  officeId: string
}

/**
 * BullMQ worker for document parsing and classification.
 * Processes jobs from the "document-parse" queue.
 *
 * Flow:
 * 1. Load EmailAttachment from DB
 * 2. Download attachment via provider.getAttachment()
 * 3. Upload to R2 (private, with structured key)
 * 4. Extract text content from document
 * 5. Classify with Claude AI
 * 6. Create Document record with classification result
 * 7. Create AuditLog entry for classification (aiGenerated: true)
 * 8. If confidence >= 0.7, generate draft reply + EmailAction + AuditLog
 *
 * Workers must be idempotent — check r2Key before re-uploading.
 */
export const documentParseWorker = new Worker<DocumentParseJobData>(
  QUEUE_DOCUMENT_PARSE,
  async (job: Job<DocumentParseJobData>) => {
    const { attachmentId, emailAccountId, officeId } = job.data

    // Idempotency check — skip if already processed
    const attachment = await prisma.emailAttachment.findUniqueOrThrow({
      where: { id: attachmentId },
      include: {
        inboundEmail: {
          include: { emailAccount: true, client: true },
        },
        document: true,
      },
    })

    // Skip only if fully classified/reviewed — allow retry for stuck PENDING_CLASSIFICATION
    const DONE_STATUSES = new Set(['CLASSIFIED', 'REVIEWED'])
    if (attachment.document && DONE_STATUSES.has(attachment.document.status)) {
      console.log(`[document-parse] attachment ${attachmentId} already processed (${attachment.document.status}), skipping`)
      return
    }

    // 1. Download attachment
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

    // 3. Extract text content
    const isImage = VISION_MIME_TYPES.has(attachment.mimeType)
    const isPdf = attachment.mimeType === 'application/pdf' || attachment.filename.toLowerCase().endsWith('.pdf')
    // extractText returns null for images (caller handles) and scanned PDFs (no text layer)
    const textContent = isImage ? null : await extractText(buffer, attachment.filename)
    const isScannedPdf = isPdf && textContent === null

    // 4. Create Document record (pending classification) — upsert for idempotency
    // (job may retry after classifyDocument fails; document already exists in that case)
    const document = await prisma.document.upsert({
      where: { attachmentId },
      create: {
        attachmentId,
        clientId: attachment.inboundEmail.clientId,
        status: 'PENDING_CLASSIFICATION',
        textContent,
        r2Key,
      },
      update: { textContent, r2Key },
    })

    // 5. Classify with Claude AI:
    //    - Images → Claude Vision (base64 image block)
    //    - Scanned PDFs → Claude PDF native (base64 document block, Claude does OCR)
    //    - Text documents → text classification
    const isZip = attachment.filename.toLowerCase().endsWith('.zip')
    const classificationResult = isImage
      ? await classifyImage(buffer, attachment.mimeType, document.id)
      : isScannedPdf
        ? await classifyPdfDocument(buffer, document.id)
        : await classifyDocument(textContent ?? '', document.id)

    // ZIP files contain multiple documents — extractedAmount from Claude is meaningless
    // (picks a random value from one of the inner files). Clear it to avoid misleading data.
    if (isZip && classificationResult.extractedAmount != null) {
      await prisma.document.update({
        where: { id: document.id },
        data: { extractedAmount: null },
      })
    }

    // 6. Create AuditLog entry — AI action must be logged before any external effect
    await prisma.auditLog.create({
      data: {
        officeId,
        action: 'document_classified',
        entityType: 'Document',
        entityId: document.id,
        aiGenerated: true,
        aiModel: document.aiModel,
        metadata: {
          type: classificationResult.type,
          confidence: classificationResult.confidence,
          attachmentId,
        },
      },
    })

    // 7. Wire draft generation — only if confidence is high enough and no draft exists yet
    const DRAFT_CONFIDENCE_THRESHOLD = 0.7
    if (classificationResult.confidence >= DRAFT_CONFIDENCE_THRESHOLD) {
      const existingDraft = await prisma.emailAction.findFirst({
        where: { inboundEmailId: attachment.inboundEmail.id, type: 'DRAFT_REPLY' },
        select: { id: true },
      })

      if (!existingDraft) {
        // Gather all classified documents for this email to provide context in the draft
        const emailDocs = await prisma.emailAttachment.findMany({
          where: { inboundEmailId: attachment.inboundEmail.id },
          select: {
            filename: true,
            document: {
              select: {
                type: true,
                extractedDate: true,
                extractedAmount: true,
                extractedVATNumber: true,
              },
            },
          },
        })

        const receivedDocuments: ReceivedDocument[] = emailDocs
          .filter((a) => a.document?.type)
          .map((a) => ({
            filename: a.filename,
            type: a.document!.type,
            typeLabel: DOCUMENT_TYPE_LABELS[a.document!.type as keyof typeof DOCUMENT_TYPE_LABELS] ?? a.document!.type,
            extractedDate: a.document!.extractedDate
              ? a.document!.extractedDate.toLocaleDateString('pt-PT')
              : null,
            extractedAmount: a.document!.extractedAmount ?? null,
            extractedVATNumber: a.document!.extractedVATNumber ?? null,
          }))

        await generateAndStoreDraft({
          inboundEmail: attachment.inboundEmail,
          clientName: attachment.inboundEmail.client?.name ?? null,
          officeId,
          receivedDocuments,
        })
      }
    }

    return { documentId: document.id, type: classificationResult.type }
  },
  {
    connection: redisConnection,
    concurrency: 3,
  }
)

documentParseWorker.on('failed', (job, err) => {
  console.error(`[document-parse] job ${job?.id} failed:`, err.message)
})

// ── Helpers ──

/**
 * Generates a draft reply for an inbound email and persists it as an EmailAction + AuditLog.
 * Failures are non-fatal — a draft failure must not fail the whole document parse job.
 */
async function generateAndStoreDraft(params: {
  inboundEmail: {
    id: string
    subject: string | null
    fromEmail: string
    bodyText: string | null
    emailAccount: { officeId: string }
  }
  clientName: string | null
  officeId: string
  receivedDocuments?: ReceivedDocument[]
}): Promise<void> {
  const { inboundEmail, clientName, officeId, receivedDocuments } = params

  try {
    // Look up the office owner name to use as the accountant signature
    const officeOwner = await prisma.user.findFirst({
      where: { officeId, role: 'OWNER', deletedAt: null },
      select: { name: true },
    })
    const accountantName = officeOwner?.name ?? 'O Contabilista'

    // AuditLog entry BEFORE the external AI call — per security rules
    const auditLog = await prisma.auditLog.create({
      data: {
        officeId,
        action: 'draft_generated',
        entityType: 'EmailAction',
        entityId: 'pending',
        aiGenerated: true,
        aiModel: CLAUDE_MODEL,
      },
    })

    const draftText = await generateEmailDraft({
      inboundEmailId: inboundEmail.id,
      subject: inboundEmail.subject,
      bodyText: inboundEmail.bodyText,
      clientName,
      accountantName,
      receivedDocuments,
    })

    const emailAction = await prisma.emailAction.create({
      data: {
        inboundEmailId: inboundEmail.id,
        type: 'DRAFT_REPLY',
        status: 'PENDING_REVIEW',
        draftContent: draftText,
        aiModel: CLAUDE_MODEL,
      },
    })

    // Update AuditLog with real entityId now that EmailAction is created
    await prisma.auditLog.update({
      where: { id: auditLog.id },
      data: { entityId: emailAction.id, emailActionId: emailAction.id },
    })
  } catch (err) {
    // Draft generation failure must not fail the whole job — log and continue
    console.error('[document-parse] draft generation failed:', err)
  }
}

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
