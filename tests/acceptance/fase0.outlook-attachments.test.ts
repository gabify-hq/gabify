import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { truncateAll, prisma } from '../helpers/db'
import { makeOffice, makeEmailAccount } from '../helpers/factories'
import { OutlookProvider } from '@/server/email-providers/OutlookProvider'
import { GmailProvider } from '@/server/email-providers/GmailProvider'
import { queuePendingAttachments } from '@/queues/email-sync.processor'

type FetchRoute = (url: string, init?: RequestInit) => object | null

/** Routes fetch calls by URL substring; unmatched URLs throw so tests stay honest. */
function stubFetch(routes: Array<[match: string, handler: FetchRoute]>): vi.Mock {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    for (const [match, handler] of routes) {
      if (url.includes(match)) {
        const body = handler(url, init)
        if (body === null) continue
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }
    throw new Error(`Unexpected fetch in test: ${url}`)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

const DELTA_DONE = { '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/delta?$deltaToken=final' }

function graphMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'graph-msg-1',
    subject: 'Fatura de maio',
    from: { emailAddress: { address: 'fornecedor@empresa.pt', name: 'Fornecedor' } },
    toRecipients: [{ emailAddress: { address: 'gabinete@contas.pt', name: 'Gabinete' } }],
    ccRecipients: [{ emailAddress: { address: 'cc@contas.pt' } }],
    receivedDateTime: '2026-05-10T10:00:00Z',
    hasAttachments: true,
    body: { content: '<p>Segue fatura</p>', contentType: 'html' },
    conversationId: 'conv-1',
    ...overrides,
  }
}

