import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import AdmZip from 'adm-zip'
import { truncateAll, prisma } from '../helpers/db'
import { makeTwoOffices, makeOffice, makeUser, makeClient } from '../helpers/factories'
import { fixturePath } from '../fixtures/generate'
import { resetRateLimits } from '@/server/rate-limit'

vi.mock('@/lib/r2', async () => (await import('../mocks/r2')).r2MockFactory())
vi.mock('@/lib/anthropic', async () => (await import('../mocks/ai')).aiMockFactory())

const queueAddMock = vi.fn(async () => ({}))
vi.mock('@/lib/redis', () => ({
  getEmailSyncQueue: () => ({ add: queueAddMock }),
  getDocumentParseQueue: () => ({ add: queueAddMock }),
  QUEUE_EMAIL_SYNC: 'email-sync',
  QUEUE_DOCUMENT_PARSE: 'document-parse',
  QUEUE_SUBSCRIPTION_RENEWAL: 'subscription-renewal',
  QUEUE_EXPORT: 'export',
  DEFAULT_JOB_OPTIONS: {},
  redisConnection: {},
}))

import { processDocumentParse } from '@/queues/document-parse.processor'
import { createManualDocument } from '@/server/services/upload-service'
import { runExport, getExportDownloadUrl } from '@/server/services/export-service'
import { createSupplierRule } from '@/server/services/supplier-rule-service'
import { createIngestAlias, processInboundIngest } from '@/server/services/ingest-service'
import { seedSncTaxonomy } from '@/server/services/snc-service'
import { aiState } from '../mocks/ai'
import { r2Store } from '../mocks/r2'

function fx(name: string): Buffer {
  return readFileSync(fixturePath(name))
}

async function makeValidatedDoc(params: {
  officeId: string
  userId: string
  clientId: string
  fixture: string
  documentNumber: string
}) {
  const doc = await createManualDocument({
    officeId: params.officeId,
    uploadedByUserId: params.userId,
    filename: params.fixture,
    mimeType: 'application/pdf',
    buffer: fx(params.fixture),
    clientId: params.clientId,
  })
  await processDocumentParse({ documentId: doc.id, officeId: params.officeId }, `exp-${doc.id}`)
  // Rename to avoid duplicate flags and validate
  return prisma.document.update({
    where: { id: doc.id },
    data: {
      documentNumber: params.documentNumber,
      status: 'VALIDATED',
      flags: [],
      duplicateOfId: null,
      clientId: params.clientId,
    },
  })
}

