import Anthropic from '@anthropic-ai/sdk'

if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is required')

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Default model for classification and drafts
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-5'

// Token limits
export const CLASSIFICATION_MAX_TOKENS = 500
export const DRAFT_MAX_TOKENS = 1000
