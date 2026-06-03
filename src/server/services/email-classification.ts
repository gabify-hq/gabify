import { anthropic, CLAUDE_MODEL, CLASSIFICATION_MAX_TOKENS, DRAFT_MAX_TOKENS } from '@/lib/anthropic'
import { prisma } from '@/lib/prisma'
import type { ClassificationResult, DocumentType } from '@/types'

// Claude Vision only supports these image types
const VISION_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

// Confidence thresholds (see document-classifier skill)
const CONFIDENCE_AUTO = 0.85
const CONFIDENCE_REVIEW = 0.60

/**
 * Classifies a document by its text content using Claude AI.
 * Returns classification result with type, confidence, and extracted metadata.
 *
 * Confidence thresholds:
 * - >= 0.85: auto-classify, flag for review only
 * - 0.60-0.84: classify but require accountant confirmation
 * - < 0.60: mark as UNKNOWN, require manual classification
 */
export async function classifyDocument(
  textContent: string,
  documentId: string
): Promise<ClassificationResult> {
  const prompt = buildClassificationPrompt(textContent)

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: CLASSIFICATION_MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = response.content[0]
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude')
  }

  let result: ClassificationResult
  try {
    // Strip markdown code fences if Claude wraps the response
    const jsonText = content.text.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '')
    // Claude occasionally returns an array for multi-page docs — take the first item
    const parsed: unknown = JSON.parse(jsonText)
    result = Array.isArray(parsed) ? (parsed[0] as ClassificationResult) : (parsed as ClassificationResult)
  } catch {
    throw new Error(`Failed to parse classification response: ${content.text}`)
  }

  // Persist classification result
  const status =
    result.confidence >= CONFIDENCE_AUTO
      ? 'CLASSIFIED'
      : result.confidence >= CONFIDENCE_REVIEW
        ? 'NEEDS_REVIEW'
        : 'NEEDS_REVIEW'

  await prisma.document.update({
    where: { id: documentId },
    data: {
      type: result.type as DocumentType,
      status,
      confidence: result.confidence,
      reasoning: result.reasoning,
      extractedDate: result.extractedDate
        ? parsePtDate(result.extractedDate)
        : null,
      extractedAmount: result.extractedAmount ?? null,
      extractedVATNumber: result.extractedVATNumber ?? null,
      aiModel: CLAUDE_MODEL,
    },
  })

  return result
}

/**
 * Classifies an image document (photo of receipt, scanned invoice, etc.)
 * using Claude Vision. Falls back to text-based classification with a
 * placeholder when the image format is not supported (e.g. TIFF).
 */
export async function classifyImage(
  buffer: Buffer,
  mimeType: string,
  documentId: string
): Promise<ClassificationResult> {
  if (!VISION_MEDIA_TYPES.has(mimeType)) {
    // Unsupported image format — classify via text path with a note
    return classifyDocument(`[Imagem em formato não suportado: ${mimeType}]`, documentId)
  }

  const mediaType = mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: CLASSIFICATION_MAX_TOKENS,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: buffer.toString('base64'),
            },
          },
          {
            type: 'text',
            text: buildClassificationPromptForImage(),
          },
        ],
      },
    ],
  })

  const content = response.content[0]
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude Vision')
  }

  let result: ClassificationResult
  try {
    result = JSON.parse(content.text)
  } catch {
    throw new Error(`Failed to parse Vision classification response: ${content.text}`)
  }

  const status =
    result.confidence >= 0.85
      ? 'CLASSIFIED'
      : 'NEEDS_REVIEW'

  await prisma.document.update({
    where: { id: documentId },
    data: {
      type: result.type as DocumentType,
      status,
      confidence: result.confidence,
      reasoning: result.reasoning,
      extractedDate: result.extractedDate ? parsePtDate(result.extractedDate) : null,
      extractedAmount: result.extractedAmount ?? null,
      extractedVATNumber: result.extractedVATNumber ?? null,
      aiModel: CLAUDE_MODEL,
    },
  })

  return result
}

/**
 * Classifies a scanned PDF by sending the raw PDF buffer to Claude's native PDF support.
 * Claude reads the PDF directly (including scanned pages via its own OCR).
 */
export async function classifyPdfDocument(
  buffer: Buffer,
  documentId: string
): Promise<ClassificationResult> {
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: CLASSIFICATION_MAX_TOKENS,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document' as const,
            source: {
              type: 'base64' as const,
              media_type: 'application/pdf' as const,
              data: buffer.toString('base64'),
            },
          },
          {
            type: 'text',
            text: buildClassificationPromptForImage(),
          },
        ],
      },
    ],
  })

  const content = response.content[0]
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude PDF classification')
  }

  let result: ClassificationResult
  try {
    const jsonText = content.text.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '')
    const parsed: unknown = JSON.parse(jsonText)
    result = Array.isArray(parsed) ? (parsed[0] as ClassificationResult) : (parsed as ClassificationResult)
  } catch {
    throw new Error(`Failed to parse PDF classification response: ${content.text}`)
  }

  const status = result.confidence >= CONFIDENCE_AUTO ? 'CLASSIFIED' : 'NEEDS_REVIEW'

  await prisma.document.update({
    where: { id: documentId },
    data: {
      type: result.type as DocumentType,
      status,
      confidence: result.confidence,
      reasoning: result.reasoning,
      extractedDate: result.extractedDate ? parsePtDate(result.extractedDate) : null,
      extractedAmount: result.extractedAmount ?? null,
      extractedVATNumber: result.extractedVATNumber ?? null,
      aiModel: CLAUDE_MODEL,
    },
  })

  return result
}

