import { Worker, type Job } from 'bullmq'
import { redisConnection, QUEUE_DOCUMENT_PARSE } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { createEmailProvider } from '@/server/email-providers'
import { uploadToR2, buildAttachmentKey } from '@/lib/r2'
import { classifyDocument } from '@/server/services/email-classification'

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
 * 7. Create AuditLog entry (aiGenerated: true)
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

    if (attachment.document) {
      console.log(`[document-parse] attachment ${attachmentId} already processed, skipping`)
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
    // TODO: implement text extraction based on mimeType
    // - PDF: use pdf-parse or pdfjs-dist
    // - DOCX: use mammoth
    // - Images: use Claude Vision or Tesseract OCR
    const textContent = await extractText(buffer, attachment.mimeType)

    // 4. Create Document record (pending classification)
    const document = await prisma.document.create({
      data: {
        attachmentId,
        clientId: attachment.inboundEmail.clientId,
        status: 'PENDING_CLASSIFICATION',
        textContent,
        r2Key,
      },
    })

    // 5. Classify with Claude AI
    const classificationResult = await classifyDocument(textContent ?? '', document.id)

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

async function extractText(buffer: Buffer, mimeType: string): Promise<string | null> {
  // TODO: implement text extraction per mimeType
  // PDF: import pdfParse from 'pdf-parse'; return (await pdfParse(buffer)).text
  // DOCX: import mammoth from 'mammoth'; return (await mammoth.extractRawText({buffer})).value
  // Images: call Claude Vision API with base64 image
  // TXT: return buffer.toString('utf-8')
  console.warn(`[document-parse] text extraction not implemented for ${mimeType}`)
  return null
}
