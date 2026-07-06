// Mock data for Gabify dashboard — realistic Portuguese accounting context
// Used for demo/development without real email provider credentials

import type {
  ActionStatus,
  DocumentType,
  EmailStatus,
  ClientMatchResult,
} from '@/types'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MockClient {
  id: string
  name: string
  nif: string
  email: string
  emailDomains: string[]
  knownEmails: string[]
  missingDocuments: MockMissingDocument[]
  completionPct: number
  status: 'complete' | 'incomplete' | 'missing'
}

export interface MockMissingDocument {
  type: DocumentType
  label: string
  period: string
}

export interface MockEmail {
  id: string
  clientId: string | null
  clientName: string | null
  fromEmail: string
  fromName: string
  subject: string
  bodyText: string
  receivedAt: Date
  status: EmailStatus
  hasAttachments: boolean
  attachmentCount: number
  hasAction: boolean
  actionId?: string
}

export interface MockEmailAction {
  id: string
  emailId: string
  type: 'DRAFT_REPLY' | 'REQUEST_DOCS' | 'ARCHIVE'
  status: ActionStatus
  draftContent: string
  editedContent?: string | null
  aiModel: string
  createdAt: Date
}

export interface MockDocument {
  id: string
  clientId: string
  clientName: string
  filename: string
  type: DocumentType
  typeLabel: string
  confidence: number
  status: 'CLASSIFIED' | 'NEEDS_REVIEW' | 'REVIEWED'
  extractedDate: string | null
  extractedAmount: number | null
  extractedVATNumber: string | null
  r2Key: string
  createdAt: Date
  period: string // MM/YYYY
  classificationSource: string | null
}

// ─── Clients ─────────────────────────────────────────────────────────────────

export const MOCK_CLIENTS: MockClient[] = [
  {
    id: 'client-001',
    name: 'Construtora Alves & Filhos, Lda',
    nif: '509876543',
    email: 'contabilidade@alvesfilhos.pt',
    emailDomains: ['alvesfilhos.pt'],
    knownEmails: ['contabilidade@alvesfilhos.pt', 'jose.alves@alvesfilhos.pt'],
    completionPct: 100,
    status: 'complete',
    missingDocuments: [],
  },
  {
    id: 'client-002',
    name: 'Farmácia Central do Porto, Unipessoal',
    nif: '512345678',
    email: 'admin@farmaciacentral.pt',
    emailDomains: ['farmaciacentral.pt'],
    knownEmails: ['admin@farmaciacentral.pt'],
    completionPct: 67,
    status: 'incomplete',
    missingDocuments: [
      { type: 'BANK_STATEMENT', label: 'Extrato bancário', period: 'Abril 2025' },
      { type: 'PAYROLL', label: 'Recibos de vencimento', period: 'Abril 2025' },
    ],
  },
  {
    id: 'client-003',
    name: 'Restaurante O Tejo, Lda',
    nif: '507654321',
    email: 'geral@restauranteotejo.pt',
    emailDomains: ['restauranteotejo.pt'],
    knownEmails: ['geral@restauranteotejo.pt', 'faturas@restauranteotejo.pt'],
    completionPct: 33,
    status: 'missing',
    missingDocuments: [
      { type: 'INVOICE_RECEIVED', label: 'Faturas de fornecedores', period: 'Abril 2025' },
      { type: 'BANK_STATEMENT', label: 'Extrato bancário CGD', period: 'Abril 2025' },
      { type: 'SOCIAL_SECURITY', label: 'Declaração Segurança Social', period: 'Abril 2025' },
      { type: 'TAX_DOCUMENT', label: 'Declaração IVA', period: 'Abril 2025' },
    ],
  },
  {
    id: 'client-004',
    name: 'TechStart Lisboa, SA',
    nif: '514567890',
    email: 'financeiro@techstartlisboa.pt',
    emailDomains: ['techstartlisboa.pt'],
    knownEmails: ['financeiro@techstartlisboa.pt', 'ceo@techstartlisboa.pt'],
    completionPct: 83,
    status: 'incomplete',
    missingDocuments: [
      { type: 'PAYROLL', label: 'Processamento salarial', period: 'Abril 2025' },
    ],
  },
  {
    id: 'client-005',
    name: 'Clínica Dentária Sousa & Melo',
    nif: '508123456',
    email: 'clinica@sousaemelo.pt',
    emailDomains: ['sousaemelo.pt'],
    knownEmails: ['clinica@sousaemelo.pt'],
    completionPct: 100,
    status: 'complete',
    missingDocuments: [],
  },
  {
    id: 'client-006',
    name: 'Transportes Ferreira Norte, Lda',
    nif: '510987654',
    email: 'admin@ferreiranorte.pt',
    emailDomains: ['ferreiranorte.pt'],
    knownEmails: ['admin@ferreiranorte.pt', 'contab@ferreiranorte.pt'],
    completionPct: 0,
    status: 'missing',
    missingDocuments: [
      { type: 'INVOICE_RECEIVED', label: 'Faturas de fornecedores', period: 'Abril 2025' },
      { type: 'INVOICE_ISSUED', label: 'Faturas emitidas', period: 'Abril 2025' },
      { type: 'BANK_STATEMENT', label: 'Extrato bancário Millennium', period: 'Abril 2025' },
      { type: 'PAYROLL', label: 'Recibos de vencimento', period: 'Abril 2025' },
      { type: 'SOCIAL_SECURITY', label: 'TSU', period: 'Abril 2025' },
    ],
  },
]

