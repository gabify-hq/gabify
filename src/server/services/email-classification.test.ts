import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/anthropic', () => ({
  anthropic: {
    messages: {
      create: vi.fn(),
    },
  },
  CLAUDE_MODEL: 'claude-haiku-test',
  CLASSIFICATION_MAX_TOKENS: 512,
  DRAFT_MAX_TOKENS: 1024,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    document: {
      update: vi.fn(),
    },
  },
}))

import { anthropic } from '@/lib/anthropic'
import { prisma } from '@/lib/prisma'
import { classifyImage } from './email-classification'

function makeClassificationResponse(overrides = {}) {
  return {
    type: 'RECEIPT',
    confidence: 0.92,
    reasoning: 'Imagem mostra talão de caixa com valor total',
    extractedDate: '15/01/2024',
    extractedAmount: 42.50,
    extractedVATNumber: null,
    ...overrides,
  }
}

function makeAnthropicResponse(result: object) {
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
  }
}

describe('classifyImage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(anthropic.messages.create).mockResolvedValue(
      makeAnthropicResponse(makeClassificationResponse()) as never
    )
    vi.mocked(prisma.document.update).mockResolvedValue({} as never)
  })

  it('calls Claude Vision with base64 image and classification prompt', async () => {
    const buffer = Buffer.from('fake jpeg bytes')
    await classifyImage(buffer, 'image/jpeg', 'doc-1')

    expect(anthropic.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({
                type: 'image',
                source: expect.objectContaining({
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: buffer.toString('base64'),
                }),
              }),
              expect.objectContaining({ type: 'text' }),
            ]),
          }),
        ],
      })
    )
  })

  it('persists classification result to Document', async () => {
    await classifyImage(Buffer.from('img'), 'image/png', 'doc-2')

    expect(prisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc-2' },
        data: expect.objectContaining({
          type: 'RECEIPT',
          confidence: 0.92,
          status: 'CLASSIFIED',
        }),
      })
    )
  })

  it('sets status NEEDS_REVIEW when confidence < 0.85', async () => {
    vi.mocked(anthropic.messages.create).mockResolvedValue(
      makeAnthropicResponse(makeClassificationResponse({ confidence: 0.70 })) as never
    )

    await classifyImage(Buffer.from('img'), 'image/jpeg', 'doc-3')

    expect(prisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'NEEDS_REVIEW' }),
      })
    )
  })

  it('falls back to text classification for unsupported formats (TIFF)', async () => {
    // TIFF is not supported by Claude Vision — falls back to classifyDocument
    // which receives a placeholder text and classifies as OTHER
    vi.mocked(anthropic.messages.create).mockResolvedValue(
      makeAnthropicResponse({ type: 'OTHER', confidence: 0.5, reasoning: 'Formato não suportado' }) as never
    )

    const result = await classifyImage(Buffer.from('tiff data'), 'image/tiff', 'doc-4')

    // Should still return a classification result (not throw)
    expect(result.type).toBe('OTHER')
    // Called with text content, not image block
    const call = vi.mocked(anthropic.messages.create).mock.calls[0][0]
    const firstMessage = (call as { messages: Array<{ content: unknown }> }).messages[0]
    expect(firstMessage.content).toBeTypeOf('string')
  })

  it('returns classification result with extracted metadata', async () => {
    const result = await classifyImage(Buffer.from('img'), 'image/jpeg', 'doc-5')

    expect(result.type).toBe('RECEIPT')
    expect(result.confidence).toBe(0.92)
    expect(result.extractedAmount).toBe(42.50)
  })

  it('supports image/png media type', async () => {
    await classifyImage(Buffer.from('png data'), 'image/png', 'doc-6')

    const call = vi.mocked(anthropic.messages.create).mock.calls[0][0] as {
      messages: Array<{ content: Array<{ type: string; source?: { media_type: string } }> }>
    }
    const imageBlock = call.messages[0].content.find((c) => c.type === 'image')
    expect(imageBlock?.source?.media_type).toBe('image/png')
  })
})
