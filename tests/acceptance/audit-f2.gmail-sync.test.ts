import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { truncateAll, prisma } from '../helpers/db'
import { makeOffice, makeEmailAccount } from '../helpers/factories'
import { GmailProvider } from '@/server/email-providers/GmailProvider'

/**
 * AUDIT F2.5 — Gmail sync (REVIEW_ISSUES C-4/C-5).
 *  - O incremental segue nextPageToken até esgotar e SÓ depois persiste o
 *    cursor — uma página perdida era perda de faturas sem erro nem log.
 *  - startHistoryId expirado (Gmail devolve 404) cai para full sync com marca
 *    d'água nova; o sync seguinte volta ao incremental. A conta nunca encrava.
 */

interface StubResponse {
  status?: number
  body: object
}

type Handler = (url: string) => StubResponse | null

function stubFetch(routes: Array<[match: string, handler: Handler]>) {
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    for (const [match, handler] of routes) {
      if (url.includes(match)) {
        const result = handler(url)
        if (result === null) continue
        return new Response(JSON.stringify(result.body), {
          status: result.status ?? 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }
    throw new Error(`Unexpected fetch in test: ${url}`)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

function b64url(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64url')
}

function gmailMessage(id: string, historyId: string) {
  return {
    id,
    threadId: `thread-${id}`,
    historyId,
    payload: {
      mimeType: 'text/plain',
      headers: [
        { name: 'From', value: `Fornecedor <fornecedor-${id}@empresa.pt>` },
        { name: 'To', value: 'gabinete@contas.pt' },
        { name: 'Subject', value: `Fatura ${id}` },
        { name: 'Date', value: 'Mon, 6 Jul 2026 10:00:00 +0100' },
      ],
      body: { data: b64url(`corpo da mensagem ${id}`) },
    },
  }
}

function pageTokenOf(url: string): string | null {
  const match = url.match(/[?&]pageToken=([^&]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

describe('AUDIT-F2.5 GmailProvider sync', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('incremental segue nextPageToken até esgotar — 3 páginas → 3 mensagens, cursor só no fim', async () => {
    const office = await makeOffice()
    const account = await makeEmailAccount({ officeId: office.id, provider: 'GMAIL' })
    await prisma.emailAccount.update({ where: { id: account.id }, data: { historyId: '100' } })

    stubFetch([
      ['/history', (url) => {
        const token = pageTokenOf(url)
        if (token === null) {
          return { body: { historyId: '400', nextPageToken: 'p2', history: [
            { id: '101', messagesAdded: [{ message: { id: 'm1', threadId: 't1' } }] },
          ] } }
        }
        if (token === 'p2') {
          return { body: { historyId: '400', nextPageToken: 'p3', history: [
            { id: '102', messagesAdded: [{ message: { id: 'm2', threadId: 't2' } }] },
          ] } }
        }
        return { body: { historyId: '400', history: [
          { id: '103', messagesAdded: [{ message: { id: 'm3', threadId: 't3' } }] },
        ] } }
      }],
      ['/messages/m1', () => ({ body: gmailMessage('m1', '101') })],
      ['/messages/m2', () => ({ body: gmailMessage('m2', '102') })],
      ['/messages/m3', () => ({ body: gmailMessage('m3', '103') })],
    ])

    const fresh = await prisma.emailAccount.findUniqueOrThrow({ where: { id: account.id } })
    const result = await new GmailProvider(fresh).syncInbox()

    expect(result.newMessages).toBe(3)
    expect(await prisma.inboundEmail.count({ where: { emailAccountId: account.id } })).toBe(3)
    const after = await prisma.emailAccount.findUniqueOrThrow({ where: { id: account.id } })
    expect(after.historyId).toBe('400')
  })

  it('falha a meio da paginação NÃO avança o cursor — nada se perde no retry', async () => {
    const office = await makeOffice()
    const account = await makeEmailAccount({ officeId: office.id, provider: 'GMAIL' })
    await prisma.emailAccount.update({ where: { id: account.id }, data: { historyId: '100' } })

    stubFetch([
      ['/history', (url) => {
        const token = pageTokenOf(url)
        if (token === null) {
          return { body: { historyId: '400', nextPageToken: 'p2', history: [
            { id: '101', messagesAdded: [{ message: { id: 'm1', threadId: 't1' } }] },
          ] } }
        }
        return { status: 500, body: { error: 'backend blip' } }
      }],
      ['/messages/m1', () => ({ body: gmailMessage('m1', '101') })],
    ])

    const fresh = await prisma.emailAccount.findUniqueOrThrow({ where: { id: account.id } })
    await expect(new GmailProvider(fresh).syncInbox()).rejects.toThrow()

    // O cursor NÃO avançou — o retry recomeça do 100 e reapanha a página 2
    const after = await prisma.emailAccount.findUniqueOrThrow({ where: { id: account.id } })
    expect(after.historyId).toBe('100')
  })

  it('startHistoryId expirado (404) → full sync com marca d\'água; sync seguinte volta ao incremental', async () => {
    const office = await makeOffice()
    const account = await makeEmailAccount({ officeId: office.id, provider: 'GMAIL' })
    await prisma.emailAccount.update({ where: { id: account.id }, data: { historyId: '50' } })

    const historyCalls: string[] = []
    stubFetch([
      ['/history', (url) => {
        historyCalls.push(url)
        if (url.includes('startHistoryId=50')) {
          return { status: 404, body: { error: { code: 404, message: 'historyId expired' } } }
        }
        // Depois do fallback: incremental a partir da marca d'água nova
        return { body: { historyId: '901', history: [] } }
      }],
      ['/messages/f1', () => ({ body: gmailMessage('f1', '900') })],
      ['/messages?', (url) => {
        if (url.includes('labelIds=INBOX')) {
          return { body: { messages: [{ id: 'f1', threadId: 'tf1' }] } }
        }
        return null
      }],
    ])

    // 1.º sync: 404 → full sync — não encrava, não lança
    let fresh = await prisma.emailAccount.findUniqueOrThrow({ where: { id: account.id } })
    const first = await new GmailProvider(fresh).syncInbox()
    expect(first.newMessages).toBe(1)
    expect(await prisma.inboundEmail.count({ where: { emailAccountId: account.id } })).toBe(1)

    let state = await prisma.emailAccount.findUniqueOrThrow({ where: { id: account.id } })
    expect(state.historyId).toBe('900') // marca d'água do full sync

    // 2.º sync: volta ao incremental com a marca nova
    fresh = await prisma.emailAccount.findUniqueOrThrow({ where: { id: account.id } })
    await new GmailProvider(fresh).syncInbox()
    expect(historyCalls.some((u) => u.includes('startHistoryId=900'))).toBe(true)

    state = await prisma.emailAccount.findUniqueOrThrow({ where: { id: account.id } })
    expect(state.historyId).toBe('901')
  })

  it('sync inicial pagina a lista de mensagens (nextPageToken) e guarda o historyId mais alto', async () => {
    const office = await makeOffice()
    const account = await makeEmailAccount({ officeId: office.id, provider: 'GMAIL' })

    stubFetch([
      ['/messages/a1', () => ({ body: gmailMessage('a1', '210') })],
      ['/messages/a2', () => ({ body: gmailMessage('a2', '260') })],
      ['/messages/a3', () => ({ body: gmailMessage('a3', '240') })],
      ['/messages?', (url) => {
        if (!url.includes('labelIds=INBOX')) return null
        const token = pageTokenOf(url)
        if (token === null) {
          return { body: { messages: [{ id: 'a1', threadId: 'ta1' }, { id: 'a2', threadId: 'ta2' }], nextPageToken: 'n2' } }
        }
        return { body: { messages: [{ id: 'a3', threadId: 'ta3' }] } }
      }],
    ])

    const fresh = await prisma.emailAccount.findUniqueOrThrow({ where: { id: account.id } })
    const result = await new GmailProvider(fresh).syncInbox()

    expect(result.newMessages).toBe(3)
    const state = await prisma.emailAccount.findUniqueOrThrow({ where: { id: account.id } })
    expect(state.historyId).toBe('260') // o mais alto, não o último visto
  })
})
