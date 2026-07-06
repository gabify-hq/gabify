import { describe, it, expect, beforeEach, vi } from 'vitest'
import { truncateAll, prisma } from '../helpers/db'
import { makeOffice, makeEmailAccount, makeInboundEmail, makeClient } from '../helpers/factories'

const queueAddMock = vi.fn(async () => ({}))
vi.mock('@/lib/redis', () => ({
  getEmailSyncQueue: () => ({ add: queueAddMock }),
  getDocumentParseQueue: () => ({ add: queueAddMock }),
  QUEUE_EMAIL_SYNC: 'email-sync',
  QUEUE_DOCUMENT_PARSE: 'document-parse',
  QUEUE_SUBSCRIPTION_RENEWAL: 'subscription-renewal',
  DEFAULT_JOB_OPTIONS: {},
  redisConnection: {},
}))

const { syncInboxMock } = vi.hoisted(() => ({
  syncInboxMock: vi.fn(),
}))
vi.mock('@/server/email-providers', () => ({
  createEmailProvider: () => ({
    syncInbox: syncInboxMock,
    getAttachment: vi.fn(),
    sendReply: vi.fn(),
    watchChanges: vi.fn(),
  }),
}))

import { processEmailSync } from '@/queues/email-sync.processor'

describe('AC-1.4.g Workers testados (§1.7)', () => {
  beforeEach(async () => {
    await truncateAll()
    queueAddMock.mockClear()
    syncInboxMock.mockReset()
  })

  it('sync feliz: JobLog COMPLETED, matching corre, anexos por parsear enfileirados', async () => {
    const office = await makeOffice()
    const account = await makeEmailAccount({ officeId: office.id })
    // A client whose known email matches the unassigned inbound email
    await makeClient({ officeId: office.id })
    await prisma.client.updateMany({
      where: { officeId: office.id },
      data: { knownEmails: ['remetente@empresa.pt'] },
    })
    const email = await makeInboundEmail({
      emailAccountId: account.id,
      fromEmail: 'remetente@empresa.pt',
    })
    await prisma.emailAttachment.create({
      data: { inboundEmailId: email.id, providerAttachmentId: 'a1', filename: 'f.pdf', mimeType: 'application/pdf' },
    })

    syncInboxMock.mockResolvedValue({
      provider: 'OUTLOOK',
      emailAccountId: account.id,
      messagesProcessed: 1,
      newMessages: 1,
      errors: [],
    })

    await processEmailSync(
      { emailAccountId: account.id, officeId: office.id, triggerSource: 'manual' },
      'sync-job-1'
    )

    const log = await prisma.jobLog.findFirstOrThrow({
      where: { queue: 'email-sync', jobId: 'sync-job-1' },
    })
    expect(log.status).toBe('COMPLETED')

    const matched = await prisma.inboundEmail.findUniqueOrThrow({ where: { id: email.id } })
    expect(matched.clientId).not.toBeNull()

    expect(queueAddMock).toHaveBeenCalledTimes(1)
  })

  it('erro de provider: não crasha silenciosamente — JobLog FAILED e erro propagado para retry do BullMQ', async () => {
    const office = await makeOffice()
    const account = await makeEmailAccount({ officeId: office.id })
    syncInboxMock.mockRejectedValue(new Error('Graph 500'))

    await expect(
      processEmailSync(
        { emailAccountId: account.id, officeId: office.id, triggerSource: 'scheduled' },
        'sync-job-2'
      )
    ).rejects.toThrow('Graph 500')

    const log = await prisma.jobLog.findFirstOrThrow({
      where: { queue: 'email-sync', jobId: 'sync-job-2' },
    })
    expect(log.status).toBe('FAILED')
    expect(log.error).toContain('Graph 500')
  })

  it('re-execução idempotente: segundo sync não duplica queueing de anexos já parseados', async () => {
    const office = await makeOffice()
    const account = await makeEmailAccount({ officeId: office.id })
    const email = await makeInboundEmail({ emailAccountId: account.id })
    const attachment = await prisma.emailAttachment.create({
      data: { inboundEmailId: email.id, providerAttachmentId: 'a1', filename: 'f.pdf', mimeType: 'application/pdf' },
    })
    // Already parsed — has a Document
    await prisma.document.create({
      data: { attachmentId: attachment.id, status: 'CLASSIFIED', type: 'INVOICE_RECEIVED' },
    })

    syncInboxMock.mockResolvedValue({
      provider: 'OUTLOOK',
      emailAccountId: account.id,
      messagesProcessed: 0,
      newMessages: 0,
      errors: [],
    })

    await processEmailSync(
      { emailAccountId: account.id, officeId: office.id, triggerSource: 'webhook' },
      'sync-job-3'
    )
    await processEmailSync(
      { emailAccountId: account.id, officeId: office.id, triggerSource: 'webhook' },
      'sync-job-4'
    )

    // Attachment already has a Document — no parse jobs queued in either run
    expect(queueAddMock).not.toHaveBeenCalled()
  })
})