// ─── Emails ───────────────────────────────────────────────────────────────────

export const MOCK_EMAILS: MockEmail[] = [
  {
    id: 'email-001',
    clientId: 'client-002',
    clientName: 'Farmácia Central do Porto',
    fromEmail: 'admin@farmaciacentral.pt',
    fromName: 'Ana Rodrigues',
    subject: 'Faturas de Abril - Farmácia Central',
    bodyText: `Boa tarde,

Segue em anexo as faturas de fornecedores referentes ao mês de Abril de 2025.

Em falta ainda o extrato bancário — assim que o tiver envio.

Com os melhores cumprimentos,
Ana Rodrigues
Farmácia Central do Porto`,
    receivedAt: new Date('2025-05-02T14:32:00'),
    status: 'UNREAD',
    hasAttachments: true,
    attachmentCount: 8,
    hasAction: true,
    actionId: 'action-001',
  },
  {
    id: 'email-002',
    clientId: 'client-003',
    clientName: 'Restaurante O Tejo',
    fromEmail: 'geral@restauranteotejo.pt',
    fromName: 'Carlos Mendes',
    subject: 'Documentos Abril 2025',
    bodyText: `Exmo. Sr. Contabilista,

Peço desculpa pelo atraso. Segue apenas a declaração de IVA em anexo. O extrato bancário e as faturas de fornecedores vou enviar até ao final da semana.

Atenciosamente,
Carlos Mendes`,
    receivedAt: new Date('2025-05-02T11:15:00'),
    status: 'UNREAD',
    hasAttachments: true,
    attachmentCount: 1,
    hasAction: true,
    actionId: 'action-002',
  },
  {
    id: 'email-003',
    clientId: 'client-004',
    clientName: 'TechStart Lisboa',
    fromEmail: 'financeiro@techstartlisboa.pt',
    fromName: 'Marta Figueiredo',
    subject: 'RE: Processamento salarial Abril',
    bodyText: `Olá,

Conforme combinado, segue em anexo o ficheiro com o processamento salarial de Abril de 2025 para os 12 colaboradores.

Ficamos aguardar confirmação de recepção.

Cumprimentos,
Marta Figueiredo
Directora Financeira — TechStart Lisboa`,
    receivedAt: new Date('2025-05-02T09:48:00'),
    status: 'READ',
    hasAttachments: true,
    attachmentCount: 2,
    hasAction: true,
    actionId: 'action-003',
  },
  {
    id: 'email-004',
    clientId: 'client-001',
    clientName: 'Construtora Alves & Filhos',
    fromEmail: 'jose.alves@alvesfilhos.pt',
    fromName: 'José Alves',
    subject: 'Dúvida sobre fatura nº 2025/0342',
    bodyText: `Boa tarde,

Recebi uma nota de liquidação adicional de IVA para a fatura nº 2025/0342, no valor de €847,50. Podia confirmar se está correcta e explicar a que se refere?

Grato,
José Alves`,
    receivedAt: new Date('2025-05-01T16:22:00'),
    status: 'UNREAD',
    hasAttachments: false,
    attachmentCount: 0,
    hasAction: true,
    actionId: 'action-004',
  },
  {
    id: 'email-005',
    clientId: 'client-006',
    clientName: 'Transportes Ferreira Norte',
    fromEmail: 'admin@ferreiranorte.pt',
    fromName: 'Paulo Ferreira',
    subject: 'Documentação em falta - urgente',
    bodyText: `Caro contabilista,

Já recebi a vossa mensagem. Vou tentar reunir tudo até amanhã. O nosso técnico de informática está a recuperar alguns ficheiros do servidor.

Paulo Ferreira`,
    receivedAt: new Date('2025-04-30T10:05:00'),
    status: 'READ',
    hasAttachments: false,
    attachmentCount: 0,
    hasAction: false,
  },
  {
    id: 'email-006',
    clientId: 'client-005',
    clientName: 'Clínica Dentária Sousa & Melo',
    fromEmail: 'clinica@sousaemelo.pt',
    fromName: 'Sofia Sousa',
    subject: 'Documentos Abril - completo',
    bodyText: `Boa tarde,

Envio em anexo toda a documentação de Abril: faturas de fornecedores, extrato BPI, recibos de vencimento e declaração SS.

Bom trabalho,
Sofia Sousa`,
    receivedAt: new Date('2025-04-29T15:40:00'),
    status: 'PROCESSED',
    hasAttachments: true,
    attachmentCount: 11,
    hasAction: false,
  },
  {
    id: 'email-007',
    clientId: null,
    clientName: null,
    fromEmail: 'at.notificacoes@at.gov.pt',
    fromName: 'Autoridade Tributária',
    subject: 'Notificação — Prazo IVA 2º Trimestre 2025',
    bodyText: `Notificação automática da Autoridade Tributária e Aduaneira.

Prazo para entrega da declaração periódica de IVA referente ao 2º trimestre de 2025: 15 de Agosto de 2025.

Portal das Finanças: www.portaldasfinancas.gov.pt`,
    receivedAt: new Date('2025-04-28T08:00:00'),
    status: 'READ',
    hasAttachments: false,
    attachmentCount: 0,
    hasAction: false,
  },
]

