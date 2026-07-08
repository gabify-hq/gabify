import { describe, it, expect, beforeEach, vi } from 'vitest'
import { truncateAll, prisma } from '../helpers/db'
import { makeOffice, makeEmailAccount } from '../helpers/factories'

vi.mock('@/lib/r2', async () => (await import('../mocks/r2')).r2MockFactory())
vi.mock('@/lib/anthropic', async () => (await import('../mocks/ai')).aiMockFactory())

const queueAddMock = vi.fn(async () => ({}))
vi.mock('@/lib/redis', () => ({
  getEmailSyncQueue: () => ({ add: queueAddMock }),
  getDocumentParseQueue: () => ({ add: queueAddMock }),
  getExportQueue: () => ({ add: queueAddMock }),
  QUEUE_EMAIL_SYNC: 'email-sync',
  QUEUE_DOCUMENT_PARSE: 'document-parse',
  QUEUE_SUBSCRIPTION_RENEWAL: 'subscription-renewal',
  QUEUE_EXPORT: 'export',
  DEFAULT_JOB_OPTIONS: {},
  redisConnection: {},
}))

import { processDocumentParse } from '@/queues/document-parse.processor'
import { aiState } from '../mocks/ai'

/**
 * AUDIT F2.7 — rascunho AI nunca se perde em silêncio (REVIEW_ISSUES A-6).
 * Antes: falha na geração apagava o slot e o job ficava COMPLETED — nenhum
 * caminho voltava a gerar. Agora a falha propaga (job FAILED → retry do
 * BullMQ, máx 3 pelas DEFAULT_JOB_OPTIONS) e o retry regenera o rascunho.
 */

async function seedClassifiedEmailWithAttachment() {
  const office = await makeOffice()
  const account = await makeEmailAccount({ officeId: office.id, provider: 'OUTLOOK' })
  const client = await prisma.client.create({
    data: { officeId: office.id, name: 'Cliente Rascunho', emailDomains: [], knownEmails: [] },
  })
  const email = await prisma.inboundEmail.create({
    data: {
      emailAccountId: account.id,
      providerMessageId: 'msg-draft-retry',
      fromEmail: 'cliente@empresa.pt',
      toEmails: [],
      ccEmails: [],
      subject: 'Fatura de julho',
      bodyText: 'Segue a fatura. Confirmam a receção?',
      receivedAt: new Date(),
      status: 'UNREAD',
      clientId: client.id,
    },
  })
  const attachment = await prisma.emailAttachment.create({
    data: {
      inboundEmailId: email.id,
      providerAttachmentId: 'att-draft-retry',
      filename: 'fatura.pdf',
      mimeType: 'application/pdf',
    },
  })
  // Documento já classificado (caminho alreadyClassified) — só falta o rascunho
  await prisma.document.create({
    data: {
      officeId: office.id,
      attachmentId: attachment.id,
      source: 'EMAIL',
      status: 'VALIDATED',
      type: 'INVOICE_RECEIVED',
      confidence: 0.95,
      originalFilename: 'fatura.pdf',
    },
  })
  return { office, account, email, attachment }
}

describe('AUDIT-F2.7 rascunho AI retryável', () => {
  beforeEach(async () => {
    await truncateAll()
    aiState.reset()
    queueAddMock.mockClear()
  })

  it('falha na geração → job FALHA (retryável) e o slot fica livre; retry gera o rascunho', async () => {
    const { office, attachment, email } = await seedClassifiedEmailWithAttachment()

    // 1.ª execução: fila de IA vazia → geração falha → o job TEM de falhar
    await expect(
      processDocumentParse({ attachmentId: attachment.id, officeId: office.id }, 'job-draft-1'),
    ).rejects.toThrow()

    // Slot libertado — nada de rascunho fantasma
    expect(await prisma.emailAction.count({ where: { inboundEmailId: email.id } })).toBe(0)

    // Visível na operação: JobLog FAILED
    const failedLog = await prisma.jobLog.findFirst({
      where: { officeId: office.id, jobId: 'job-draft-1' },
    })
    expect(failedLog).not.toBeNull()
    expect(failedLog!.status).toBe('FAILED')

    // 2.ª execução (retry do BullMQ): IA responde → rascunho criado
    aiState.queue.push('Boa tarde,\n\nConfirmamos a receção da fatura.\n\nCom os melhores cumprimentos,\nO Contabilista')
    const result = await processDocumentParse(
      { attachmentId: attachment.id, officeId: office.id },
      'job-draft-2',
    )
    expect(result).toBeUndefined() // alreadyClassified — só o rascunho corre

    const action = await prisma.emailAction.findFirstOrThrow({
      where: { inboundEmailId: email.id, type: 'DRAFT_REPLY' },
    })
    expect(action.status).toBe('PENDING_REVIEW')
    expect(action.draftContent).toContain('Confirmamos a receção')

    const okLog = await prisma.jobLog.findFirst({
      where: { officeId: office.id, jobId: 'job-draft-2' },
    })
    expect(okLog!.status).toBe('COMPLETED')
  })

  it('rascunho já existente nunca é regenerado (idempotência do retry preservada)', async () => {
    const { office, attachment, email } = await seedClassifiedEmailWithAttachment()

    aiState.queue.push('Rascunho original.')
    await processDocumentParse({ attachmentId: attachment.id, officeId: office.id }, 'job-a')

    // Segundo run: nenhuma chamada de IA — o rascunho existente trava a regeneração
    const callsBefore = aiState.calls
    await processDocumentParse({ attachmentId: attachment.id, officeId: office.id }, 'job-b')
    expect(aiState.calls).toBe(callsBefore)

    const actions = await prisma.emailAction.findMany({ where: { inboundEmailId: email.id } })
    expect(actions).toHaveLength(1)
    expect(actions[0].draftContent).toBe('Rascunho original.')
  })
})
