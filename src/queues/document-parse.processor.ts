import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createEmailProvider } from '@/server/email-providers'
import { uploadToR2, buildAttachmentKey } from '@/lib/r2'
import {
  classifyDocument,
  classifyImage,
  classifyPdfDocument,
  classifyFromATQR,
  classifyFromFilename,
  generateEmailDraft,
  type ReceivedDocument,
} from '@/server/services/email-classification'
import { DOCUMENT_TYPE_LABELS } from '@/lib/document-types'
import { CLAUDE_MODEL } from '@/lib/anthropic'
import { extractText } from '@/lib/text-extractor'
import { extractQRCodeFromImage, extractQRCodeFromPDF } from '@/lib/qr-reader'
import { parseATFiscalQR } from '@/lib/at-fiscal-qr'
import { QUEUE_DOCUMENT_PARSE } from '@/lib/redis'
import { createJobLog, updateJobLog } from './job-log'

// Claude Vision supports these image types — everything else uses text extraction
const VISION_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

export interface DocumentParseJobData {
  attachmentId: string
  emailAccountId: string
  officeId: string
}

/**
 * Document parsing and classification pipeline (extracted from the worker so it
 * is testable without BullMQ/Redis).
 *
 * Flow: download → R2 upload → text extraction → classification cascade
 * (filename → AT QR → Claude) → AuditLog → draft generation. Logs to JobLog
 * (spec rule 6) and is idempotent.
 */
export async function processDocumentParse(
  data: DocumentParseJobData,
  jobId: string
): Promise<{ documentId: string; type: string } | undefined> {
  const { attachmentId, emailAccountId, officeId } = data
  const jobLogId = await createJobLog(officeId, QUEUE_DOCUMENT_PARSE, jobId, data)

  try {
    await updateJobLog(jobLogId, 'RUNNING')
    const result = await runParse(data)
    await updateJobLog(jobLogId, 'COMPLETED', result ?? { skipped: true })
    return result
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    await updateJobLog(jobLogId, 'FAILED', undefined, errMsg)
    throw error
  }
}

async function runParse(
  data: DocumentParseJobData
): Promise<{ documentId: string; type: string } | undefined> {
  const { attachmentId, officeId } = data

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
  const alreadyClassified =
    attachment.document && DONE_STATUSES.has(attachment.document.status)

  if (alreadyClassified) {
    // Still attempt draft generation in case the job previously failed before that step.
    await maybeGenerateDraftForEmail(attachment.inboundEmail.id, officeId)
    return undefined
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
  const isPdf =
    attachment.mimeType === 'application/pdf' ||
    attachment.filename.toLowerCase().endsWith('.pdf')
  const textContent = isImage ? null : await extractText(buffer, attachment.filename)
  const isScannedPdf = isPdf && textContent === null

  // 4. Create Document record (pending classification) — upsert for idempotency
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

  // 5. Classification cascade: filename → AT QR (image/PDF) → Claude
  const isZip = attachment.filename.toLowerCase().endsWith('.zip')

  let classificationResult = await classifyFromFilename(attachment.filename, document.id)

  if (!classificationResult) {
    if (isImage) {
      const qrData = await extractQRCodeFromImage(buffer)
      if (qrData) {
        const atData = parseATFiscalQR(qrData)
        if (atData) {
          classificationResult = await classifyFromATQR(atData, document.id)
        }
      }
      if (!classificationResult) {
        classificationResult = await classifyImage(buffer, attachment.mimeType, document.id)
      }
    } else if (isPdf) {
      const pdfQrData = await extractQRCodeFromPDF(buffer)
      if (pdfQrData) {
        const atData = parseATFiscalQR(pdfQrData)
        if (atData) {
          classificationResult = await classifyFromATQR(atData, document.id)
        }
      }
      if (!classificationResult) {
        classificationResult = isScannedPdf
          ? await classifyPdfDocument(buffer, document.id)
          : await classifyDocument(textContent ?? '', document.id)
      }
    } else {
      classificationResult = await classifyDocument(textContent ?? '', document.id)
    }
  }

  // ZIP files contain multiple documents — extractedAmount from Claude is meaningless
  if (isZip && classificationResult.extractedAmount != null) {
    await prisma.document.update({
      where: { id: document.id },
      data: { extractedAmount: null },
    })
  }

  // 6. AuditLog for the classification (real entityId, never updated afterwards)
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

  // 7. Attempt draft generation
  await maybeGenerateDraftForEmail(attachment.inboundEmail.id, officeId, classificationResult.confidence)

  return { documentId: document.id, type: classificationResult.type }
}

// ── Draft generation ─────────────────────────────────────────────────────────

const DRAFT_CONFIDENCE_THRESHOLD = 0.7

/**
 * Generates a draft reply for the email when all conditions hold:
 * no draft exists, every attachment is classified, and the confidence of the
 * triggering classification (or the best stored one) meets the threshold.
 *
 * Race-safe: the unique constraint EmailAction(inboundEmailId, type) guarantees
 * at most one draft even under concurrent jobs — the loser exits cleanly.
 * Audit order (A12/G5): EmailAction created first, AuditLog with the REAL id
 * BEFORE the external AI call, then the draft content is filled in.
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
    classifiedConfidence ??
    Math.max(0, ...docs.map((a) => a.document?.confidence ?? 0))
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
    // AI generation failed — release the slot so a later retry can regenerate.
    // The audit entry remains as the immutable record of the attempt.
    await prisma.emailAction.delete({ where: { id: emailAction.id } }).catch(() => undefined)
    console.error('[document-parse] draft generation failed:', err)
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
