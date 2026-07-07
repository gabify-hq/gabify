import { createHash } from 'crypto'
import AdmZip from 'adm-zip'
import { fileTypeFromBuffer } from 'file-type'
import { prisma } from '@/lib/prisma'
import { uploadToR2 } from '@/lib/r2'
import { getDocumentParseQueue, DEFAULT_JOB_OPTIONS } from '@/lib/redis'
import type { Document } from '@prisma/client'

/**
 * Manual/ingest document intake (S2.1) with ADDENDUM A4 protections:
 * magic-byte validation, size caps, zip-bomb defenses.
 */

export const MAX_FILE_BYTES = 25 * 1024 * 1024
export const MAX_FILES_PER_REQUEST = 10
export const ZIP_MAX_ENTRIES = 50
export const ZIP_MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024
export const ZIP_MAX_COMPRESSION_RATIO = 100

const ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'xml', 'zip'])

export type FileValidation =
  | { ok: true; kind: 'pdf' | 'image' | 'xml' | 'zip'; mimeType: string }
  | { ok: false; httpStatus: 413 | 415 | 422; error: string }

/**
 * Validates a file by MAGIC BYTES, never by extension or declared Content-Type
 * (A4). A mismatch between extension and real content is rejected and logged.
 */
export async function validateUploadedFile(buffer: Buffer, filename: string): Promise<FileValidation> {
  if (buffer.length > MAX_FILE_BYTES) {
    return { ok: false, httpStatus: 413, error: 'Ficheiro excede o limite de 25MB' }
  }

  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, httpStatus: 415, error: 'Tipo de ficheiro não suportado' }
  }

  const detected = await fileTypeFromBuffer(buffer)

  if (ext === 'pdf') {
    if (detected?.mime !== 'application/pdf') {
      console.warn(`[upload] magic-byte mismatch: "${filename}" claims PDF but is ${detected?.mime ?? 'unknown'} — rejected`)
      return { ok: false, httpStatus: 422, error: 'O conteúdo do ficheiro não corresponde a um PDF' }
    }
    return { ok: true, kind: 'pdf', mimeType: 'application/pdf' }
  }
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'png') {
    if (detected?.mime !== 'image/jpeg' && detected?.mime !== 'image/png') {
      console.warn(`[upload] magic-byte mismatch: "${filename}" is ${detected?.mime ?? 'unknown'} — rejected`)
      return { ok: false, httpStatus: 422, error: 'O conteúdo do ficheiro não corresponde a uma imagem' }
    }
    return { ok: true, kind: 'image', mimeType: detected.mime }
  }
  if (ext === 'zip') {
    if (detected?.mime !== 'application/zip') {
      return { ok: false, httpStatus: 422, error: 'O conteúdo do ficheiro não corresponde a um ZIP' }
    }
    return { ok: true, kind: 'zip', mimeType: 'application/zip' }
  }
  // XML has no magic bytes — require text starting with '<'
  const head = buffer.subarray(0, 256).toString('utf-8').trim()
  if (detected || !head.startsWith('<')) {
    return { ok: false, httpStatus: 422, error: 'O conteúdo do ficheiro não corresponde a XML' }
  }
  return { ok: true, kind: 'xml', mimeType: 'application/xml' }
}

export interface ZipInspection {
  ok: boolean
  error?: string
  entries: Array<{ name: string; data: Buffer }>
}

/**
 * Zip-bomb protection (A4): declared sizes are checked BEFORE extraction,
 * nested ZIPs are never expanded, entry count and ratio are capped.
 */
export function inspectZip(buffer: Buffer): ZipInspection {
  let zip: AdmZip
  try {
    zip = new AdmZip(buffer)
  } catch {
    return { ok: false, error: 'ZIP inválido', entries: [] }
  }

  const entries = zip.getEntries().filter((e) => !e.isDirectory)
  if (entries.length > ZIP_MAX_ENTRIES) {
    return { ok: false, error: `ZIP com mais de ${ZIP_MAX_ENTRIES} ficheiros`, entries: [] }
  }

  // Declared sizes BEFORE extraction
  let declaredTotal = 0
  let compressedTotal = 0
  for (const entry of entries) {
    declaredTotal += entry.header.size
    compressedTotal += entry.header.compressedSize
  }
  if (declaredTotal > ZIP_MAX_UNCOMPRESSED_BYTES) {
    return { ok: false, error: 'ZIP excede 100MB descomprimido', entries: [] }
  }
  if (compressedTotal > 0 && declaredTotal / compressedTotal > ZIP_MAX_COMPRESSION_RATIO) {
    return { ok: false, error: 'ZIP com rácio de compressão suspeito', entries: [] }
  }

  const extracted: Array<{ name: string; data: Buffer }> = []
  for (const entry of entries) {
    if (entry.entryName.toLowerCase().endsWith('.zip')) continue // depth 1 — never expand nested ZIPs
    extracted.push({ name: entry.entryName.split('/').pop() ?? entry.entryName, data: entry.getData() })
  }
  return { ok: true, entries: extracted }
}

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

