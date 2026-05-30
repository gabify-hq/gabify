---
name: document-classifier
description: Build or refine the Claude API prompt for classifying accounting documents by content. Use when working on document classification logic, prompt engineering for document types, or updating the classifier service.
---

# Skill: Document Classifier

This skill governs how documents are classified in Gabify using Claude AI.

## Classification is Content-Based
NEVER classify by filename. A file called `doc_final_v3.pdf` could be anything.
Always classify by extracted text content.

## Document Types (Portuguese accounting context)
```
INVOICE_RECEIVED      — fatura recebida (supplier invoices)
INVOICE_ISSUED        — fatura emitida (client invoices)
RECEIPT               — recibo
BANK_STATEMENT        — extrato bancário
PAYROLL               — recibo de vencimento / processamento salarial
TAX_DOCUMENT          — documentos fiscais (IRS, IRC, IVA, IMI)
AT_COMMUNICATION      — comunicações da Autoridade Tributária
SOCIAL_SECURITY       — segurança social / Taxa Social Única
CONTRACT              — contratos
BALANCE_SHEET         — balanço
INCOME_STATEMENT      — demonstração de resultados
OTHER                 — não identificado
```

## Claude Prompt Pattern
When building the classification prompt:
```
You are a document classifier for a Portuguese accounting firm.
Analyse the following document text and classify it.

Return JSON only:
{
  "type": "<DocumentType>",
  "confidence": <0.0–1.0>,
  "reasoning": "<one sentence in Portuguese>",
  "extractedDate": "<DD/MM/YYYY or null>",
  "extractedAmount": <number or null>,
  "extractedVATNumber": "<NIF or null>"
}

Document text:
<content>
```

## Confidence Thresholds
- `>= 0.85` → auto-classify, flag for review only
- `0.60–0.84` → classify but require accountant confirmation
- `< 0.60` → mark as UNKNOWN, require manual classification

## Gotchas
- Portuguese VAT numbers (NIF) are 9 digits — extract them when present
- AT communications often look like generic PDFs — check for "Portal das Finanças" or "Autoridade Tributária" text
- Bank statements from Portuguese banks (CGD, BPI, Millennium, Santander) have consistent formats — note these in examples
- Always pass `max_tokens: 500` — response is always compact JSON