export interface ReceivedDocument {
  filename: string
  type: string
  typeLabel: string
}

/**
 * Generates an email draft reply using Claude AI.
 * Returns the draft text — NEVER sends automatically.
 * Caller is responsible for creating EmailAction + AuditLog.
 */
export async function generateEmailDraft(params: {
  inboundEmailId: string
  subject: string | null
  bodyText: string | null
  clientName: string | null
  accountantName: string
  receivedDocuments?: ReceivedDocument[]
}): Promise<string> {
  const { subject, bodyText, clientName, accountantName, receivedDocuments } = params

  const prompt = buildDraftPrompt({ subject, bodyText, clientName, accountantName, receivedDocuments })

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: DRAFT_MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = response.content[0]
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude')
  }

  return content.text
}

// ── Prompt builders ──

function buildClassificationPromptForImage(): string {
  return `És um classificador de documentos para um gabinete de contabilidade português.
Analisa a imagem em anexo e classifica o documento que vês.

Tipos válidos:
INVOICE_RECEIVED, INVOICE_ISSUED, RECEIPT, BANK_STATEMENT, PAYROLL,
TAX_DOCUMENT, AT_COMMUNICATION, SOCIAL_SECURITY, CONTRACT,
BALANCE_SHEET, INCOME_STATEMENT, OTHER

Responde APENAS em JSON, sem texto adicional:
{
  "type": "<DocumentType>",
  "confidence": <0.0-1.0>,
  "reasoning": "<uma frase em português>",
  "extractedDate": "<DD/MM/YYYY ou null>",
  "extractedAmount": <número ou null>,
  "extractedVATNumber": "<NIF de 9 dígitos ou null>"
}`
}

function buildClassificationPrompt(textContent: string): string {
  return `És um classificador de documentos para um gabinete de contabilidade português.
Analisa o seguinte texto e classifica o documento.

Tipos válidos:
INVOICE_RECEIVED, INVOICE_ISSUED, RECEIPT, BANK_STATEMENT, PAYROLL,
TAX_DOCUMENT, AT_COMMUNICATION, SOCIAL_SECURITY, CONTRACT,
BALANCE_SHEET, INCOME_STATEMENT, OTHER

Responde APENAS em JSON, sem texto adicional:
{
  "type": "<DocumentType>",
  "confidence": <0.0-1.0>,
  "reasoning": "<uma frase em português>",
  "extractedDate": "<DD/MM/YYYY ou null>",
  "extractedAmount": <número ou null>,
  "extractedVATNumber": "<NIF de 9 dígitos ou null>"
}

Texto do documento:
${textContent.slice(0, 8000)}`
}

function buildDraftPrompt(params: {
  subject: string | null
  bodyText: string | null
  clientName: string | null
  accountantName: string
  receivedDocuments?: ReceivedDocument[]
}): string {
  const { subject, bodyText, clientName, accountantName, receivedDocuments } = params

  const docsSection = receivedDocuments && receivedDocuments.length > 0
    ? `\nDocumentos recebidos e classificados neste email:\n${receivedDocuments.map(d => `- ${d.filename} → ${d.typeLabel}`).join('\n')}\n`
    : ''

  return `És um assistente de um contabilista português. Gera um rascunho de resposta ao email abaixo.

Regras:
- Linguagem: Português de Portugal (PT)
- Tom: profissional mas directo, sem frases de cortesia excessivas
- Máximo 150 palavras
- Não menciones AI, Claude ou automação
- Começa com "Exmo(a). Sr(a)." ou "Caro/a" conforme adequado
- Termina com "Com os melhores cumprimentos,\n${accountantName}"
- Datas no formato DD/MM/YYYY
- Responde APENAS o corpo do email, sem assunto ou metadados
- Se foram recebidos documentos, confirma a receção no rascunho — não peças documentos que já foram enviados
${docsSection}
${clientName ? `Cliente: ${clientName}` : ''}
${subject ? `Assunto: ${subject}` : ''}

Email recebido:
${bodyText?.slice(0, 3000) ?? '(sem corpo)'}`
}

// ── Helpers ──

function parsePtDate(dateStr: string): Date | null {
  // DD/MM/YYYY
  const [day, month, year] = dateStr.split('/')
  if (!day || !month || !year) return null
  const d = new Date(`${year}-${month}-${day}`)
  return isNaN(d.getTime()) ? null : d
}
