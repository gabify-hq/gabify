import { Worker, type Job } from 'bullmq'
import { redisConnection, QUEUE_DOCUMENT_PARSE } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { createEmailProvider } from '@/server/email-providers'
import { uploadToR2, buildAttachmentKey } from '@/lib/r2'
import { classifyDocument, classifyImage, classifyPdfDocument, classifyFromATQR, classifyFromFilename, generateEmailDraft, type ReceivedDocument } from '@/server/services/email-classification'
import { DOCUMENT_TYPE_LABELS } from '@/lib/mock-data'
import { CLAUDE_MODEL } from '@/lib/anthropic'
import { extractText } from '@/lib/text-extractor'
import { extractQRCodeFromImage, extractQRCodeFromPDF } from '@/lib/qr-reader'
import { parseATFiscalQR } from '@/lib/at-fiscal-qr'

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
    const alreadyClassified = attachment.document && DONE_STATUSES.has(attachment.document.status)

    if (alreadyClassified) {
      console.log(`[document-parse] attachment ${attachmentId} already classified (${attachment.document!.status}), checking draft`)
      // Still attempt draft generation in case the job previously failed before reaching that step.
      // This is the idempotency fix: classification skip must not prevent draft generation.
      await checkAndGenerateDraft(attachment, officeId)
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

    // 5. Classify the document.
    //
    // Priority order:
    //   a) Filename pattern (SAFT, known formats) — authoritative, no AI needed
    //   b) AT fiscal QR code from image — machine-readable, confidence 0.99
    //   c) AT fiscal QR code from PDF — render page 1 to image, then QR extract
    //   d) Claude Vision (images) / Claude PDF native (scanned PDFs) / text (text docs)
    const isZip = attachment.filename.toLowerCase().endsWith('.zip')

    let classificationResult

    // a) Filename-based classification (SAFT, etc.)
    classificationResult = await classifyFromFilename(attachment.filename, document.id)
    if (classificationResult) {
      console.log(`[document-parse] filename pattern match for ${attachment.filename}: ${classificationResult.type}`)
    }

    if (!classificationResult) {
      if (isImage) {
        // b) AT QR code from image
        const qrData = await extractQRCodeFromImage(buffer)
        if (qrData) {
          const atData = parseATFiscalQR(qrData)
          if (atData) {
            console.log(`[document-parse] AT QR code (image) for ${attachment.filename}: ${atData.docTypeCode} €${atData.totalAmount} NIF:${atData.nifEmitter}`)
            classificationResult = await classifyFromATQR(atData, document.id)
          }
        }
        // d) Fall back to Claude Vision
        if (!classificationResult) {
          classificationResult = await classifyImage(buffer, attachment.mimeType, document.id)
        }
      } else if (isPdf) {
        // c) Try AT QR code from PDF (rendered page 1) before Claude
        const pdfQrData = await extractQRCodeFromPDF(buffer)
        if (pdfQrData) {
          const atData = parseATFiscalQR(pdfQrData)
          if (atData) {
            console.log(`[document-parse] AT QR code (PDF) for ${attachment.filename}: ${atData.docTypeCode} €${atData.totalAmount} NIF:${atData.nifEmitter}`)
            classificationResult = await classifyFromATQR(atData, document.id)
          }
        }
        // d) Fall back: scanned PDF → Claude PDF native; text PDF → text classification
        if (!classificationResult) {
          classificationResult = isScannedPdf
            ? await classifyPdfDocument(buffer, document.id)
            : await classifyDocument(textContent ?? '', document.id)
        }
      } else {
        // d) Text documents (XML, DOCX, TXT, XLSX, ZIP contents)
        classificationResult = await classifyDocument(textContent ?? '', document.id)
      }
    }

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

    // 7. Attempt draft generation if confidence threshold is met.
    // Extracted into checkAndGenerateDraft() so we can also call it from the early-exit path.
    await checkAndGenerateDraft(attachment, officeId)

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

const DRAFT_CONFIDENCE_THRESHOLD = 0.7

/**
 * Checks whether a draft should be generated for the email associated with this attachment,
 * and generates one if all conditions are met:
 *   - No draft exists yet for this email
 *   - All attachments for this email are classified
 *   - The current attachment's document has confidence >= threshold
 *
 * Safe to call multiple times — idempotent via the existingDraft check.
 */
async function checkAndGenerateDraft(
  attachment: {
    inboundEmail: {
      id: string
      subject: string | null
      fromEmail: string
      bodyText: string | null
      emailAccount: { officeId: string }
      client: { name: string } | null
    }
    document: { confidence: number | null } | null
  },
  officeId: string
): Promise<void> {
  const confidence = attachment.document?.confidence ?? 0
  if (confidence < DRAFT_CONFIDENCE_THRESHOLD) return

  const existingDraft = await prisma.emailAction.findFirst({
    where: { inboundEmailId: attachment.inboundEmail.id, type: 'DRAFT_REPLY' },
    select: { id: true },
  })
  if (existingDraft) return

  // All attachments must be classified before generating draft (for full context)
  const emailDocs = await prisma.emailAttachment.findMany({
    where: { inboundEmailId: attachment.inboundEmail.id },
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
  })

  const allClassified = emailDocs.every((a) => a.document !== null)
  if (!allClassified) {
    console.log(`[document-parse] skipping draft — not all attachments classified yet for email ${attachment.inboundEmail.id}`)
    return
  }

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
