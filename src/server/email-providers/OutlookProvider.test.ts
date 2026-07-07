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

import { OutlookProvider } from './OutlookProvider'
import { prisma } from '@/lib/prisma'
import { encryptToken, decryptToken } from '@/lib/crypto'

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeAccount(overrides: Partial<EmailAccount> = {}): EmailAccount {
  return {
    id: 'account-1',
    officeId: 'office-1',
    email: 'test@firm.pt',
    name: 'Test Account',
    provider: 'OUTLOOK',
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    outlookAccessToken: 'enc:valid-access-token',
    outlookRefreshToken: 'enc:valid-refresh-token',
    outlookTokenExpiry: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
    outlookUserId: 'user-id-1',
    deltaLink: null,
    gmailAccessToken: null,
    gmailRefreshToken: null,
    gmailTokenExpiry: null,
    gmailUserId: null,
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

function makeGraphMessage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'msg-1',
    subject: 'Test Subject',
    from: { emailAddress: { address: 'sender@client.pt', name: 'Sender Name' } },
    receivedDateTime: '2024-01-15T10:00:00Z',
    hasAttachments: false,
    body: { content: 'Email body text', contentType: 'text' },
    conversationId: 'conv-1',
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

describe('OutlookProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetAllMocks()

    // Re-apply crypto mock implementations after reset
    vi.mocked(encryptToken).mockImplementation((s: string) => `enc:${s}`)
    vi.mocked(decryptToken).mockImplementation((s: string) => s.replace('enc:', ''))

    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    process.env.MICROSOFT_CLIENT_ID = 'ms-client-id'
    process.env.MICROSOFT_CLIENT_SECRET = 'ms-client-secret'
    process.env.GRAPH_WEBHOOK_SECRET = 'webhook-secret'
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
    delete process.env.MICROSOFT_CLIENT_ID
    delete process.env.MICROSOFT_CLIENT_SECRET
    delete process.env.GRAPH_WEBHOOK_SECRET
    delete process.env.TOKEN_ENCRYPTION_KEY
  })

  // ── refreshTokenIfNeeded (via syncInbox) ──────────────────────────────────

  describe('token refresh', () => {
    it('uses existing access token when not expiring soon', async () => {
      const account = makeAccount({
        outlookTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      })
      const provider = new OutlookProvider(account)

      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({
          value: [],
          '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltaToken=tok123',
        })
      )

      await provider.syncInbox()

      // Token endpoint should NOT have been called
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0][0]).toContain('graph.microsoft.com')
      expect(vi.mocked(decryptToken)).toHaveBeenCalledWith('enc:valid-access-token')
    })

    it('refreshes token when expiry is within 5 minutes', async () => {
      const account = makeAccount({
        outlookTokenExpiry: new Date(Date.now() + 4 * 60 * 1000), // 4 min left
      })
      const provider = new OutlookProvider(account)

      // First call = token refresh, second = delta query
      fetchMock
        .mockResolvedValueOnce(
          makeFetchResponse({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
          })
        )
        .mockResolvedValueOnce(
          makeFetchResponse({
            value: [],
            '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltaToken=tok456',
          })
        )

      await provider.syncInbox()

      expect(fetchMock).toHaveBeenCalledTimes(2)
      const [tokenUrl] = fetchMock.mock.calls[0] as [string]
      expect(tokenUrl).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/token')

      expect(vi.mocked(prisma.emailAccount.update)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'account-1' },
          data: expect.objectContaining({
            outlookAccessToken: 'enc:new-access-token',
            outlookRefreshToken: 'enc:new-refresh-token',
          }),
        })
      )
    })

    it('refreshes token when outlookTokenExpiry is null', async () => {
      const account = makeAccount({ outlookTokenExpiry: null })
      const provider = new OutlookProvider(account)

      fetchMock
        .mockResolvedValueOnce(
          makeFetchResponse({
            access_token: 'new-access-token',
            expires_in: 3600,
          })
        )
        .mockResolvedValueOnce(
          makeFetchResponse({
            value: [],
            '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltaToken=t',
          })
        )

      await provider.syncInbox()

      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://login.microsoftonline.com/common/oauth2/v2.0/token'
      )
    })

    it('throws when refresh token is missing and token is expired', async () => {
      const account = makeAccount({
        outlookRefreshToken: null,
        outlookTokenExpiry: new Date(Date.now() - 1000),
      })
      const provider = new OutlookProvider(account)

      await expect(provider.syncInbox()).rejects.toThrow('no refresh token available')
    })

    it('throws when MICROSOFT_CLIENT_ID is missing', async () => {
      delete process.env.MICROSOFT_CLIENT_ID
      const account = makeAccount({
        outlookTokenExpiry: new Date(Date.now() - 1000),
      })
      const provider = new OutlookProvider(account)

      await expect(provider.syncInbox()).rejects.toThrow(
        'MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET environment variables are required'
      )
    })

    it('throws when token refresh HTTP call fails', async () => {
      const account = makeAccount({
        outlookTokenExpiry: new Date(Date.now() - 1000),
      })
      const provider = new OutlookProvider(account)

      fetchMock.mockResolvedValueOnce(makeFetchResponse({}, 401))

      await expect(provider.syncInbox()).rejects.toThrow('token refresh failed: 401')
    })

    it('preserves existing refresh token when response omits refresh_token', async () => {
      const account = makeAccount({
        outlookTokenExpiry: new Date(Date.now() - 1000),
        outlookRefreshToken: 'enc:old-refresh-token',
      })
      const provider = new OutlookProvider(account)

      fetchMock
        .mockResolvedValueOnce(
          makeFetchResponse({ access_token: 'new-access', expires_in: 3600 })
        )
        .mockResolvedValueOnce(
          makeFetchResponse({
            value: [],
            '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltaToken=t',
          })
        )

      await provider.syncInbox()

      expect(vi.mocked(prisma.emailAccount.update)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outlookRefreshToken: 'enc:old-refresh-token',
          }),
        })
      )
    })
  })

  // ── syncInbox ─────────────────────────────────────────────────────────────

  describe('syncInbox', () => {
    it('performs initial delta sync when no deltaLink is stored', async () => {
      const account = makeAccount({ deltaLink: null })
      const provider = new OutlookProvider(account)

      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({
          value: [makeGraphMessage()],
          '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltaToken=abc',
        })
      )

      const result = await provider.syncInbox()

      const url = fetchMock.mock.calls[0][0] as string
      expect(url).toContain('$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime')
      expect(result.newMessages).toBe(1)
      expect(result.messagesProcessed).toBe(1)
      expect(result.deltaLink).toBe('abc')
      expect(result.provider).toBe('OUTLOOK')
    })

    it('uses stored deltaLink for incremental sync', async () => {
      const account = makeAccount({ deltaLink: 'existing-token' })
      const provider = new OutlookProvider(account)

      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({
          value: [],
          '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltaToken=existing-token',
        })
      )

      await provider.syncInbox()

      const url = fetchMock.mock.calls[0][0] as string
      expect(url).toContain('$deltaToken=existing-token')
    })

    it('paginates through @odata.nextLink until deltaLink appears', async () => {
      const account = makeAccount()
      const provider = new OutlookProvider(account)

      fetchMock
        .mockResolvedValueOnce(
          makeFetchResponse({
            value: [makeGraphMessage({ id: 'msg-1' })],
            '@odata.nextLink': 'https://graph.microsoft.com/v1.0/next-page',
          })
        )
        .mockResolvedValueOnce(
          makeFetchResponse({
            value: [makeGraphMessage({ id: 'msg-2' })],
            '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltaToken=final',
          })
        )

      const result = await provider.syncInbox()

      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(result.newMessages).toBe(2)
      expect(result.deltaLink).toBe('final')
    })

    it('counts existing messages as updated', async () => {
      const account = makeAccount()
      const provider = new OutlookProvider(account)

      vi.mocked(prisma.inboundEmail.findUnique).mockResolvedValue({ id: 'existing' } as never)

      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({
          value: [makeGraphMessage()],
          '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltaToken=tok',
        })
      )

      const result = await provider.syncInbox()

      expect(result.newMessages).toBe(0)
      expect(result.messagesProcessed).toBe(1)
    })

    it('stores updated deltaLink in the database', async () => {
      const account = makeAccount()
      const provider = new OutlookProvider(account)

      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({
          value: [],
          '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltaToken=new-token',
        })
      )

      await provider.syncInbox()

      expect(vi.mocked(prisma.emailAccount.update)).toHaveBeenCalledWith({
        where: { id: 'account-1' },
        data: { deltaLink: 'new-token' },
      })
    })

    it('creates EmailThread for messages with a new conversationId', async () => {
      const account = makeAccount()
      const provider = new OutlookProvider(account)

      vi.mocked(prisma.emailThread.findFirst).mockResolvedValue(null)

      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({
          value: [makeGraphMessage({ conversationId: 'conv-abc' })],
          '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltaToken=t',
        })
      )

      await provider.syncInbox()

      expect(vi.mocked(prisma.emailThread.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ providerThreadId: 'conv-abc' }),
        })
      )
    })

    it('reuses existing EmailThread for a known conversationId', async () => {
      const account = makeAccount()
      const provider = new OutlookProvider(account)

      vi.mocked(prisma.emailThread.findFirst).mockResolvedValue({ id: 'existing-thread' } as never)

      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({
          value: [makeGraphMessage({ conversationId: 'conv-abc' })],
          '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltaToken=t',
        })
      )

      await provider.syncInbox()

      expect(vi.mocked(prisma.emailThread.create)).not.toHaveBeenCalled()
    })

    it('handles messages without optional fields gracefully', async () => {
      const account = makeAccount()
      const provider = new OutlookProvider(account)

      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({
          value: [{ id: 'bare-msg' }],
          '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltaToken=t',
        })
      )

      await expect(provider.syncInbox()).resolves.not.toThrow()
    })

    it('throws when Graph delta request fails', async () => {
      const account = makeAccount()
      const provider = new OutlookProvider(account)

      fetchMock.mockResolvedValueOnce(makeFetchResponse({}, 500))

      await expect(provider.syncInbox()).rejects.toThrow('Graph GET failed')
    })

    it('returns zero counts and no deltaLink when response is empty', async () => {
      const account = makeAccount()
      const provider = new OutlookProvider(account)

      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({
          value: [],
        })
      )

      const result = await provider.syncInbox()

      expect(result.newMessages).toBe(0)
      expect(result.messagesProcessed).toBe(0)
      expect(result.deltaLink).toBeUndefined()
    })
  })

  // ── getAttachment ─────────────────────────────────────────────────────────

  describe('getAttachment', () => {
    it('returns a Buffer from the Graph attachment endpoint', async () => {
      const account = makeAccount()
      const provider = new OutlookProvider(account)

      const fakeBuffer = new ArrayBuffer(16)
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: vi.fn().mockResolvedValue(fakeBuffer),
      } as unknown as Response)

      const result = await provider.getAttachment('msg-1', 'attach-1')

      expect(result).toBeInstanceOf(Buffer)
      expect(result.length).toBe(16)
    })

    it('calls the correct Graph endpoint', async () => {
      const account = makeAccount()
      const provider = new OutlookProvider(account)

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
      } as unknown as Response)

      await provider.getAttachment('msg-abc', 'attach-xyz')

      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://graph.microsoft.com/v1.0/me/messages/msg-abc/attachments/attach-xyz/$value'
      )
    })

    it('throws when the Graph request fails', async () => {
      const account = makeAccount()
      const provider = new OutlookProvider(account)

      fetchMock.mockResolvedValueOnce(makeFetchResponse({}, 403))

      await expect(provider.getAttachment('msg-1', 'attach-1')).rejects.toThrow(
        'OutlookProvider.getAttachment failed: 403'
      )
    })
  })

  // ── sendReply ─────────────────────────────────────────────────────────────

  describe('sendReply', () => {
    it('posts reply to Graph and updates InboundEmail status to PROCESSED', async () => {
      const account = makeAccount()
      const provider = new OutlookProvider(account)

      fetchMock.mockResolvedValueOnce(makeFetchResponse(null, 202))

      await provider.sendReply('msg-1', { bodyText: 'Reply text' })

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://graph.microsoft.com/v1.0/me/messages/msg-1/reply')
      expect((init as { method: string }).method).toBe('POST')

      const parsedBody = JSON.parse((init as { body: string }).body)
      expect(parsedBody.message.body.content).toBe('Reply text')
      expect(parsedBody.message.body.contentType).toBe('Text')

      expect(vi.mocked(prisma.inboundEmail.updateMany)).toHaveBeenCalledWith({
        where: { emailAccountId: 'account-1', providerMessageId: 'msg-1' },
        data: { status: 'PROCESSED' },
      })
    })

    it('throws when Graph reply request fails', async () => {
      const account = makeAccount()
      const provider = new OutlookProvider(account)

      fetchMock.mockResolvedValueOnce(makeFetchResponse({}, 400))

      await expect(
        provider.sendReply('msg-1', { bodyText: 'Reply' })
      ).rejects.toThrow('OutlookProvider.sendReply failed: 400')
    })

    it('does not update DB status when Graph call fails', async () => {
      const account = makeAccount()
      const provider = new OutlookProvider(account)

      fetchMock.mockResolvedValueOnce(makeFetchResponse({}, 500))

      await expect(provider.sendReply('msg-1', { bodyText: 'Reply' })).rejects.toThrow()
      expect(vi.mocked(prisma.inboundEmail.updateMany)).not.toHaveBeenCalled()
    })
  })

  // ── watchChanges ──────────────────────────────────────────────────────────

  describe('watchChanges', () => {
    it('creates a Graph subscription and returns WatchResult', async () => {
      const account = makeAccount()
      const provider = new OutlookProvider(account)

      const expiresAt = new Date(Date.now() + 4230 * 60 * 1000).toISOString()
      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({ id: 'sub-123', expirationDateTime: expiresAt })
      )

      const result = await provider.watchChanges('https://gabify.app/api/webhooks/graph')

      expect(result.provider).toBe('OUTLOOK')
      expect(result.subscriptionId).toBe('sub-123')
      expect(result.expiresAt).toBeInstanceOf(Date)
    })

    it('sends correct subscription payload', async () => {
      const account = makeAccount()
      const provider = new OutlookProvider(account)

      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({
          id: 'sub-1',
          expirationDateTime: new Date().toISOString(),
        })
      )

      await provider.watchChanges('https://gabify.app/api/webhooks/graph')

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://graph.microsoft.com/v1.0/subscriptions')
      const body = JSON.parse((init as { body: string }).body)
      expect(body.changeType).toBe('created,updated')
      expect(body.resource).toBe('me/mailFolders/inbox/messages')
      expect(body.notificationUrl).toBe('https://gabify.app/api/webhooks/graph')
      expect(body.clientState).toBe('webhook-secret')
    })

    it('throws when GRAPH_WEBHOOK_SECRET is not set', async () => {
      delete process.env.GRAPH_WEBHOOK_SECRET
      const account = makeAccount()
      const provider = new OutlookProvider(account)

      await expect(provider.watchChanges('https://example.com')).rejects.toThrow(
        'GRAPH_WEBHOOK_SECRET environment variable is not set'
      )
    })

    it('throws when Graph subscription request fails', async () => {
      const account = makeAccount()
      const provider = new OutlookProvider(account)

      fetchMock.mockResolvedValueOnce(makeFetchResponse({}, 400))

      await expect(
        provider.watchChanges('https://gabify.app/api/webhooks/graph')
      ).rejects.toThrow('OutlookProvider.watchChanges failed: 400')
    })
  })

  // ── encryptToken / decryptToken integration ───────────────────────────────

  describe('token encryption integration', () => {
    it('encrypts tokens before storing in the database on refresh', async () => {
      const account = makeAccount({
        outlookTokenExpiry: new Date(Date.now() - 1000),
      })
      const provider = new OutlookProvider(account)

      fetchMock
        .mockResolvedValueOnce(
          makeFetchResponse({
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            expires_in: 3600,
          })
        )
        .mockResolvedValueOnce(
          makeFetchResponse({
            value: [],
            '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltaToken=t',
          })
        )

      await provider.syncInbox()

      expect(vi.mocked(encryptToken)).toHaveBeenCalledWith('new-access')
      expect(vi.mocked(encryptToken)).toHaveBeenCalledWith('new-refresh')

      const updateCall = vi.mocked(prisma.emailAccount.update).mock.calls[0][0]
      expect(updateCall.data.outlookAccessToken).toBe('enc:new-access')
      expect(updateCall.data.outlookRefreshToken).toBe('enc:new-refresh')
    })

    it('decrypts the access token before using it in Authorization header', async () => {
      const account = makeAccount({
        outlookAccessToken: 'enc:decrypted-token',
        outlookTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      })
      const provider = new OutlookProvider(account)

      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({
          value: [],
          '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltaToken=t',
        })
      )

      await provider.syncInbox()

      const headers = (fetchMock.mock.calls[0][1] as { headers: Record<string, string> }).headers
      expect(headers.Authorization).toBe('Bearer decrypted-token')
    })
  })
})
