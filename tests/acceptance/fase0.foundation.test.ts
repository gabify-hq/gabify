import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { truncateAll, prisma } from '../helpers/db'
import {
  makeOffice,
  makeEmailAccount,
  makeInboundEmail,
  makeAttachment,
} from '../helpers/factories'

vi.mock('@/lib/redis', () => ({
  getEmailSyncQueue: () => ({ add: vi.fn() }),
  getDocumentParseQueue: () => ({ add: vi.fn() }),
  QUEUE_EMAIL_SYNC: 'email-sync',
  QUEUE_DOCUMENT_PARSE: 'document-parse',
  DEFAULT_JOB_OPTIONS: {},
  redisConnection: {},
}))

const getAttachmentMock = vi.fn(async () => Buffer.from('%PDF-1.4 fake'))
vi.mock('@/server/email-providers', () => ({
  createEmailProvider: () => ({
    syncInbox: vi.fn(),
    getAttachment: getAttachmentMock,
    sendReply: vi.fn(),
    watchChanges: vi.fn(),
  }),
}))

vi.mock('@/lib/r2', () => ({
  uploadToR2: vi.fn(async () => undefined),
  buildAttachmentKey: (...parts: unknown[]) => parts.filter(Boolean).join('/'),
  getSignedDownloadUrl: vi.fn(async () => 'https://signed.example/x'),
}))

vi.mock('@/lib/text-extractor', () => ({
  extractText: vi.fn(async () => 'FATURA FT 2026/1 Total 100,00'),
}))

vi.mock('@/lib/qr-reader', () => ({
  extractQRCodeFromImage: vi.fn(async () => null),
  extractQRCodeFromPDF: vi.fn(async () => null),
}))

const generateEmailDraftMock = vi.fn(async () => 'Rascunho gerado em teste')
vi.mock('@/server/services/email-classification', () => ({
  classifyDocument: vi.fn(async (_text: string, documentId: string) => {
    await prisma.document.update({
      where: { id: documentId },
      data: { type: 'INVOICE_RECEIVED', status: 'CLASSIFIED', confidence: 0.95 },
    })
    return { type: 'INVOICE_RECEIVED', confidence: 0.95 }
  }),
  classifyImage: vi.fn(),
  classifyPdfDocument: vi.fn(),
  classifyFromATQR: vi.fn(async () => null),
  classifyFromFilename: vi.fn(async () => null),
  generateEmailDraft: generateEmailDraftMock,
}))

import {
  processDocumentParse,
  maybeGenerateDraftForEmail,
} from '@/queues/document-parse.processor'

async function seedClassifiedEmail() {
  const office = await makeOffice()
  const account = await makeEmailAccount({ officeId: office.id })
  const email = await makeInboundEmail({ emailAccountId: account.id })
  const attachment = await makeAttachment({ inboundEmailId: email.id })
  await prisma.document.create({
    data: {
      attachmentId: attachment.id,
      type: 'INVOICE_RECEIVED',
      status: 'CLASSIFIED',
      confidence: 0.95,
    },
  })
  return { office, account, email, attachment }
}

describe('AC-0.5 Fundação', () => {
  beforeEach(async () => {
    await truncateAll()
    generateEmailDraftMock.mockClear()
    getAttachmentMock.mockReset()
    getAttachmentMock.mockResolvedValue(Buffer.from('%PDF-1.4 fake'))
  })

  it('AC-0.5.b [INV] — 2 gerações de draft concorrentes para o mesmo email → exatamente 1 draft (constraint)', async () => {
    const { office, email } = await seedClassifiedEmail()

    await Promise.all([
      maybeGenerateDraftForEmail(email.id, office.id),
      maybeGenerateDraftForEmail(email.id, office.id),
    ])

    const drafts = await prisma.emailAction.findMany({
      where: { inboundEmailId: email.id, type: 'DRAFT_REPLY' },
    })
    expect(drafts).toHaveLength(1)

    // A12: the audit entry references the real entity id — never 'pending'
    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'EmailAction', entityId: drafts[0].id },
    })
    expect(audit).not.toBeNull()
    const pendingAudits = await prisma.auditLog.findMany({ where: { entityId: 'pending' } })
    expect(pendingAudits).toHaveLength(0)
  })

  it('AC-0.5.c — worker document-parse escreve JobLog start/end', async () => {
    const office = await makeOffice()
    const account = await makeEmailAccount({ officeId: office.id })
    const email = await makeInboundEmail({ emailAccountId: account.id })
    const attachment = await makeAttachment({ inboundEmailId: email.id })

    await processDocumentParse(
      { attachmentId: attachment.id, emailAccountId: account.id, officeId: office.id },
      'job-test-1'
    )

    const logs = await prisma.jobLog.findMany({
      where: { queue: 'document-parse', jobId: 'job-test-1' },
    })
    expect(logs).toHaveLength(1)
    expect(logs[0].status).toBe('COMPLETED')
    expect(logs[0].startedAt).not.toBeNull()
    expect(logs[0].completedAt).not.toBeNull()
  })

  it('AC-0.5.c2 — em erro, JobLog fica FAILED com mensagem', async () => {
    const office = await makeOffice()
    const account = await makeEmailAccount({ officeId: office.id })
    const email = await makeInboundEmail({ emailAccountId: account.id })
    const attachment = await makeAttachment({ inboundEmailId: email.id })

    getAttachmentMock.mockRejectedValueOnce(new Error('Graph download failed'))

    await expect(
      processDocumentParse(
        { attachmentId: attachment.id, emailAccountId: account.id, officeId: office.id },
        'job-test-2'
      )
    ).rejects.toThrow('Graph download failed')

    const log = await prisma.jobLog.findFirstOrThrow({
      where: { queue: 'document-parse', jobId: 'job-test-2' },
    })
    expect(log.status).toBe('FAILED')
    expect(log.error).toContain('Graph download failed')
  })

  it('AC-0.5.d [INV] — AuditLog nunca é atualizado: código de produção sem auditLog.update', () => {
    const srcDir = join(process.cwd(), 'src')
    const offenders: string[] = []

    function walk(dir: string): void {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          walk(full)
          continue
        }
        if (!/\.(ts|tsx)$/.test(entry) || /\.test\./.test(entry)) continue
        const content = readFileSync(full, 'utf-8')
        if (/auditLog\s*\.\s*(update|updateMany|delete|deleteMany|upsert)\s*\(/.test(content)) {
          offenders.push(full)
        }
        if (/entityId:\s*['"]pending['"]/.test(content)) {
          offenders.push(`${full} (entityId: 'pending')`)
        }
      }
    }
    walk(srcDir)

    expect(offenders).toEqual([])
  })
})
