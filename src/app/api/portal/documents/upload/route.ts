import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { guard } from '@/server/authz/guard'
import { checkClientUploadRateLimit } from '@/server/rate-limit'
import {
  intakeUploadedFiles,
  MAX_FILES_PER_REQUEST,
  MAX_FILE_BYTES,
} from '@/server/services/upload-service'

/**
 * POST /api/portal/documents/upload — end-client upload (fase P2).
 *
 * Reuses the manual-upload pipeline (magic bytes, zip-bomb protection, size
 * caps, per-file errors) with the clientId FORCED to the session user's —
 * any clientId in the body is ignored. Source PORTAL_UPLOAD; every created
 * document is audit-logged with the CLIENT user.
 */
export async function POST(request: NextRequest) {
  const gate = await guard('portal:document:upload')
  if (!gate.ok) return gate.response

  if (!gate.user.clientId) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  }

  // Tighter portal limit (P1): 10 uploads/min per user
  const rate = checkClientUploadRateLimit(gate.user.id)
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
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `Ficheiro "${file.name}" excede o limite de 25MB` },
        { status: 413 },
      )
    }
  }

  const buffers = await Promise.all(
    files.map(async (file) => ({ name: file.name, buffer: Buffer.from(await file.arrayBuffer()) })),
  )
  const { created, errors } = await intakeUploadedFiles({
    officeId: gate.user.officeId,
    uploadedByUserId: gate.user.id,
    // clientId comes EXCLUSIVELY from the session — body input is ignored
    clientId: gate.user.clientId,
    files: buffers,
    source: 'PORTAL_UPLOAD',
  })

  // Audit trail: one entry per document, attributed to the CLIENT user (P2)
  for (const doc of created) {
    await prisma.auditLog.create({
      data: {
        officeId: gate.user.officeId,
        userId: gate.user.id,
        action: 'PORTAL_DOCUMENT_UPLOADED',
        entityType: 'Document',
        entityId: doc.documentId,
        metadata: { filename: doc.filename, clientId: gate.user.clientId },
      },
    })
  }

  if (created.length === 0 && errors.length > 0) {
    const status = errors.every((e) => e.httpStatus === errors[0].httpStatus)
      ? errors[0].httpStatus
      : 422
    // Per-file error detail, but never internal fields
    return NextResponse.json(
      {
        error: errors[0].error,
        data: { created, errors: errors.map(({ filename, error }) => ({ filename, error })) },
      },
      { status },
    )
  }

  const status = errors.length > 0 ? 207 : 201
  return NextResponse.json(
    {
      success: true,
      data: {
        created,
        errors: errors.map(({ filename, error }) => ({ filename, error })),
      },
    },
    { status },
  )
}
