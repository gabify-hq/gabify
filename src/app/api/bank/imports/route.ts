import { type NextRequest, NextResponse } from 'next/server'
import { guard } from '@/server/authz/guard'
import { checkUploadRateLimit } from '@/server/rate-limit'
import { createBankStatementImport, MAX_BANK_FILE_BYTES } from '@/server/services/bank-import-service'

/**
 * POST /api/bank/imports — bank statement import, step 1 of 2 (fase C1).
 * Parses the file, detects columns (PT heuristic first, AI fallback) and
 * returns the proposed mapping. Nothing is imported until the mapping is
 * confirmed by a human. Re-importing the same file is a 409 unless forced.
 */
export async function POST(request: NextRequest) {
  const gate = await guard('bank:import')
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
  if (file.size > MAX_BANK_FILE_BYTES) {
    return NextResponse.json({ error: 'Ficheiro excede o limite de 10MB' }, { status: 413 })
  }
  const bankAccountId = form.get('bankAccountId')
  if (typeof bankAccountId !== 'string' || bankAccountId === '') {
    return NextResponse.json({ error: 'Conta bancária obrigatória' }, { status: 400 })
  }
  const force = form.get('force') === 'true'

  const buffer = Buffer.from(await file.arrayBuffer())
  const result = await createBankStatementImport({
    officeId: gate.user.officeId,
    userId: gate.user.id,
    bankAccountId,
    filename: file.name,
    buffer,
    force,
  })
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.canForce ? { canForce: true } : {}) },
      { status: result.httpStatus },
    )
  }

  return NextResponse.json({
    success: true,
    data: {
      importId: result.import.id,
      proposedMapping: result.proposedMapping,
      mappingSource: result.mappingSource,
      sample: result.sample,
      headers: result.headers,
      rowCount: result.import.rowCount,
    },
  })
}
