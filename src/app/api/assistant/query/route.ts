import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { guard } from '@/server/authz/guard'
import { checkAssistantRateLimit } from '@/server/rate-limit'
import { answerQuestion, AssistantError } from '@/server/services/assistant-service'

/**
 * POST /api/assistant/query — read-only Q&A over the session office data.
 *
 * Guard rails: RBAC `assistant:query` (OWNER/ACCOUNTANT/VIEWER), rate limit
 * 20 questions/min per user, zod-validated body, model failures mapped to a
 * clean pt-PT error (never a raw 500). Session history lives client-side —
 * nothing is persisted besides the immutable ASSISTANT_QUERY AuditLog.
 */

const bodySchema = z.object({
  question: z.string().trim().min(1).max(1000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(6000),
      }),
    )
    .max(20)
    .default([]),
})

export async function POST(request: NextRequest) {
  const gate = await guard('assistant:query')
  if (!gate.ok) return gate.response

  const rate = checkAssistantRateLimit(gate.user.id)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Demasiadas perguntas — aguarde um minuto' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    )
  }

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 422 })
  }
  const parsed = bodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Pergunta inválida' }, { status: 422 })
  }

  try {
    const result = await answerQuestion({
      officeId: gate.user.officeId,
      userId: gate.user.id,
      question: parsed.data.question,
      history: parsed.data.history,
    })
    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    // Model error/timeout/empty answer → clean message, never a raw 500.
    const message =
      error instanceof AssistantError && error.code === 'EMPTY_ANSWER'
        ? 'O assistente não devolveu uma resposta válida — tente reformular'
        : 'O assistente não conseguiu responder — tente novamente'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