// ─── Email Actions (AI Drafts) ────────────────────────────────────────────────

export const MOCK_EMAIL_ACTIONS: MockEmailAction[] = [
  {
    id: 'action-001',
    emailId: 'email-001',
    type: 'DRAFT_REPLY',
    status: 'PENDING_REVIEW',
    draftContent: `Exma. Sra. Ana Rodrigues,

Confirmo a recepção das faturas de Abril. Ficaram registadas 8 facturas no sistema.

Quando disponível, peço que envie também o extrato bancário referente ao mês de Abril, necessário para concluir o processamento contabilístico.

Com os melhores cumprimentos,
Dr. António Ferreira`,
    aiModel: 'claude-sonnet-4-5',
    createdAt: new Date('2025-05-02T14:33:00'),
  },
  {
    id: 'action-002',
    emailId: 'email-002',
    type: 'DRAFT_REPLY',
    status: 'PENDING_REVIEW',
    draftContent: `Exmo. Sr. Carlos Mendes,

Boa tarde. Confirmamos a recepção da declaração de IVA de Abril.

Para concluir o processamento do mês ficam ainda em falta: extrato bancário e faturas de fornecedores. Solicito o envio até ao dia 7 de Maio para cumprirmos os prazos de entrega.

Com os melhores cumprimentos,
Dr. António Ferreira`,
    aiModel: 'claude-sonnet-4-5',
    createdAt: new Date('2025-05-02T11:16:00'),
  },
  {
    id: 'action-003',
    emailId: 'email-003',
    type: 'DRAFT_REPLY',
    status: 'PENDING_REVIEW',
    draftContent: `Exma. Sra. Marta Figueiredo,

Boa tarde. Confirmo a recepção do processamento salarial de Abril para os 12 colaboradores.

Os recibos serão processados e disponibilizados brevemente.

Com os melhores cumprimentos,
Dr. António Ferreira`,
    aiModel: 'claude-sonnet-4-5',
    createdAt: new Date('2025-05-02T09:49:00'),
  },
  {
    id: 'action-004',
    emailId: 'email-004',
    type: 'DRAFT_REPLY',
    status: 'PENDING_REVIEW',
    draftContent: `Exmo. Sr. José Alves,

Boa tarde. A nota de liquidação adicional de €847,50 refere-se à regularização de IVA da fatura nº 2025/0342, resultante de uma correcção à taxa aplicada à prestação de serviços de subempreitada — passou de 6% para 23%, conforme Ofício Circulado nº 30241/2024 da AT.

Fico disponível para qualquer esclarecimento adicional.

Com os melhores cumprimentos,
Dr. António Ferreira`,
    aiModel: 'claude-sonnet-4-5',
    createdAt: new Date('2025-05-01T16:23:00'),
  },
]

