import { parsePtDate } from '@/lib/dates'
import { anthropic, CLAUDE_MODEL, CLASSIFICATION_MAX_TOKENS, DRAFT_MAX_TOKENS } from '@/lib/anthropic'
import { prisma } from '@/lib/prisma'
import type { ClassificationResult, DocumentType } from '@/types'
import type { ATQRData } from '@/lib/at-fiscal-qr'
import { atQRDocTypeToDocumentType, atQRDateToPT, atQRDocTypeLabel } from '@/lib/at-fiscal-qr'

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
      classificationSource: 'claude-text',
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
    const jsonText = content.text.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '')
    result = JSON.parse(jsonText)
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
      classificationSource: 'claude-vision',
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
      classificationSource: 'claude-pdf',
    },
  })

  return result
}

/**
 * Classifies a document based on filename patterns — no AI call needed.
 * Currently handles:
 *   - SAFT files: NIF-YEAR-MONTH-SAFT.xml → AT_COMMUNICATION, extracts NIF + period
 *
 * Returns null if the filename doesn't match any known pattern.
 */
export async function classifyFromFilename(
  filename: string,
  documentId: string
): Promise<ClassificationResult | null> {
  // SAFT-PT: NIF-YEAR-MONTH-SAFT.xml  (e.g. 514282320-2026-04-SAFT.xml)
  const saftMatch = filename.match(/^(\d{9})-(\d{4})-(\d{2})-SAFT\.xml$/i)
  if (saftMatch) {
    const [, nif, year, month] = saftMatch
    const datePT = `01/${month}/${year}` // first day of the covered period
    const reasoning = `Ficheiro SAF-T da AT (NIF ${nif}, período ${month}/${year})`

    await prisma.document.update({
      where: { id: documentId },
      data: {
        type: 'AT_COMMUNICATION' as DocumentType,
        status: 'CLASSIFIED',
        confidence: 0.99,
        reasoning,
        extractedDate: parsePtDate(datePT),
        extractedAmount: null,
        extractedVATNumber: nif,
        aiModel: 'filename-pattern',
        classificationSource: 'filename-pattern',
      },
    })

    return {
      type: 'AT_COMMUNICATION',
      confidence: 0.99,
      reasoning,
      extractedDate: datePT,
      extractedVATNumber: nif,
    }
  }

  return null
}

/**
 * Classifies a document directly from AT fiscal QR code data.
 * QR code data is authoritative — confidence is 0.99, no AI call needed.
 * Returns the ClassificationResult and persists to DB.
 */
export async function classifyFromATQR(
  atData: ATQRData,
  documentId: string
): Promise<ClassificationResult> {
  const type = atQRDocTypeToDocumentType(atData.docTypeCode) as DocumentType
  const confidence = 0.99
  const datePT = atQRDateToPT(atData.dateRaw)
  const reasoning = `QR code AT fiscal: ${atQRDocTypeLabel(atData.docTypeCode)} (${atData.docId || atData.docTypeCode})`

  await prisma.document.update({
    where: { id: documentId },
    data: {
      type,
      status: 'CLASSIFIED',
      confidence,
      reasoning,
      extractedDate: datePT ? parsePtDate(datePT) : null,
      extractedAmount: atData.totalAmount ?? null,
      extractedVATNumber: atData.nifEmitter || null,
      aiModel: 'at-qr-code',
      classificationSource: 'at-qr-code',
    },
  })

  return {
    type,
    confidence,
    reasoning,
    extractedDate: datePT ?? undefined,
    extractedAmount: atData.totalAmount ?? undefined,
    extractedVATNumber: atData.nifEmitter || undefined,
  }
}

