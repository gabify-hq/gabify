import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { EmailAccount } from '@prisma/client'

// ── Mocks (must be before any import that resolves them) ────────────────────

vi.mock('@/lib/prisma', () => ({
  prisma: {
    emailAccount: {
      update: vi.fn(),
    },
    inboundEmail: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    emailThread: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}))

vi.mock('@/lib/crypto', () => ({
  encryptToken: vi.fn((s: string) => `enc:${s}`),
  decryptToken: vi.fn((s: string) => s.replace('enc:', '')),
}))

// ── Imports (after mocks) ───────────────────────────────────────────────────

import { GmailProvider } from './GmailProvider'
import { prisma } from '@/lib/prisma'
import { encryptToken, decryptToken } from '@/lib/crypto'

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeAccount(overrides: Partial<EmailAccount> = {}): EmailAccount {
  return {
    id: 'account-1',
    officeId: 'office-1',
    email: 'test@firm.pt',
    name: 'Test Account',
    provider: 'GMAIL',
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    outlookAccessToken: null,
    outlookRefreshToken: null,
    outlookTokenExpiry: null,
    outlookUserId: null,
    deltaLink: null,
    gmailAccessToken: 'enc:valid-access-token',
    gmailRefreshToken: 'enc:valid-refresh-token',
    gmailTokenExpiry: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
    gmailUserId: 'gmail-user-id',
    historyId: null,
    pubSubSubscription: null,
    imapHost: null,
    imapPort: null,
    imapUser: null,
    imapPassword: null,
    imapTls: true,
    ...overrides,
  } as EmailAccount
}

function makeGmailMessage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'gmail-msg-1',
    threadId: 'thread-1',
    historyId: '12345',
    payload: {
      headers: [
        { name: 'Subject', value: 'Test Subject' },
        { name: 'From', value: 'Sender Name <sender@client.pt>' },
        { name: 'Date', value: 'Mon, 15 Jan 2024 10:00:00 +0000' },
        { name: 'Message-ID', value: '<msg-id-1@mail.gmail.com>' },
      ],
      mimeType: 'text/plain',
      body: { data: Buffer.from('Email body text').toString('base64url') },
    },
    ...overrides,
  }
}

function makeFetchResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: vi.fn().mockResolvedValue(body),
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
  } as unknown as Response
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GmailProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetAllMocks()

    // Re-apply crypto mock implementations after reset
    vi.mocked(encryptToken).mockImplementation((s: string) => `enc:${s}`)
    vi.mocked(decryptToken).mockImplementation((s: string) => s.replace('enc:', ''))

    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    process.env.GOOGLE_CLIENT_ID = 'google-client-id'
    process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret'
    process.env.GMAIL_PUBSUB_TOPIC = 'projects/my-project/topics/gmail-inbox'
    process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64)

    vi.mocked(prisma.inboundEmail.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.inboundEmail.upsert).mockResolvedValue({} as never)
    vi.mocked(prisma.emailThread.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.emailThread.create).mockResolvedValue({ id: 'thread-db-1' } as never)
    vi.mocked(prisma.emailAccount.update).mockResolvedValue({} as never)
    vi.mocked(prisma.inboundEmail.updateMany).mockResolvedValue({ count: 1 })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET
    delete process.env.GMAIL_PUBSUB_TOPIC
    delete process.env.TOKEN_ENCRYPTION_KEY
  })

  // ── token refresh ─────────────────────────────────────────────────────────

  describe('token refresh', () => {
    it('uses existing access token when not expiring soon', async () => {
      const account = makeAccount({
        gmailTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      })
      const provider = new GmailProvider(account)

      // Initial sync: messages list + one full message fetch
      fetchMock
        .mockResolvedValueOnce(makeFetchResponse({ messages: [] }))

      await provider.syncInbox()

      // Token endpoint should NOT have been called
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0][0]).toContain('gmail.googleapis.com')
      expect(vi.mocked(decryptToken)).toHaveBeenCalledWith('enc:valid-access-token')
    })

    it('refreshes token when expiry is within 5 minutes', async () => {
      const account = makeAccount({
        gmailTokenExpiry: new Date(Date.now() + 4 * 60 * 1000), // 4 min left
      })
      const provider = new GmailProvider(account)

      fetchMock
        .mockResolvedValueOnce(
          makeFetchResponse({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
          })
        )
        .mockResolvedValueOnce(makeFetchResponse({ messages: [] }))

      await provider.syncInbox()

      expect(fetchMock).toHaveBeenCalledTimes(2)
      const [tokenUrl] = fetchMock.mock.calls[0] as [string]
      expect(tokenUrl).toBe('https://oauth2.googleapis.com/token')

      expect(vi.mocked(prisma.emailAccount.update)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'account-1' },
          data: expect.objectContaining({
            gmailAccessToken: 'enc:new-access-token',
            gmailRefreshToken: 'enc:new-refresh-token',
          }),
        })
      )
    })

    it('refreshes token when gmailTokenExpiry is null', async () => {
      const account = makeAccount({ gmailTokenExpiry: null })
      const provider = new GmailProvider(account)

      fetchMock
        .mockResolvedValueOnce(
          makeFetchResponse({ access_token: 'new-access-token', expires_in: 3600 })
        )
        .mockResolvedValueOnce(makeFetchResponse({ messages: [] }))

      await provider.syncInbox()

      expect(fetchMock.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/token')
    })

    it('throws when refresh token is missing and token is expired', async () => {
      const account = makeAccount({
        gmailRefreshToken: null,
        gmailTokenExpiry: new Date(Date.now() - 1000),
      })
      const provider = new GmailProvider(account)

      await expect(provider.syncInbox()).rejects.toThrow('no refresh token available')
    })

    it('throws when GOOGLE_CLIENT_ID is missing', async () => {
      delete process.env.GOOGLE_CLIENT_ID
      const account = makeAccount({
        gmailTokenExpiry: new Date(Date.now() - 1000),
      })
      const provider = new GmailProvider(account)

      await expect(provider.syncInbox()).rejects.toThrow(
        'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables are required'
      )
    })

    it('throws when token refresh HTTP call fails', async () => {
      const account = makeAccount({
        gmailTokenExpiry: new Date(Date.now() - 1000),
      })
      const provider = new GmailProvider(account)

      fetchMock.mockResolvedValueOnce(makeFetchResponse({}, 401))

      await expect(provider.syncInbox()).rejects.toThrow('token refresh failed: 401')
    })

    it('preserves existing refresh token when response omits refresh_token', async () => {
      const account = makeAccount({
        gmailTokenExpiry: new Date(Date.now() - 1000),
        gmailRefreshToken: 'enc:old-refresh-token',
      })
      const provider = new GmailProvider(account)

      fetchMock
        .mockResolvedValueOnce(
          makeFetchResponse({ access_token: 'new-access', expires_in: 3600 })
        )
        .mockResolvedValueOnce(makeFetchResponse({ messages: [] }))

      await provider.syncInbox()

      expect(vi.mocked(prisma.emailAccount.update)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            gmailRefreshToken: 'enc:old-refresh-token',
          }),
        })
      )
    })
  })

  // ── syncInbox — initial sync ──────────────────────────────────────────────

  describe('syncInbox', () => {
    it('performs initial sync when no historyId is stored', async () => {
      const account = makeAccount({ historyId: null })
      const provider = new GmailProvider(account)

      fetchMock
        .mockResolvedValueOnce(
          makeFetchResponse({ messages: [{ id: 'gmail-msg-1', threadId: 'thread-1' }] })
        )
        .mockResolvedValueOnce(makeFetchResponse(makeGmailMessage()))

      const result = await provider.syncInbox()

      // First call should be the messages list
      const listUrl = fetchMock.mock.calls[0][0] as string
      expect(listUrl).toContain('labelIds=INBOX')
      expect(listUrl).toContain('maxResults=50')

      expect(result.newMessages).toBe(1)
      expect(result.messagesProcessed).toBe(1)
      expect(result.provider).toBe('GMAIL')
      expect(result.historyId).toBe('12345')
    })

    it('stores historyId from the first message during initial sync', async () => {
      const account = makeAccount({ historyId: null })
      const provider = new GmailProvider(account)

      fetchMock
        .mockResolvedValueOnce(
          makeFetchResponse({ messages: [{ id: 'gmail-msg-1', threadId: 'thread-1' }] })
        )
        .mockResolvedValueOnce(makeFetchResponse(makeGmailMessage({ historyId: '99999' })))

      await provider.syncInbox()

      expect(vi.mocked(prisma.emailAccount.update)).toHaveBeenCalledWith({
        where: { id: 'account-1' },
        data: { historyId: '99999' },
      })
    })

    it('performs incremental sync when historyId is stored', async () => {
      const account = makeAccount({ historyId: '10000' })
      const provider = new GmailProvider(account)

      fetchMock
        .mockResolvedValueOnce(
          makeFetchResponse({
            historyId: '10050',
            history: [
              {
                id: '10001',
                messagesAdded: [{ message: { id: 'new-msg', threadId: 'thread-2' } }],
              },
            ],
          })
        )
        .mockResolvedValueOnce(makeFetchResponse(makeGmailMessage({ id: 'new-msg', threadId: 'thread-2' })))

      const result = await provider.syncInbox()

      const historyUrl = fetchMock.mock.calls[0][0] as string
      expect(historyUrl).toContain('startHistoryId=10000')
      expect(historyUrl).toContain('historyTypes=messageAdded')

      expect(result.newMessages).toBe(1)
      expect(result.historyId).toBe('10050')
    })

    it('stores updated historyId after incremental sync', async () => {
      const account = makeAccount({ historyId: '10000' })
      const provider = new GmailProvider(account)

      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({ historyId: '10100', history: [] })
      )

      await provider.syncInbox()

      expect(vi.mocked(prisma.emailAccount.update)).toHaveBeenCalledWith({
        where: { id: 'account-1' },
        data: { historyId: '10100' },
      })
    })

    it('returns zero counts when incremental sync has no new messages', async () => {
      const account = makeAccount({ historyId: '10000' })
      const provider = new GmailProvider(account)

      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({ historyId: '10001', history: [] })
      )

      const result = await provider.syncInbox()

      expect(result.newMessages).toBe(0)
      expect(result.messagesProcessed).toBe(0)
    })

    it('counts existing messages as updated (not new)', async () => {
      const account = makeAccount({ historyId: null })
      const provider = new GmailProvider(account)

      vi.mocked(prisma.inboundEmail.findUnique).mockResolvedValue({ id: 'existing' } as never)

      fetchMock
        .mockResolvedValueOnce(
          makeFetchResponse({ messages: [{ id: 'gmail-msg-1', threadId: 'thread-1' }] })
        )
        .mockResolvedValueOnce(makeFetchResponse(makeGmailMessage()))

      const result = await provider.syncInbox()

      expect(result.newMessages).toBe(0)
      expect(result.messagesProcessed).toBe(1)
    })

    it('creates EmailThread for messages with a new threadId', async () => {
      const account = makeAccount({ historyId: null })
      const provider = new GmailProvider(account)

      vi.mocked(prisma.emailThread.findFirst).mockResolvedValue(null)

      fetchMock
        .mockResolvedValueOnce(
          makeFetchResponse({ messages: [{ id: 'gmail-msg-1', threadId: 'thread-abc' }] })
        )
        .mockResolvedValueOnce(makeFetchResponse(makeGmailMessage({ threadId: 'thread-abc' })))

      await provider.syncInbox()

      expect(vi.mocked(prisma.emailThread.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ providerThreadId: 'thread-abc' }),
        })
      )
    })

    it('reuses existing EmailThread for a known threadId', async () => {
      const account = makeAccount({ historyId: null })
      const provider = new GmailProvider(account)

      vi.mocked(prisma.emailThread.findFirst).mockResolvedValue({ id: 'existing-thread' } as never)

      fetchMock
        .mockResolvedValueOnce(
          makeFetchResponse({ messages: [{ id: 'gmail-msg-1', threadId: 'thread-abc' }] })
        )
        .mockResolvedValueOnce(makeFetchResponse(makeGmailMessage({ threadId: 'thread-abc' })))

      await provider.syncInbox()

      expect(vi.mocked(prisma.emailThread.create)).not.toHaveBeenCalled()
    })

    it('throws when Gmail messages list request fails', async () => {
      const account = makeAccount({ historyId: null })
      const provider = new GmailProvider(account)

      fetchMock.mockResolvedValueOnce(makeFetchResponse({}, 500))

      await expect(provider.syncInbox()).rejects.toThrow('GET failed')
    })

    it('parses From header with name and email', async () => {
      const account = makeAccount({ historyId: null })
      const provider = new GmailProvider(account)

      const message = makeGmailMessage({
        payload: {
          headers: [
            { name: 'Subject', value: 'Invoice' },
            { name: 'From', value: '"João Silva" <joao@empresa.pt>' },
            { name: 'Date', value: 'Mon, 15 Jan 2024 10:00:00 +0000' },
          ],
          mimeType: 'text/plain',
          body: { data: Buffer.from('body').toString('base64url') },
        },
      })

      fetchMock
        .mockResolvedValueOnce(
          makeFetchResponse({ messages: [{ id: 'gmail-msg-1', threadId: 'thread-1' }] })
        )
        .mockResolvedValueOnce(makeFetchResponse(message))

      await provider.syncInbox()

      const upsertCall = vi.mocked(prisma.inboundEmail.upsert).mock.calls[0][0]
      expect(upsertCall.create.fromEmail).toBe('joao@empresa.pt')
      expect(upsertCall.create.fromName).toBe('João Silva')
    })

    it('handles plain email From header without name', async () => {
      const account = makeAccount({ historyId: null })
      const provider = new GmailProvider(account)

      const message = makeGmailMessage({
        payload: {
          headers: [
            { name: 'Subject', value: 'Invoice' },
            { name: 'From', value: 'joao@empresa.pt' },
            { name: 'Date', value: 'Mon, 15 Jan 2024 10:00:00 +0000' },
          ],
          mimeType: 'text/plain',
          body: { data: Buffer.from('body').toString('base64url') },
        },
      })

      fetchMock
        .mockResolvedValueOnce(
          makeFetchResponse({ messages: [{ id: 'gmail-msg-1', threadId: 'thread-1' }] })
        )
        .mockResolvedValueOnce(makeFetchResponse(message))

      await provider.syncInbox()

      const upsertCall = vi.mocked(prisma.inboundEmail.upsert).mock.calls[0][0]
      expect(upsertCall.create.fromEmail).toBe('joao@empresa.pt')
      expect(upsertCall.create.fromName).toBeNull()
    })

    it('decodes text/plain body from base64url', async () => {
      const account = makeAccount({ historyId: null })
      const provider = new GmailProvider(account)

      const bodyText = 'This is the email body'
      const message = makeGmailMessage({
        payload: {
          headers: [
            { name: 'Subject', value: 'Test' },
            { name: 'From', value: 'sender@example.com' },
            { name: 'Date', value: 'Mon, 15 Jan 2024 10:00:00 +0000' },
          ],
          mimeType: 'text/plain',
          body: { data: Buffer.from(bodyText).toString('base64url') },
        },
      })

      fetchMock
        .mockResolvedValueOnce(
          makeFetchResponse({ messages: [{ id: 'gmail-msg-1', threadId: 'thread-1' }] })
        )
        .mockResolvedValueOnce(makeFetchResponse(message))

      await provider.syncInbox()

      const upsertCall = vi.mocked(prisma.inboundEmail.upsert).mock.calls[0][0]
      expect(upsertCall.create.bodyText).toBe(bodyText)
    })

    it('extracts text/plain from multipart message by recursing into parts', async () => {
      const account = makeAccount({ historyId: null })
      const provider = new GmailProvider(account)

      const bodyText = 'Plain text part'
      const message = makeGmailMessage({
        payload: {
          headers: [
            { name: 'Subject', value: 'Multipart' },
            { name: 'From', value: 'sender@example.com' },
            { name: 'Date', value: 'Mon, 15 Jan 2024 10:00:00 +0000' },
          ],
          mimeType: 'multipart/alternative',
          parts: [
            {
              mimeType: 'text/plain',
              body: { data: Buffer.from(bodyText).toString('base64url') },
            },
            {
              mimeType: 'text/html',
              body: { data: Buffer.from('<p>HTML part</p>').toString('base64url') },
            },
          ],
        },
      })

      fetchMock
        .mockResolvedValueOnce(
          makeFetchResponse({ messages: [{ id: 'gmail-msg-1', threadId: 'thread-1' }] })
        )
        .mockResolvedValueOnce(makeFetchResponse(message))

      await provider.syncInbox()

      const upsertCall = vi.mocked(prisma.inboundEmail.upsert).mock.calls[0][0]
      expect(upsertCall.create.bodyText).toBe(bodyText)
    })
  })

  // ── getAttachment ─────────────────────────────────────────────────────────

  describe('getAttachment', () => {
    it('returns a Buffer decoded from base64url', async () => {
      const account = makeAccount()
      const provider = new GmailProvider(account)

      const originalData = 'binary-attachment-data'
      const base64urlData = Buffer.from(originalData).toString('base64url')

      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({ data: base64urlData, size: originalData.length })
      )

      const result = await provider.getAttachment('msg-1', 'attach-1')

      expect(result).toBeInstanceOf(Buffer)
      expect(result.toString()).toBe(originalData)
    })

    it('calls the correct Gmail attachment endpoint', async () => {
      const account = makeAccount()
      const provider = new GmailProvider(account)

      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({ data: Buffer.from('data').toString('base64url'), size: 4 })
      )

      await provider.getAttachment('msg-abc', 'attach-xyz')

      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/msg-abc/attachments/attach-xyz'
      )
    })

    it('throws when the Gmail request fails', async () => {
      const account = makeAccount()
      const provider = new GmailProvider(account)

      fetchMock.mockResolvedValueOnce(makeFetchResponse({}, 403))

      await expect(provider.getAttachment('msg-1', 'attach-1')).rejects.toThrow(
        'GmailProvider.getAttachment failed: 403'
      )
    })
  })

  // ── sendReply ─────────────────────────────────────────────────────────────

  describe('sendReply', () => {
    it('fetches original message, sends reply, and updates InboundEmail status', async () => {
      const account = makeAccount()
      const provider = new GmailProvider(account)

      // First fetch: get original message
      fetchMock
        .mockResolvedValueOnce(makeFetchResponse(makeGmailMessage()))
        // Second fetch: send message
        .mockResolvedValueOnce(makeFetchResponse({ id: 'sent-msg-1' }, 200))

      await provider.sendReply('gmail-msg-1', { bodyText: 'Reply text' })

      const [sendUrl, sendInit] = fetchMock.mock.calls[1] as [string, RequestInit]
      expect(sendUrl).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send')
      expect((sendInit as { method: string }).method).toBe('POST')

      const body = JSON.parse((sendInit as { body: string }).body) as {
        raw: string
        threadId: string
      }
      expect(body.threadId).toBe('thread-1')

      // Decode and verify MIME
      const decoded = Buffer.from(body.raw, 'base64url').toString()
      expect(decoded).toContain('Re: Test Subject')
      expect(decoded).toContain('Reply text')
      expect(decoded).toContain('In-Reply-To: <msg-id-1@mail.gmail.com>')

      expect(vi.mocked(prisma.inboundEmail.updateMany)).toHaveBeenCalledWith({
        where: { emailAccountId: 'account-1', providerMessageId: 'gmail-msg-1' },
        data: { status: 'PROCESSED' },
      })
    })

    it('prefixes Re: to subject only once', async () => {
      const account = makeAccount()
      const provider = new GmailProvider(account)

      const message = makeGmailMessage({
        payload: {
          headers: [
            { name: 'Subject', value: 'Re: Original Subject' },
            { name: 'From', value: 'sender@client.pt' },
            { name: 'Date', value: 'Mon, 15 Jan 2024 10:00:00 +0000' },
            { name: 'Message-ID', value: '<orig@mail.gmail.com>' },
          ],
          mimeType: 'text/plain',
          body: { data: Buffer.from('body').toString('base64url') },
        },
      })

      fetchMock
        .mockResolvedValueOnce(makeFetchResponse(message))
        .mockResolvedValueOnce(makeFetchResponse({ id: 'sent-msg' }, 200))

      await provider.sendReply('gmail-msg-1', { bodyText: 'Reply' })

      const sendInit = fetchMock.mock.calls[1][1] as { body: string }
      const body = JSON.parse(sendInit.body) as { raw: string }
      const decoded = Buffer.from(body.raw, 'base64url').toString()
      expect(decoded).toContain('Subject: Re: Original Subject')
      expect(decoded).not.toContain('Re: Re:')
    })

    it('throws when send request fails', async () => {
      const account = makeAccount()
      const provider = new GmailProvider(account)

      fetchMock
        .mockResolvedValueOnce(makeFetchResponse(makeGmailMessage()))
        .mockResolvedValueOnce(makeFetchResponse({}, 400))

      await expect(
        provider.sendReply('gmail-msg-1', { bodyText: 'Reply' })
      ).rejects.toThrow('GmailProvider.sendReply failed: 400')
    })

    it('does not update DB status when send call fails', async () => {
      const account = makeAccount()
      const provider = new GmailProvider(account)

      fetchMock
        .mockResolvedValueOnce(makeFetchResponse(makeGmailMessage()))
        .mockResolvedValueOnce(makeFetchResponse({}, 500))

      await expect(provider.sendReply('gmail-msg-1', { bodyText: 'Reply' })).rejects.toThrow()
      expect(vi.mocked(prisma.inboundEmail.updateMany)).not.toHaveBeenCalled()
    })
  })

  // ── watchChanges ──────────────────────────────────────────────────────────

  describe('watchChanges', () => {
    it('sends watch request and returns WatchResult', async () => {
      const account = makeAccount()
      const provider = new GmailProvider(account)

      const expiration = String(Date.now() + 7 * 24 * 60 * 60 * 1000)
      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({ historyId: '50000', expiration })
      )

      const result = await provider.watchChanges('https://gabify.app/api/webhooks/gmail')

      expect(result.provider).toBe('GMAIL')
      expect(result.pubSubSubscription).toBe('projects/my-project/topics/gmail-inbox')
      expect(result.expiresAt).toBeInstanceOf(Date)
    })

    it('sends correct watch payload', async () => {
      const account = makeAccount()
      const provider = new GmailProvider(account)

      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({ historyId: '50000', expiration: String(Date.now() + 1000) })
      )

      await provider.watchChanges('https://gabify.app/api/webhooks/gmail')

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/watch')
      const body = JSON.parse((init as { body: string }).body) as {
        topicName: string
        labelIds: string[]
      }
      expect(body.topicName).toBe('projects/my-project/topics/gmail-inbox')
      expect(body.labelIds).toEqual(['INBOX'])
    })

    it('stores historyId when account has no historyId yet', async () => {
      const account = makeAccount({ historyId: null })
      const provider = new GmailProvider(account)

      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({ historyId: '77777', expiration: String(Date.now() + 1000) })
      )

      await provider.watchChanges('https://gabify.app/api/webhooks/gmail')

      expect(vi.mocked(prisma.emailAccount.update)).toHaveBeenCalledWith({
        where: { id: 'account-1' },
        data: { historyId: '77777' },
      })
    })

    it('does not update historyId when account already has one', async () => {
      const account = makeAccount({ historyId: 'existing-history' })
      const provider = new GmailProvider(account)

      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({ historyId: '88888', expiration: String(Date.now() + 1000) })
      )

      await provider.watchChanges('https://gabify.app/api/webhooks/gmail')

      expect(vi.mocked(prisma.emailAccount.update)).not.toHaveBeenCalled()
    })

    it('throws when GMAIL_PUBSUB_TOPIC is not set', async () => {
      delete process.env.GMAIL_PUBSUB_TOPIC
      const account = makeAccount()
      const provider = new GmailProvider(account)

      await expect(provider.watchChanges('https://example.com')).rejects.toThrow(
        'GMAIL_PUBSUB_TOPIC environment variable is not set'
      )
    })

    it('throws when watch request fails', async () => {
      const account = makeAccount()
      const provider = new GmailProvider(account)

      fetchMock.mockResolvedValueOnce(makeFetchResponse({}, 400))

      await expect(
        provider.watchChanges('https://gabify.app/api/webhooks/gmail')
      ).rejects.toThrow('GmailProvider.watchChanges failed: 400')
    })
  })

  // ── token encryption integration ──────────────────────────────────────────

  describe('token encryption integration', () => {
    it('encrypts tokens before storing in the database on refresh', async () => {
      const account = makeAccount({
        gmailTokenExpiry: new Date(Date.now() - 1000),
      })
      const provider = new GmailProvider(account)

      fetchMock
        .mockResolvedValueOnce(
          makeFetchResponse({
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            expires_in: 3600,
          })
        )
        .mockResolvedValueOnce(makeFetchResponse({ messages: [] }))

      await provider.syncInbox()

      expect(vi.mocked(encryptToken)).toHaveBeenCalledWith('new-access')
      expect(vi.mocked(encryptToken)).toHaveBeenCalledWith('new-refresh')

      const updateCall = vi.mocked(prisma.emailAccount.update).mock.calls[0][0]
      expect(updateCall.data.gmailAccessToken).toBe('enc:new-access')
      expect(updateCall.data.gmailRefreshToken).toBe('enc:new-refresh')
    })

    it('decrypts the access token before using it in Authorization header', async () => {
      const account = makeAccount({
        gmailAccessToken: 'enc:decrypted-token',
        gmailTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      })
      const provider = new GmailProvider(account)

      fetchMock.mockResolvedValueOnce(makeFetchResponse({ messages: [] }))

      await provider.syncInbox()

      const headers = (
        fetchMock.mock.calls[0][1] as { headers: Record<string, string> }
      ).headers
      expect(headers.Authorization).toBe('Bearer decrypted-token')
    })
  })
})
