import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { guard } from '@/server/authz/guard'
import { checkUploadRateLimit } from '@/server/rate-limit'
import { getDocumentParseQueue, DEFAULT_JOB_OPTIONS } from '@/lib/redis'
import {
  validateUploadedFile,
  inspectZip,
  createManualDocument,
  MAX_FILES_PER_REQUEST,
  MAX_FILE_BYTES,
} from '@/server/services/upload-service'

/**
 * POST /api/documents/upload — manual upload (web + mobile camera).
 * Multipart: `files` (1–10), optional `clientId`. Magic-byte validation (A4),
 * per-file error reporting, ZIP expansion with zip-bomb protection.
 */
export async function POST(request: NextRequest) {
  const gate = await guard('document:upload')
  if (!gate.ok) return gate.response

  const rate = checkUploadRateLimit(gate.user.id, gate.user.officeId)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Demasiados carregamentos — tente mais tarde' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    )
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) {
    return NextResponse.json({ error: 'Nenhum ficheiro enviado' }, { status: 400 })
  }
  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json(
      { error: `Máximo ${MAX_FILES_PER_REQUEST} ficheiros por pedido` },
      { status: 400 },
    )
  }

  const clientIdRaw = form.get('clientId')
  let clientId: string | null = null
  if (typeof clientIdRaw === 'string' && clientIdRaw.trim() !== '') {
    const client = await prisma.client.findFirst({
      where: { id: clientIdRaw, officeId: gate.user.officeId, deletedAt: null },
      select: { id: true },
    })
    if (!client) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    }
    clientId = client.id
  }

  // Hard pre-checks: any oversized file fails the whole request loudly
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `Ficheiro "${file.name}" excede o limite de 25MB` },
        { status: 413 },
      )
    }
  }

  const created: Array<{ documentId: string; filename: string }> = []
  const errors: Array<{ filename: string; error: string; httpStatus: number }> = []
  const queue = getDocumentParseQueue()

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer())
    const validation = await validateUploadedFile(buffer, file.name)
    if (!validation.ok) {
      errors.push({ filename: file.name, error: validation.error, httpStatus: validation.httpStatus })
      continue
    }

    if (validation.kind === 'zip') {
      const zip = inspectZip(buffer)
      if (!zip.ok) {
        errors.push({ filename: file.name, error: zip.error ?? 'ZIP rejeitado', httpStatus: 422 })
        continue
      }
      for (const entry of zip.entries) {
        const entryValidation = await validateUploadedFile(entry.data, entry.name)
        if (!entryValidation.ok) {
          errors.push({ filename: `${file.name}/${entry.name}`, error: entryValidation.error, httpStatus: entryValidation.httpStatus })
          continue
        }
        const doc = await createManualDocument({
          officeId: gate.user.officeId,
          uploadedByUserId: gate.user.id,
          filename: entry.name,
          mimeType: entryValidation.mimeType,
          buffer: entry.data,
          clientId,
        })
        await queue.add('parse-document', { documentId: doc.id, officeId: gate.user.officeId }, DEFAULT_JOB_OPTIONS)
        created.push({ documentId: doc.id, filename: entry.name })
      }
      continue
    }

    const doc = await createManualDocument({
      officeId: gate.user.officeId,
      uploadedByUserId: gate.user.id,
      filename: file.name,
      mimeType: validation.mimeType,
      buffer,
      clientId,
    })
    await queue.add('parse-document', { documentId: doc.id, officeId: gate.user.officeId }, DEFAULT_JOB_OPTIONS)
    created.push({ documentId: doc.id, filename: file.name })
  }

  if (created.length === 0 && errors.length > 0) {
    // All files failed — surface the dominant error class
    const status = errors.every((e) => e.httpStatus === errors[0].httpStatus)
      ? errors[0].httpStatus
      : 422
    return NextResponse.json(
      { error: errors[0].error, data: { created, errors } },
      { status },
    )
  }

  const status = errors.length > 0 ? 207 : 201
  return NextResponse.json({ success: true, data: { created, errors } }, { status })
}