export interface ReceivedDocument {
  filename: string
  type: string
  typeLabel: string
  extractedDate?: string | null     // DD/MM/YYYY
  extractedAmount?: number | null
  extractedVATNumber?: string | null // NIF 9 dígitos
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
Analisa o documento em anexo e classifica-o.

Tipos válidos e exemplos:
- INVOICE_RECEIVED — fatura recebida de fornecedor (ex: FT com NIF comprador)
- INVOICE_ISSUED — fatura emitida pelo cliente a terceiros
- INVOICE_RECEIPT — Fatura-Recibo (documento AT tipo FR: combina fatura + recibo de pagamento; ex: restaurante, combustível, serviços)
- RECEIPT — talão de caixa, recibo simples, fatura simplificada sem NIF do adquirente
- BANK_STATEMENT — extracto bancário
- PAYROLL — recibo de vencimento, processamento salarial
- TAX_DOCUMENT — declaração AT, IRS, IRC, IVA, IMI, etc.
- AT_COMMUNICATION — notificação ou comunicação da Autoridade Tributária
- SOCIAL_SECURITY — recibo ou declaração da Segurança Social
- CONTRACT — contrato ou acordo
- BALANCE_SHEET — balanço ou demonstração de posição financeira
- INCOME_STATEMENT — demonstração de resultados
- OTHER — qualquer outro documento

Notas importantes:
- "Fatura-Recibo" (FATURA-RECIBO, tipo FR na AT) → INVOICE_RECEIPT
- Fatura normal (tipo FT na AT) → INVOICE_RECEIVED
- Documentos certificados AT sem NIF adquirente → RECEIPT
- Talões de supermercado sem NIF → RECEIPT
- O campo extractedVATNumber é o NIF do emitente (9 dígitos)

REGRA CRÍTICA para extractedAmount — valor TOTAL FINAL pago (com IVA, após todos os descontos):
- Procura a linha com a palavra "TOTAL" seguida do valor final (ex: "TOTAL: Eur 66,49" ou "TOTAL A PAGAR: 66,49")
- Em recibos portugueses, o layout da secção de impostos é:
    TAXA    IVA      INCID.
    13%     5,36     41,23     ← bases tributáveis por taxa, IGNORA
    TOTAL INCIDÊNCIAS: 57,41   ← soma das bases SEM IVA, IGNORA
    DESCONTOS: 19,11            ← descontos já aplicados, IGNORA
    TOTAL:  Eur 66,49           ← ESTE é o valor correcto ✓
- NUNCA uses "TOTAL INCIDÊNCIAS", "Base Tributável", "Subtotal" nem valores de IVA isolados
- O total correcto = base tributável + IVA = aparece DEPOIS da linha DESCONTOS (se existir)

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
INVOICE_RECEIVED (fatura de fornecedor),
INVOICE_ISSUED (fatura emitida pelo cliente),
INVOICE_RECEIPT (Fatura-Recibo AT tipo FR — combina fatura + recibo),
RECEIPT (talão/recibo simples sem NIF adquirente),
BANK_STATEMENT, PAYROLL,
TAX_DOCUMENT, AT_COMMUNICATION, SOCIAL_SECURITY, CONTRACT,
BALANCE_SHEET, INCOME_STATEMENT, OTHER

Notas:
- Se o texto contiver "FATURA-RECIBO" ou tipo "FR" no cabeçalho → INVOICE_RECEIPT
- extractedAmount = valor TOTAL FINAL pago (com IVA, após descontos)
  NUNCA uses "TOTAL INCIDÊNCIAS" (base sem IVA) nem subtotais
  Em recibos PT: o valor correcto está na linha "TOTAL:" ou "TOTAL A PAGAR:", APÓS a linha "DESCONTOS:" se existir
- extractedVATNumber = NIF do emitente (9 dígitos)

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
    ? `\nDocumentos recebidos e classificados neste email:\n${receivedDocuments.map(d => {
        const meta: string[] = [`tipo: ${d.typeLabel}`]
        if (d.extractedDate) meta.push(`data: ${d.extractedDate}`)
        if (d.extractedAmount != null) meta.push(`valor: €${d.extractedAmount.toFixed(2)}`)
        if (d.extractedVATNumber) meta.push(`NIF: ${d.extractedVATNumber}`)
        return `- ${d.filename} (${meta.join(', ')})`
      }).join('\n')}\n`
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
- Se foram recebidos documentos, confirma a receção — não peças documentos que já foram enviados
- Responde APENAS ao que foi perguntado — não acrescentes perguntas, pedidos ou informações que o cliente não solicitou
- Se o cliente pediu confirmação, confirma e termina — não elabores nem peças dados adicionais
${docsSection}
${clientName ? `Cliente: ${clientName}` : ''}
${subject ? `Assunto: ${subject}` : ''}

Email recebido:
${bodyText?.slice(0, 3000) ?? '(sem corpo)'}`
}

// ── Helpers ──

export { parsePtDate } from '@/lib/dates'
