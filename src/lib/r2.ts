import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// Lazy client — instantiated on first use so tests can import utility
// functions (buildAttachmentKey) without needing env vars
let _r2: S3Client | null = null

function getR2Client(): S3Client {
  if (_r2) return _r2

  if (!process.env.R2_ACCOUNT_ID) throw new Error('R2_ACCOUNT_ID is required')
  if (!process.env.R2_ACCESS_KEY_ID) throw new Error('R2_ACCESS_KEY_ID is required')
  if (!process.env.R2_SECRET_ACCESS_KEY) throw new Error('R2_SECRET_ACCESS_KEY is required')

  _r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })

  return _r2
}

function getBucket(): string {
  if (!process.env.R2_BUCKET_NAME) throw new Error('R2_BUCKET_NAME is required')
  return process.env.R2_BUCKET_NAME
}

/**
 * Upload a file to R2.
 * Key pattern: <officeId>/<clientId>/<messageId>/<attachmentId>.<ext>
 */
export async function uploadToR2(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  )
}

/**
 * Generate a signed URL for private R2 object access.
 * Default expiry: 1 hour. Never exceed 1 hour for documents.
 */
export async function getSignedDownloadUrl(
  key: string,
  expiresInSeconds = 3600
): Promise<string> {
  const command = new GetObjectCommand({ Bucket: getBucket(), Key: key })
  return getSignedUrl(getR2Client(), command, { expiresIn: expiresInSeconds })
}

/**
 * Delete an object from R2.
 */
export async function deleteFromR2(key: string): Promise<void> {
  await getR2Client().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }))
}

/**
 * Build the R2 key for an email attachment.
 * Pure function — no env vars required, safe to test directly.
 */
export function buildAttachmentKey(
  officeId: string,
  clientId: string | null,
  messageId: string,
  attachmentId: string,
  ext: string
): string {
  const clientSegment = clientId ?? 'unmatched'
  return `${officeId}/${clientSegment}/${messageId}/${attachmentId}.${ext}`
}
