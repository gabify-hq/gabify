import { vi } from 'vitest'

/**
 * AI mock for the assistant module (tool-use loop).
 *
 * Unlike `mocks/ai.ts` (text-only queue), this mock queues FULL Anthropic
 * response objects so tests can drive the tool-use loop: each
 * `messages.create` call consumes one queued item. Queue an `Error` instance
 * to simulate a model/timeout failure.
 *
 * Usage:
 *   vi.mock('@/lib/anthropic', async () => (await import('../mocks/assistant-ai')).assistantAiMockFactory())
 */

export interface RecordedRequest {
  model: string
  system?: string
  messages: Array<{ role: string; content: unknown }>
  tools?: Array<{ name: string }>
  [key: string]: unknown
}

export const assistantAiState = {
  queue: [] as unknown[],
  calls: 0,
  requests: [] as RecordedRequest[],
  reset() {
    this.queue = []
    this.calls = 0
    this.requests = []
  },
}

export function assistantAiMockFactory() {
  return {
    anthropic: {
      messages: {
        create: vi.fn(async (body: RecordedRequest) => {
          assistantAiState.calls += 1
          assistantAiState.requests.push(body)
          const next = assistantAiState.queue.shift()
          if (next === undefined) {
            throw new Error('assistantAiState.queue empty — unexpected AI call in test')
          }
          if (next instanceof Error) throw next
          return next
        }),
      },
    },
    CLAUDE_MODEL: 'claude-test',
    CLASSIFICATION_MAX_TOKENS: 500,
    DRAFT_MAX_TOKENS: 1000,
  }
}

let toolUseSeq = 0

/** A model response requesting one tool call. */
export function toolUseResponse(name: string, input: Record<string, unknown>) {
  toolUseSeq += 1
  return {
    id: `msg_tool_${toolUseSeq}`,
    stop_reason: 'tool_use',
    content: [
      { type: 'text', text: 'A consultar os dados…' },
      { type: 'tool_use', id: `toolu_${toolUseSeq}`, name, input },
    ],
    usage: { input_tokens: 10, output_tokens: 10 },
  }
}

/** A final text answer from the model. */
export function textResponse(text: string) {
  return {
    id: 'msg_text',
    stop_reason: 'end_turn',
    content: [{ type: 'text', text }],
    usage: { input_tokens: 10, output_tokens: 10 },
  }
}