describe('AC-0.3 Anexos Outlook (§0.3, A4) + campos de email (achado #19)', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('AC-0.3.a [INV] — mensagem com 2 anexos (PDF+JPG) cria 2 EmailAttachment e enfileira 2 jobs', async () => {
    const office = await makeOffice()
    const account = await makeEmailAccount({ officeId: office.id, provider: 'OUTLOOK' })

    stubFetch([
      ['/attachments', () => ({
        value: [
          {
            '@odata.type': '#microsoft.graph.fileAttachment',
            id: 'att-pdf',
            name: 'fatura.pdf',
            contentType: 'application/pdf',
            size: 245_000,
            isInline: false,
          },
          {
            '@odata.type': '#microsoft.graph.fileAttachment',
            id: 'att-jpg',
            name: 'talao.jpg',
            contentType: 'image/jpeg',
            size: 88_000,
            isInline: false,
          },
        ],
      })],
      ['/messages/delta', () => ({ value: [graphMessage()], ...DELTA_DONE })],
    ])

    const provider = new OutlookProvider(account)
    await provider.syncInbox()

    const email = await prisma.inboundEmail.findFirstOrThrow({
      where: { emailAccountId: account.id },
      include: { attachments: true },
    })
    expect(email.attachments).toHaveLength(2)
    const pdf = email.attachments.find((a) => a.providerAttachmentId === 'att-pdf')
    expect(pdf).toMatchObject({
      filename: 'fatura.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 245_000,
    })

    // The sync pipeline queues one document-parse job per unparsed attachment
    const fakeQueue = { add: vi.fn(async () => ({})) }
    await queuePendingAttachments(account.id, office.id, fakeQueue)
    expect(fakeQueue.add).toHaveBeenCalledTimes(2)
  })

  it('AC-0.3.b — anexo inline não cria registo de pipeline', async () => {
    const office = await makeOffice()
    const account = await makeEmailAccount({ officeId: office.id, provider: 'OUTLOOK' })

    stubFetch([
      ['/attachments', () => ({
        value: [
          {
            '@odata.type': '#microsoft.graph.fileAttachment',
            id: 'att-logo',
            name: 'logo.png',
            contentType: 'image/png',
            size: 4_000,
            isInline: true,
            contentId: 'logo@corpo',
          },
          {
            '@odata.type': '#microsoft.graph.itemAttachment',
            id: 'att-item',
            name: 'mensagem anexada',
            size: 9_000,
          },
        ],
      })],
      ['/messages/delta', () => ({ value: [graphMessage()], ...DELTA_DONE })],
    ])

    await new OutlookProvider(account).syncInbox()

    expect(await prisma.emailAttachment.count()).toBe(0)
  })

  it('AC-0.3.b2 — mensagem sem anexos: zero chamadas ao endpoint de attachments', async () => {
    const office = await makeOffice()
    const account = await makeEmailAccount({ officeId: office.id, provider: 'OUTLOOK' })

    const fetchMock = stubFetch([
      ['/attachments', () => ({ value: [] })],
      ['/messages/delta', () => ({
        value: [graphMessage({ hasAttachments: false })],
        ...DELTA_DONE,
      })],
    ])

    await new OutlookProvider(account).syncInbox()

    const attachmentCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/attachments'))
    expect(attachmentCalls).toHaveLength(0)
  })

  it('AC-0.3.c — anexo de 30MB é ignorado com log; mensagem processada sem crash (A4 cap 25MB)', async () => {
    const office = await makeOffice()
    const account = await makeEmailAccount({ officeId: office.id, provider: 'OUTLOOK' })

    stubFetch([
      ['/attachments', () => ({
        value: [
          {
            '@odata.type': '#microsoft.graph.fileAttachment',
            id: 'att-big',
            name: 'gigante.pdf',
            contentType: 'application/pdf',
            size: 30 * 1024 * 1024,
            isInline: false,
          },
          {
            '@odata.type': '#microsoft.graph.fileAttachment',
            id: 'att-ok',
            name: 'normal.pdf',
            contentType: 'application/pdf',
            size: 1024,
            isInline: false,
          },
        ],
      })],
      ['/messages/delta', () => ({ value: [graphMessage()], ...DELTA_DONE })],
    ])

    await new OutlookProvider(account).syncInbox()

    const attachments = await prisma.emailAttachment.findMany()
    expect(attachments).toHaveLength(1)
    expect(attachments[0].providerAttachmentId).toBe('att-ok')
    expect(await prisma.inboundEmail.count()).toBe(1)
  })

  it('AC-0.3.d [INV] — Outlook preenche toEmails, ccEmails e bodyHtml', async () => {
    const office = await makeOffice()
    const account = await makeEmailAccount({ officeId: office.id, provider: 'OUTLOOK' })

    stubFetch([
      ['/attachments', () => ({ value: [] })],
      ['/messages/delta', () => ({
        value: [graphMessage({ hasAttachments: false })],
        ...DELTA_DONE,
      })],
    ])

    await new OutlookProvider(account).syncInbox()

    const email = await prisma.inboundEmail.findFirstOrThrow({ where: { emailAccountId: account.id } })
    expect(email.toEmails).toEqual(['gabinete@contas.pt'])
    expect(email.ccEmails).toEqual(['cc@contas.pt'])
    expect(email.bodyHtml).toContain('<p>Segue fatura</p>')
  })

  it('AC-0.3.d2 [INV] — Gmail preenche toEmails, ccEmails e bodyHtml', async () => {
    const office = await makeOffice()
    const account = await makeEmailAccount({ officeId: office.id, provider: 'GMAIL' })

    const gmailMessage = {
      id: 'gm-1',
      threadId: 'thread-1',
      historyId: '1000',
      payload: {
        mimeType: 'multipart/alternative',
        headers: [
          { name: 'Subject', value: 'Documentos' },
          { name: 'From', value: 'Cliente <cliente@empresa.pt>' },
          { name: 'To', value: 'Gabinete <gabinete@contas.pt>, outro@contas.pt' },
          { name: 'Cc', value: 'cc@contas.pt' },
          { name: 'Date', value: 'Mon, 11 May 2026 10:00:00 +0100' },
        ],
        parts: [
          {
            mimeType: 'text/plain',
            body: { data: Buffer.from('corpo em texto').toString('base64url') },
          },
          {
            mimeType: 'text/html',
            body: { data: Buffer.from('<p>corpo em html</p>').toString('base64url') },
          },
        ],
      },
    }

    stubFetch([
      ['/messages/gm-1', () => gmailMessage],
      ['/messages?', () => ({ messages: [{ id: 'gm-1', threadId: 'thread-1' }] })],
    ])

    await new GmailProvider(account).syncInbox()

    const email = await prisma.inboundEmail.findFirstOrThrow({ where: { emailAccountId: account.id } })
    expect(email.toEmails).toEqual(['gabinete@contas.pt', 'outro@contas.pt'])
    expect(email.ccEmails).toEqual(['cc@contas.pt'])
    expect(email.bodyHtml).toContain('<p>corpo em html</p>')
    expect(email.bodyText).toContain('corpo em texto')
  })
})