// ─── Documents ────────────────────────────────────────────────────────────────

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  INVOICE_RECEIVED: 'Fatura recebida',
  INVOICE_ISSUED: 'Fatura emitida',
  INVOICE_RECEIPT: 'Fatura-Recibo',
  RECEIPT: 'Recibo',
  BANK_STATEMENT: 'Extrato bancário',
  PAYROLL: 'Recibo de vencimento',
  TAX_DOCUMENT: 'Documento fiscal',
  AT_COMMUNICATION: 'Comunicação AT',
  SOCIAL_SECURITY: 'Segurança Social',
  CONTRACT: 'Contrato',
  BALANCE_SHEET: 'Balanço',
  INCOME_STATEMENT: 'Dem. resultados',
  OTHER: 'Outro',
}

export const MOCK_DOCUMENTS: MockDocument[] = [
  // Farmácia Central
  { id: 'doc-001', clientId: 'client-002', clientName: 'Farmácia Central do Porto', filename: 'fatura_medline_04_2025.pdf', type: 'INVOICE_RECEIVED', typeLabel: 'Fatura recebida', confidence: 0.97, status: 'CLASSIFIED', extractedDate: '30/04/2025', extractedAmount: 4231.80, extractedVATNumber: '512345678', r2Key: 'office-001/client-002/email-001/att-001.pdf', createdAt: new Date('2025-05-02T14:34:00'), period: '04/2025', classificationSource: null },
  { id: 'doc-002', clientId: 'client-002', clientName: 'Farmácia Central do Porto', filename: 'fatura_roche_diagnostics.pdf', type: 'INVOICE_RECEIVED', typeLabel: 'Fatura recebida', confidence: 0.95, status: 'CLASSIFIED', extractedDate: '28/04/2025', extractedAmount: 1875.00, extractedVATNumber: '501123456', r2Key: 'office-001/client-002/email-001/att-002.pdf', createdAt: new Date('2025-05-02T14:34:10'), period: '04/2025', classificationSource: null },
  { id: 'doc-003', clientId: 'client-002', clientName: 'Farmácia Central do Porto', filename: 'fatura_doc_final_v3.pdf', type: 'INVOICE_RECEIVED', typeLabel: 'Fatura recebida', confidence: 0.72, status: 'NEEDS_REVIEW', extractedDate: '25/04/2025', extractedAmount: 634.50, extractedVATNumber: null, r2Key: 'office-001/client-002/email-001/att-003.pdf', createdAt: new Date('2025-05-02T14:34:20'), period: '04/2025', classificationSource: null },
  // Restaurante O Tejo
  { id: 'doc-004', clientId: 'client-003', clientName: 'Restaurante O Tejo', filename: 'declaracao_iva_q1_2025.pdf', type: 'TAX_DOCUMENT', typeLabel: 'Documento fiscal', confidence: 0.94, status: 'CLASSIFIED', extractedDate: '30/04/2025', extractedAmount: 2340.00, extractedVATNumber: '507654321', r2Key: 'office-001/client-003/email-002/att-001.pdf', createdAt: new Date('2025-05-02T11:17:00'), period: '04/2025', classificationSource: null },
  // TechStart Lisboa
  { id: 'doc-005', clientId: 'client-004', clientName: 'TechStart Lisboa', filename: 'processamento_salarial_abril_2025.xlsx', type: 'PAYROLL', typeLabel: 'Recibo de vencimento', confidence: 0.91, status: 'CLASSIFIED', extractedDate: '30/04/2025', extractedAmount: 47820.00, extractedVATNumber: '514567890', r2Key: 'office-001/client-004/email-003/att-001.xlsx', createdAt: new Date('2025-05-02T09:50:00'), period: '04/2025', classificationSource: null },
  { id: 'doc-006', clientId: 'client-004', clientName: 'TechStart Lisboa', filename: 'mapa_ferias_abril.pdf', type: 'OTHER', typeLabel: 'Outro', confidence: 0.55, status: 'NEEDS_REVIEW', extractedDate: null, extractedAmount: null, extractedVATNumber: null, r2Key: 'office-001/client-004/email-003/att-002.pdf', createdAt: new Date('2025-05-02T09:50:10'), period: '04/2025', classificationSource: null },
  // Clínica Dentária
  { id: 'doc-007', clientId: 'client-005', clientName: 'Clínica Dentária Sousa & Melo', filename: 'extrato_bpi_abril_2025.pdf', type: 'BANK_STATEMENT', typeLabel: 'Extrato bancário', confidence: 0.98, status: 'CLASSIFIED', extractedDate: '30/04/2025', extractedAmount: null, extractedVATNumber: null, r2Key: 'office-001/client-005/email-006/att-001.pdf', createdAt: new Date('2025-04-29T15:41:00'), period: '04/2025', classificationSource: null },
  { id: 'doc-008', clientId: 'client-005', clientName: 'Clínica Dentária Sousa & Melo', filename: 'faturas_fornecedores_pack.pdf', type: 'INVOICE_RECEIVED', typeLabel: 'Fatura recebida', confidence: 0.89, status: 'REVIEWED', extractedDate: '29/04/2025', extractedAmount: 8920.00, extractedVATNumber: '508123456', r2Key: 'office-001/client-005/email-006/att-002.pdf', createdAt: new Date('2025-04-29T15:41:10'), period: '04/2025', classificationSource: null },
  { id: 'doc-009', clientId: 'client-005', clientName: 'Clínica Dentária Sousa & Melo', filename: 'ss_declaracao_marco_2025.pdf', type: 'SOCIAL_SECURITY', typeLabel: 'Segurança Social', confidence: 0.96, status: 'CLASSIFIED', extractedDate: '15/04/2025', extractedAmount: 3240.00, extractedVATNumber: '508123456', r2Key: 'office-001/client-005/email-006/att-003.pdf', createdAt: new Date('2025-04-29T15:41:20'), period: '03/2025', classificationSource: null },
  // Construtora Alves
  { id: 'doc-010', clientId: 'client-001', clientName: 'Construtora Alves & Filhos', filename: 'extrato_cgd_abril_2025.pdf', type: 'BANK_STATEMENT', typeLabel: 'Extrato bancário', confidence: 0.99, status: 'REVIEWED', extractedDate: '30/04/2025', extractedAmount: null, extractedVATNumber: null, r2Key: 'office-001/client-001/email-xxx/att-001.pdf', createdAt: new Date('2025-04-28T10:00:00'), period: '04/2025', classificationSource: null },
  { id: 'doc-011', clientId: 'client-001', clientName: 'Construtora Alves & Filhos', filename: 'fatura_betao_martins_lda.pdf', type: 'INVOICE_RECEIVED', typeLabel: 'Fatura recebida', confidence: 0.93, status: 'REVIEWED', extractedDate: '22/04/2025', extractedAmount: 12450.00, extractedVATNumber: '502987654', r2Key: 'office-001/client-001/email-xxx/att-002.pdf', createdAt: new Date('2025-04-28T10:00:10'), period: '04/2025', classificationSource: null },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getClientById(id: string): MockClient | undefined {
  return MOCK_CLIENTS.find((c) => c.id === id)
}

export function getEmailById(id: string): MockEmail | undefined {
  return MOCK_EMAILS.find((e) => e.id === id)
}

export function getActionByEmailId(emailId: string): MockEmailAction | undefined {
  return MOCK_EMAIL_ACTIONS.find((a) => a.emailId === emailId)
}

export function getDocumentsByClientId(clientId: string): MockDocument[] {
  return MOCK_DOCUMENTS.filter((d) => d.clientId === clientId)
}

export function getPendingActions(): MockEmailAction[] {
  return MOCK_EMAIL_ACTIONS.filter((a) => a.status === 'PENDING_REVIEW')
}

export function formatDateTime(date: Date): string {
  return date.toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 60) return `há ${diffMins}min`
  if (diffHours < 24) return `há ${diffHours}h`
  if (diffDays === 1) return 'ontem'
  if (diffDays < 7) return `há ${diffDays} dias`
  return formatDate(date)
}