describe('AC-6.1 Export ZIP · AC-6.2 CSV/Excel (A1, A9) · AC-6.3 re-export · AC-6.5 E2E', () => {
  beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
    aiState.reset()
    r2Store.clear()
    queueAddMock.mockClear()
  })

  it('AC-6.1.a/b/d + AC-6.2.a/b — export: estrutura ZIP, CSV pt-PT com BOM, somas exatas, AuditLog antes do URL', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    const client = await makeClient({ officeId: office.id, name: 'Cliente Export Lda' })

    // 2 validated docs in the period: single-rate (123.00) + multi-rate (751.00, 4 bandas)
    await makeValidatedDoc({ officeId: office.id, userId: owner.id, clientId: client.id, fixture: 'fx-qr-single.pdf', documentNumber: 'FT A/123' })
    await makeValidatedDoc({ officeId: office.id, userId: owner.id, clientId: client.id, fixture: 'fx-qr-multirate.pdf', documentNumber: 'FT B/77' })
    // One NEEDS_REVIEW doc that must NEVER be included (AC-6.1.b)
    const pending = await createManualDocument({
      officeId: office.id, uploadedByUserId: owner.id, filename: 'fx-noqr-invoice.pdf',
      mimeType: 'application/pdf', buffer: fx('fx-noqr-invoice.pdf'), clientId: client.id,
    })
    await prisma.document.update({ where: { id: pending.id }, data: { status: 'NEEDS_REVIEW' } })

    const result = await runExport({
      officeId: office.id,
      userId: owner.id,
      periodFrom: '2026-03',
      periodTo: '2026-04',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.documentCount).toBe(2)

    const zipBuffer = r2Store.get(result.r2Key)!
    const zip = new AdmZip(zipBuffer)
    const names = zip.getEntries().map((e) => e.entryName)

    // Structure: Cliente/{Ano}/{Mês}/{Recebidas|Emitidas|Outros}/...
    expect(names).toContain('Cliente Export Lda/2026/03/Recebidas/FT A-123-508234567.pdf')
    expect(names).toContain('Cliente Export Lda/2026/04/Recebidas/FT B-77-507111222.pdf')
    expect(names).toContain('lancamentos.csv')
    expect(names).toContain('resumo_iva.csv')
    expect(names).toContain('lancamentos.xlsx')

    // CSV: UTF-8 BOM, ';' separator, decimal comma, format header (A9)
    const csvRaw = zip.getEntry('lancamentos.csv')!.getData()
    expect(csvRaw[0]).toBe(0xef)
    expect(csvRaw[1]).toBe(0xbb)
    expect(csvRaw[2]).toBe(0xbf)
    const csv = csvRaw.toString('utf-8').replace(/^﻿/, '')
    expect(csv).toContain('# formato: pt-PT; separador ;; decimal ,')
    const dataLines = csv.split('\n').filter((l) => l && !l.startsWith('#') && !l.startsWith('data;'))
    // 1 single-rate line + 4 multi-rate bands = 5 lines (split por taxa)
    expect(dataLines).toHaveLength(5)
    expect(csv).toContain('123,00')
    expect(csv).toContain('751,00')

    // resumo_iva: exact cents (A1) — rate 23: 100.00 (single) + 300.00 (multi) base; IVA 23.00+69.00
    const resumo = zip.getEntry('resumo_iva.csv')!.getData().toString('utf-8')
    expect(resumo).toContain('23;400,00;92,00')

    // Docs transitioned to EXPORTED with batch linkage (A9)
    const exported = await prisma.document.findMany({ where: { officeId: office.id, status: 'EXPORTED' } })
    expect(exported).toHaveLength(2)
    expect(await prisma.exportDocument.count({ where: { exportBatchId: result.batchId } })).toBe(2)

    // AuditLog written before the signed URL is generated (AC-6.1.d)
    const audit = await prisma.auditLog.findFirst({
      where: { officeId: office.id, action: 'EXPORT_CREATED', entityId: result.batchId },
    })
    expect(audit).not.toBeNull()

    const url1 = await getExportDownloadUrl({ batchId: result.batchId, officeId: office.id })
    const url2 = await getExportDownloadUrl({ batchId: result.batchId, officeId: office.id })
    expect(url1).toBeTruthy()
    expect(url2).toBeTruthy()
  })

  it('AC-6.1.c [INV] — export cross-tenant impossível (clientId de B por user de A ⇒ nada)', async () => {
    const { officeA, officeB, ownerA, ownerB } = await makeTwoOffices()
    const clientB = await makeClient({ officeId: officeB.id })
    await makeValidatedDoc({ officeId: officeB.id, userId: ownerB.id, clientId: clientB.id, fixture: 'fx-qr-single.pdf', documentNumber: 'FT B1' })

    const result = await runExport({
      officeId: officeA.id,
      userId: ownerA.id,
      clientIds: [clientB.id],
      periodFrom: '2026-01',
      periodTo: '2026-12',
    })
    // Either refused or empty — never office B data
    if (result.ok) {
      expect(result.documentCount).toBe(0)
    } else {
      expect(result.httpStatus).toBe(404)
    }
    expect((await prisma.document.findFirstOrThrow({ where: { officeId: officeB.id } })).status).toBe('VALIDATED')
  })

  it('AC-6.3.b — re-export: sem includeExported ⇒ 0 docs; com includeExported inclui sem mudar estado', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    const client = await makeClient({ officeId: office.id, name: 'Cliente R' })
    await makeValidatedDoc({ officeId: office.id, userId: owner.id, clientId: client.id, fixture: 'fx-qr-single.pdf', documentNumber: 'FT R/1' })

    const first = await runExport({ officeId: office.id, userId: owner.id, periodFrom: '2026-03', periodTo: '2026-03' })
    expect(first.ok && first.documentCount).toBe(1)

    const again = await runExport({ officeId: office.id, userId: owner.id, periodFrom: '2026-03', periodTo: '2026-03' })
    expect(again.ok && again.documentCount).toBe(0)

    const reexport = await runExport({
      officeId: office.id, userId: owner.id, periodFrom: '2026-03', periodTo: '2026-03', includeExported: true,
    })
    expect(reexport.ok && reexport.documentCount).toBe(1)
    const doc = await prisma.document.findFirstOrThrow({ where: { officeId: office.id } })
    expect(doc.status).toBe('EXPORTED') // unchanged
    // Both exports are linked to the same document (ExportDocument N:M)
    expect(await prisma.exportDocument.count({ where: { documentId: doc.id } })).toBe(2)
  })

  it('AC-6.5.a [INV] — E2E: caixa dedicada → QR zero-IA → regra auto-valida → export com valores exatos', async () => {
    process.env.INGEST_DOMAIN = 'in.gabify.test'
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    const clientX = await makeClient({ officeId: office.id, name: 'Cliente X Lda' })
    await seedSncTaxonomy()
    await createSupplierRule({
      officeId: office.id, supplierNif: '507111222', defaultAccountCode: '6221',
      autoValidate: true, createdByUserId: owner.id,
    })
    const alias = await createIngestAlias({ officeId: office.id, clientId: clientX.id })

    // 1. Email chega à caixa dedicada do cliente X
    const ingest = await processInboundIngest({
      to: [`${alias.alias}@in.gabify.test`],
      from: 'faturas@fornecedorbeta.pt',
      subject: 'Fatura FT B/77',
      authentication: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
      attachments: [{
        filename: 'fatura-multirate.pdf',
        contentBase64: fx('fx-qr-multirate.pdf').toString('base64'),
        mimeType: 'application/pdf',
      }],
    })
    expect(ingest.accepted).toBe(true)

    // 2. Parse: QR autoritativo, zero IA; regra do fornecedor auto-valida
    const docId = ingest.documentIds[0]
    await processDocumentParse({ documentId: docId, officeId: office.id }, 'e2e-parse')
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: docId } })
    expect(aiState.calls).toBe(0)
    expect(doc.clientId).toBe(clientX.id)
    expect(doc.status).toBe('VALIDATED')
    expect(doc.accountCode).toBe('6221')

    // 3. Export do período
    const result = await runExport({ officeId: office.id, userId: owner.id, periodFrom: '2026-04', periodTo: '2026-04' })
    expect(result.ok && result.documentCount).toBe(1)
    if (!result.ok) return

    const zip = new AdmZip(r2Store.get(result.r2Key)!)
    const names = zip.getEntries().map((e) => e.entryName)
    expect(names).toContain('Cliente X Lda/2026/04/Recebidas/FT B-77-507111222.pdf')

    const csv = zip.getEntry('lancamentos.csv')!.getData().toString('utf-8')
    // Valores exatos do QR: total 751,00; retenção 75,00; conta 6221
    expect(csv).toContain('751,00')
    expect(csv).toContain('75,00')
    expect(csv).toContain('6221')
    expect(csv).toContain('507111222')
  })
})
