import { type NextRequest, NextResponse } from 'next/server'
import { guard } from '@/server/authz/guard'
import { checkUploadRateLimit } from '@/server/rate-limit'
import { createImportBatch } from '@/server/services/import-service'

/**
 * POST /api/documents/import — spreadsheet import, step 1 of 2.
 * Parses the sheet and returns an AI-proposed column mapping. Nothing is
 * imported until the mapping is confirmed (AC-2.5.c).
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

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Ficheiro obrigatório' }, { status: 400 })
  }
  const name = file.name.toLowerCase()
  if (!name.endsWith('.csv') && !name.endsWith('.xlsx')) {
    return NextResponse.json({ error: 'Apenas CSV ou XLSX' }, { status: 415 })
  }

  const clientIdRaw = form.get('clientId')
  const buffer = Buffer.from(await file.arrayBuffer())

  const { batch, proposedMapping, sample, headers } = await createImportBatch({
    officeId: gate.user.officeId,
    userId: gate.user.id,
    filename: file.name,
    buffer,
    clientId: typeof clientIdRaw === 'string' && clientIdRaw !== '' ? clientIdRaw : null,
  })

  return NextResponse.json({
    success: true,
    data: { batchId: batch.id, proposedMapping, sample, headers },
  })
}