/**
 * Creates an uploaded document (MANUAL_UPLOAD by default, PORTAL_UPLOAD for the
 * end-client portal — fase P2): R2 upload + Document row.
 * The parse pipeline picks it up via a { documentId } job.
 */
export async function createManualDocument(params: {
  officeId: string
  uploadedByUserId: string | null
  filename: string
  mimeType: string
  buffer: Buffer
  clientId: string | null
  flags?: string[]
  status?: 'PENDING_CLASSIFICATION' | 'NEEDS_REVIEW'
  source?: 'MANUAL_UPLOAD' | 'PORTAL_UPLOAD'
}): Promise<Document> {
  const document = await prisma.document.create({
    data: {
      officeId: params.officeId,
      source: params.source ?? 'MANUAL_UPLOAD',
      status: params.status ?? 'PENDING_CLASSIFICATION',
      clientId: params.clientId,
      uploadedByUserId: params.uploadedByUserId,
      originalFilename: params.filename,
      mimeType: params.mimeType,
      sizeBytes: params.buffer.length,
      contentSha256: sha256(params.buffer),
      flags: params.flags ?? [],
    },
  })

  const safeName = params.filename.replace(/[^\w.\-]+/g, '_')
  const r2Key = `${params.officeId}/uploads/${document.id}/${safeName}`
  await uploadToR2(r2Key, params.buffer, params.mimeType)

  return prisma.document.update({
    where: { id: document.id },
    data: { r2Key },
  })
}

export interface IntakeResult {
  created: Array<{ documentId: string; filename: string }>
  errors: Array<{ filename: string; error: string; httpStatus: number }>
}

/**
 * Shared intake loop for uploaded files (internal upload S2.1 and portal
 * upload P2): magic-byte validation, ZIP expansion with zip-bomb protection,
 * Document + R2 write, parse job enqueue. Per-file error reporting — one bad
 * file never fails the batch.
 */
export async function intakeUploadedFiles(params: {
  officeId: string
  uploadedByUserId: string | null
  clientId: string | null
  files: Array<{ name: string; buffer: Buffer }>
  source?: 'MANUAL_UPLOAD' | 'PORTAL_UPLOAD'
}): Promise<IntakeResult> {
  const created: IntakeResult['created'] = []
  const errors: IntakeResult['errors'] = []
  const queue = getDocumentParseQueue()

  const intakeOne = async (name: string, buffer: Buffer, mimeType: string): Promise<void> => {
    const doc = await createManualDocument({
      officeId: params.officeId,
      uploadedByUserId: params.uploadedByUserId,
      filename: name,
      mimeType,
      buffer,
      clientId: params.clientId,
      source: params.source ?? 'MANUAL_UPLOAD',
    })
    await queue.add(
      'parse-document',
      { documentId: doc.id, officeId: params.officeId },
      DEFAULT_JOB_OPTIONS,
    )
    created.push({ documentId: doc.id, filename: name })
  }

  for (const file of params.files) {
    const validation = await validateUploadedFile(file.buffer, file.name)
    if (!validation.ok) {
      errors.push({ filename: file.name, error: validation.error, httpStatus: validation.httpStatus })
      continue
    }

    if (validation.kind === 'zip') {
      const zip = inspectZip(file.buffer)
      if (!zip.ok) {
        errors.push({ filename: file.name, error: zip.error ?? 'ZIP rejeitado', httpStatus: 422 })
        continue
      }
      for (const entry of zip.entries) {
        const entryValidation = await validateUploadedFile(entry.data, entry.name)
        if (!entryValidation.ok) {
          errors.push({
            filename: `${file.name}/${entry.name}`,
            error: entryValidation.error,
            httpStatus: entryValidation.httpStatus,
          })
          continue
        }
        await intakeOne(entry.name, entry.data, entryValidation.mimeType)
      }
      continue
    }

    await intakeOne(file.name, file.buffer, validation.mimeType)
  }

  return { created, errors }
}
