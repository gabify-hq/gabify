import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

if (!process.env.R2_ACCOUNT_ID) throw new Error('R2_ACCOUNT_ID is required')
if (!process.env.R2_ACCESS_KEY_ID) throw new Error('R2_ACCESS_KEY_ID is required')
if (!process.env.R2_SECRET_ACCESS_KEY) throw new Error('R2_SECRET_ACCESS_KEY is required')
if (!process.env.R2_BUCKET_NAME) throw new Error('R2_BUCKET_NAME is required')

export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
})

const BUCKET = process.env.R2_BUCKET_NAME

/**
 * Upload a file to R2.
 * Key pattern: <officeId>/<clientId>/<messageId>/<attachmentId>.<ext>
 */
export async function uploadToR2(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
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
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key })
  return getSignedUrl(r2, command, { expiresIn: expiresInSeconds })
}

/**
 * Delete an object from R2.
 */
export async function deleteFromR2(key: string): Promise<void> {
  await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

/**
 * Build the R2 key for an email attachment.
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
