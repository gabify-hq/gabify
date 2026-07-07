import { PDFDocument, StandardFonts } from 'pdf-lib'
import { prisma } from '@/lib/prisma'
import { uploadToR2 } from '@/lib/r2'
import { decimalStringFromCents } from '@/lib/money'
import { isValidNif } from '@/lib/nif'
import { createOffice, createUserInOffice } from './office-service'
import { createSupplierRule } from './supplier-rule-service'
import { seedSncTaxonomy } from './snc-service'
import { sha256 } from './upload-service'
import {
  createBankStatementImport,
  confirmBankStatementImport,
} from './bank-import-service'
import { runMatchingForImport } from './bank-matching'
import { reconcileTransaction } from './bank-reconciliation-service'
import type { DocumentStatus, DocumentType, Prisma } from '@prisma/client'

/**
 * Demonstration seed (`npm run seed:demo`) — builds a complete, realistic
 * "Gabinete Demo" office through the SAME services the app uses (never raw
 * SQL): users, clients, ~30 documents with synthetic PDFs, supplier rule, SNC
 * suggestion, a bank statement import with real matching + reconciliations,
 * and a pending copilot draft.
 *
 * Invariants:
 *  - idempotent: the demo OWNER email is the deterministic marker — if that
 *    user already exists the seed is a no-op (second run duplicates nothing);
 *  - money is integer cents end-to-end; Decimal columns receive strings via
 *    decimalStringFromCents; every document satisfies
 *    Σbases + ΣIVA − retenção = total to the cent;
 *  - every NIF is FICTIONAL but checksum-valid (asserted at build time);
 *  - the AI pipeline is never invoked;
 *  - refuses to run with NODE_ENV=production unless SEED_DEMO_FORCE=true.
 */

export const DEMO_OFFICE_NAME = 'Gabinete Demo'
const DEFAULT_OWNER_EMAIL = 'demo@gabify.local'

export interface DemoSeedResult {
  created: boolean
  officeId: string
  counts: {
    users: number
    clients: number
    documents: number
    bankTransactions: number
    reconciled: number
    ignored: number
    pendingSuggestions: number
    emailDrafts: number
  }
  warnings: string[]
}

// ── Fictional, checksum-valid NIFs ───────────────────────────────────────────

/** Appends the module-11 check digit to an 8-digit prefix. */
function makeTestNif(prefix8: string): string {
  if (!/^\d{8}$/.test(prefix8)) throw new Error(`NIF prefix must be 8 digits: ${prefix8}`)
  const digits = prefix8.split('').map(Number)
  const sum = digits.reduce((acc, d, i) => acc + d * (9 - i), 0)
  const remainder = sum % 11
  const check = remainder < 2 ? 0 : 11 - remainder
  const nif = `${prefix8}${check}`
  if (!isValidNif(nif)) throw new Error(`Generated test NIF failed its own checksum: ${nif}`)
  return nif
}

// Deliberately implausible 5099 99xx / 2099 99xx ranges — never real entities.
const NIF = {
  clientServices: makeTestNif('50999901'),
  clientRestaurant: makeTestNif('50999902'),
  clientFreelancer: makeTestNif('20999901'),
  supTechsoft: makeTestNif('50999911'),
  supImobiliaria: makeTestNif('50999912'),
  supTelecom: makeTestNif('50999913'),
  supAlimentar: makeTestNif('50999914'),
  supAdega: makeTestNif('50999915'),
  supEnergia: makeTestNif('50999916'),
  supPapelaria: makeTestNif('50999917'),
  buyerEmpresaX: makeTestNif('50999921'),
  buyerEmpresaY: makeTestNif('50999922'),
}

// ── Dates (UTC noon — house convention) ──────────────────────────────────────

function daysAgo(days: number): Date {
  const d = new Date(Date.now() - days * 24 * 3600 * 1000)
  return new Date(`${d.toISOString().slice(0, 10)}T12:00:00.000Z`)
}

function ptDate(date: Date): string {
  const iso = date.toISOString().slice(0, 10)
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

// ── Document plan ────────────────────────────────────────────────────────────

interface VatBand {
  rate: number
  baseCents: number
  vatCents: number
}

interface DocPlan {
  key: string // deterministic id inside the plan (documentNumber base)
  client: 'A' | 'B' | 'C'
  type: DocumentType
  status: DocumentStatus
  documentNumber: string
  supplierName?: string
  supplierNif?: string
  buyerName?: string
  buyerNif?: string
  issueDaysAgo: number
  dueDaysAgo?: number
  bands: VatBand[]
  withholdingCents?: number
  flags?: string[]
  confidence: number
  suggestedAccountCode?: string
  suggestedVatTreatment?: string
  sncSource?: string
  exported?: boolean
  duplicateOfKey?: string
  wrongClientSuggested?: 'A' | 'B' | 'C'
}

function band23(baseCents: number): VatBand {
  // 23% VAT computed with integer math, half up
  return { rate: 23, baseCents, vatCents: Math.round((baseCents * 23) / 100) }
}

function totalCentsOf(plan: DocPlan): number {
  const base = plan.bands.reduce((acc, b) => acc + b.baseCents, 0)
  const vat = plan.bands.reduce((acc, b) => acc + b.vatCents, 0)
  return base + vat - (plan.withholdingCents ?? 0)
}

/**
 * ~30 documents across the 3 clients: both directions, varied states, VAT
 * shapes (23%, 6%+23%, exempt, IRS retention), a duplicate pair and a
 * wrong-client suspect. Client A's VALIDATED received invoices are engineered
 * to line up with the bank statement below (exact cents).
 */
const DOC_PLANS: DocPlan[] = [
  // — Client A (Silva & Costa Consultores) — bank-reconciliation targets —
  { key: 'A-R1', client: 'A', type: 'INVOICE_RECEIVED', status: 'VALIDATED', documentNumber: 'FT TS/2026-014', supplierName: 'TechSoft Soluções, Lda', supplierNif: NIF.supTechsoft, issueDaysAgo: 12, dueDaysAgo: 8, bands: [band23(69000)], confidence: 0.98 },
  { key: 'A-R2', client: 'A', type: 'INVOICE_RECEIVED', status: 'VALIDATED', documentNumber: 'REC IC/2026-88', supplierName: 'Imobiliária Central, Lda', supplierNif: NIF.supImobiliaria, issueDaysAgo: 18, dueDaysAgo: 15, bands: [{ rate: 0, baseCents: 30000, vatCents: 0 }], confidence: 0.97 },
  { key: 'A-R3', client: 'A', type: 'INVOICE_RECEIVED', status: 'VALIDATED', documentNumber: 'FT PT/2026-5521', supplierName: 'Teleco Ibérica Fictícia, SA', supplierNif: NIF.supTelecom, issueDaysAgo: 25, dueDaysAgo: 22, bands: [band23(4900)], confidence: 0.99 },
  { key: 'A-R4', client: 'A', type: 'INVOICE_RECEIVED', status: 'VALIDATED', documentNumber: 'FT TS/2026-021', supplierName: 'TechSoft Soluções, Lda', supplierNif: NIF.supTechsoft, issueDaysAgo: 40, dueDaysAgo: 36, bands: [band23(129000)], confidence: 0.98 },
  { key: 'A-R5', client: 'A', type: 'INVOICE_RECEIVED', status: 'VALIDATED', documentNumber: 'FT PM/2026-303', supplierName: 'Papelaria Modelo, Lda', supplierNif: NIF.supPapelaria, issueDaysAgo: 48, dueDaysAgo: 45, bands: [band23(18000)], confidence: 0.96 },
  // — Client A — pending-suggestion targets (exact amounts, varied dates) —
  { key: 'A-S1', client: 'A', type: 'INVOICE_RECEIVED', status: 'VALIDATED', documentNumber: 'FT EN/2026-777', supplierName: 'Energia Verde Fictícia, SA', supplierNif: NIF.supEnergia, issueDaysAgo: 6, dueDaysAgo: 4, bands: [band23(37000)], confidence: 0.97 },
  { key: 'A-S2', client: 'A', type: 'INVOICE_RECEIVED', status: 'VALIDATED', documentNumber: 'FT EN/2026-812', supplierName: 'Energia Verde Fictícia, SA', supplierNif: NIF.supEnergia, issueDaysAgo: 42, dueDaysAgo: 40, bands: [band23(39000)], confidence: 0.97 },
  { key: 'A-S3', client: 'A', type: 'INVOICE_RECEIVED', status: 'VALIDATED', documentNumber: 'FT TS/2026-030', supplierName: 'TechSoft Soluções, Lda', supplierNif: NIF.supTechsoft, issueDaysAgo: 30, dueDaysAgo: 28, bands: [band23(50000)], confidence: 0.98 },
  { key: 'A-S4', client: 'A', type: 'INVOICE_RECEIVED', status: 'VALIDATED', documentNumber: 'FT PM/2026-410', supplierName: 'Papelaria Modelo, Lda', supplierNif: NIF.supPapelaria, issueDaysAgo: 85, dueDaysAgo: 82, bands: [band23(10000)], confidence: 0.95 },
  // — Client A — issued + misc —
  { key: 'A-I1', client: 'A', type: 'INVOICE_ISSUED', status: 'VALIDATED', documentNumber: 'FT A/2026-101', buyerName: 'Empresa X Fictícia, Lda', buyerNif: NIF.buyerEmpresaX, issueDaysAgo: 14, bands: [band23(71000)], confidence: 1.0 },
  { key: 'A-I2', client: 'A', type: 'INVOICE_ISSUED', status: 'PRE_VALIDATED', documentNumber: 'FT A/2026-102', buyerName: 'Empresa Y Fictícia, Lda', buyerNif: NIF.buyerEmpresaY, issueDaysAgo: 5, bands: [band23(118000)], confidence: 0.99 },
  { key: 'A-DUP0', client: 'A', type: 'INVOICE_RECEIVED', status: 'VALIDATED', documentNumber: 'FT AD/2026-055', supplierName: 'Adega do Vale, Lda', supplierNif: NIF.supAdega, issueDaysAgo: 33, dueDaysAgo: 30, bands: [band23(27000)], confidence: 0.98 },
  { key: 'A-DUP1', client: 'A', type: 'INVOICE_RECEIVED', status: 'NEEDS_REVIEW', documentNumber: 'FT AD/2026-055', supplierName: 'Adega do Vale, Lda', supplierNif: NIF.supAdega, issueDaysAgo: 33, dueDaysAgo: 30, bands: [band23(27000)], confidence: 0.9, flags: ['DUPLICATE_SUSPECT'], duplicateOfKey: 'A-DUP0' },
  { key: 'A-M1', client: 'A', type: 'RECEIPT', status: 'NEEDS_REVIEW', documentNumber: 'FS PM/2026-77', supplierName: 'Papelaria Modelo, Lda', supplierNif: NIF.supPapelaria, issueDaysAgo: 3, bands: [band23(2350)], confidence: 0.61, flags: ['ARITHMETIC_MISMATCH'] },
  // — Client B (Restaurante O Tacho) —
  { key: 'B-1', client: 'B', type: 'INVOICE_RECEIVED', status: 'NEEDS_REVIEW', documentNumber: 'FT DA/2026-901', supplierName: 'Distribuidora Alimentar Norte, Lda', supplierNif: NIF.supAlimentar, issueDaysAgo: 2, bands: [{ rate: 6, baseCents: 84500, vatCents: 5070 }, band23(21500)], confidence: 0.72, suggestedAccountCode: '6221', suggestedVatTreatment: 'DEDUTIVEL_TOTAL', sncSource: 'HISTORY' },
  { key: 'B-2', client: 'B', type: 'INVOICE_RECEIVED', status: 'NEEDS_REVIEW', documentNumber: 'FT AD/2026-140', supplierName: 'Adega do Vale, Lda', supplierNif: NIF.supAdega, issueDaysAgo: 9, bands: [band23(46800)], confidence: 0.66, flags: ['WRONG_CLIENT_SUSPECT'], wrongClientSuggested: 'A' },
  { key: 'B-3', client: 'B', type: 'INVOICE_RECEIVED', status: 'PRE_VALIDATED', documentNumber: 'FT DA/2026-955', supplierName: 'Distribuidora Alimentar Norte, Lda', supplierNif: NIF.supAlimentar, issueDaysAgo: 16, bands: [{ rate: 6, baseCents: 51200, vatCents: 3072 }, band23(9900)], confidence: 0.97 },
  { key: 'B-4', client: 'B', type: 'INVOICE_RECEIVED', status: 'PRE_VALIDATED', documentNumber: 'FT EN/2026-880', supplierName: 'Energia Verde Fictícia, SA', supplierNif: NIF.supEnergia, issueDaysAgo: 21, bands: [band23(28700)], confidence: 0.98 },
  { key: 'B-5', client: 'B', type: 'INVOICE_RECEIVED', status: 'VALIDATED', documentNumber: 'REC IC/2026-92', supplierName: 'Imobiliária Central, Lda', supplierNif: NIF.supImobiliaria, issueDaysAgo: 47, bands: [{ rate: 0, baseCents: 65000, vatCents: 0 }], confidence: 0.97 },
  { key: 'B-6', client: 'B', type: 'INVOICE_RECEIVED', status: 'VALIDATED', documentNumber: 'FT PT/2026-6110', supplierName: 'Teleco Ibérica Fictícia, SA', supplierNif: NIF.supTelecom, issueDaysAgo: 55, bands: [band23(6200)], confidence: 0.99 },
  { key: 'B-E1', client: 'B', type: 'INVOICE_RECEIVED', status: 'EXPORTED', documentNumber: 'FT DA/2026-702', supplierName: 'Distribuidora Alimentar Norte, Lda', supplierNif: NIF.supAlimentar, issueDaysAgo: 70, bands: [{ rate: 6, baseCents: 92000, vatCents: 5520 }, band23(14400)], confidence: 0.98, exported: true },
  { key: 'B-E2', client: 'B', type: 'INVOICE_RECEIVED', status: 'EXPORTED', documentNumber: 'FT AD/2026-090', supplierName: 'Adega do Vale, Lda', supplierNif: NIF.supAdega, issueDaysAgo: 75, bands: [band23(38100)], confidence: 0.97, exported: true },
  { key: 'B-E3', client: 'B', type: 'INVOICE_RECEIVED', status: 'EXPORTED', documentNumber: 'FT EN/2026-701', supplierName: 'Energia Verde Fictícia, SA', supplierNif: NIF.supEnergia, issueDaysAgo: 80, bands: [band23(26100)], confidence: 0.98, exported: true },
  // — Client C (Ana Ferreira, freelancer — IRS retention on issued invoices) —
  { key: 'C-I1', client: 'C', type: 'INVOICE_ISSUED', status: 'VALIDATED', documentNumber: 'FR AF/2026-31', buyerName: 'Empresa X Fictícia, Lda', buyerNif: NIF.buyerEmpresaX, issueDaysAgo: 10, bands: [band23(120000)], withholdingCents: 30000, confidence: 1.0 },
  { key: 'C-I2', client: 'C', type: 'INVOICE_ISSUED', status: 'PRE_VALIDATED', documentNumber: 'FR AF/2026-32', buyerName: 'Empresa Y Fictícia, Lda', buyerNif: NIF.buyerEmpresaY, issueDaysAgo: 35, bands: [band23(85000)], withholdingCents: 21250, confidence: 0.99 },
  { key: 'C-I3', client: 'C', type: 'INVOICE_ISSUED', status: 'NEEDS_REVIEW', documentNumber: 'FR AF/2026-33', buyerName: 'Empresa X Fictícia, Lda', buyerNif: NIF.buyerEmpresaX, issueDaysAgo: 60, bands: [band23(64000)], confidence: 0.7 },
  { key: 'C-1', client: 'C', type: 'INVOICE_RECEIVED', status: 'PRE_VALIDATED', documentNumber: 'FT TS/2026-044', supplierName: 'TechSoft Soluções, Lda', supplierNif: NIF.supTechsoft, issueDaysAgo: 28, bands: [band23(14900)], confidence: 0.98 },
  { key: 'C-2', client: 'C', type: 'INVOICE_RECEIVED', status: 'VALIDATED', documentNumber: 'FT PT/2026-7001', supplierName: 'Teleco Ibérica Fictícia, SA', supplierNif: NIF.supTelecom, issueDaysAgo: 65, bands: [band23(3900)], confidence: 0.99 },
  // — extra spread —
  { key: 'A-M2', client: 'A', type: 'INVOICE_RECEIVED', status: 'PRE_VALIDATED', documentNumber: 'FT EN/2026-950', supplierName: 'Energia Verde Fictícia, SA', supplierNif: NIF.supEnergia, issueDaysAgo: 58, bands: [band23(31300)], confidence: 0.98 },
  { key: 'B-7', client: 'B', type: 'RECEIPT', status: 'NEEDS_REVIEW', documentNumber: 'FS DA/2026-15', supplierName: 'Distribuidora Alimentar Norte, Lda', supplierNif: NIF.supAlimentar, issueDaysAgo: 1, bands: [{ rate: 6, baseCents: 6600, vatCents: 396 }], confidence: 0.63 },
  { key: 'C-3', client: 'C', type: 'INVOICE_RECEIVED', status: 'PRE_VALIDATED', documentNumber: 'FT PM/2026-512', supplierName: 'Papelaria Modelo, Lda', supplierNif: NIF.supPapelaria, issueDaysAgo: 44, bands: [band23(5700)], confidence: 0.97 },
]

// ── Bank statement (client A) — engineered against the plans above ──────────

interface BankRow {
  daysAgo: number
  description: string
  amountCents: number // negative = debit
  /** Plan key this row must reconcile against (the seed reconciles it). */
  reconcileWith?: string
}

function buildBankRows(): BankRow[] {
  const t = (key: string) => totalCentsOf(DOC_PLANS.find((p) => p.key === key)!)
  return [
    // 5 to reconcile (exact amount + close date + NIF in the description)
    { daysAgo: 8, description: `PAG FORNECEDOR TECHSOFT NIF ${NIF.supTechsoft}`, amountCents: -t('A-R1'), reconcileWith: 'A-R1' },
    { daysAgo: 15, description: `TRF RENDA IMOBILIARIA CENTRAL ${NIF.supImobiliaria}`, amountCents: -t('A-R2'), reconcileWith: 'A-R2' },
    { daysAgo: 22, description: `DD TELECO IBERICA ${NIF.supTelecom}`, amountCents: -t('A-R3'), reconcileWith: 'A-R3' },
    { daysAgo: 36, description: `PAG FORNECEDOR TECHSOFT NIF ${NIF.supTechsoft} FT 2026-021`, amountCents: -t('A-R4'), reconcileWith: 'A-R4' },
    { daysAgo: 45, description: `TRF PAPELARIA MODELO ${NIF.supPapelaria}`, amountCents: -t('A-R5'), reconcileWith: 'A-R5' },
    // 4 pending suggestions with engineered scores:
    // S1: exact + ≤3d + NIF → 95 (autoMatch)
    { daysAgo: 4, description: `DD ENERGIA VERDE ${NIF.supEnergia}`, amountCents: -t('A-S1') },
    // S2: exact + ~30d + NIF → 50+5+20 = 75 (autoMatch threshold)
    { daysAgo: 10, description: `DD ENERGIA VERDE ${NIF.supEnergia} REF 812`, amountCents: -t('A-S2') },
    // S3: exact + ~13d, no entity → 50+15 = 65
    { daysAgo: 15, description: 'TRF SERVICOS INFORMATICOS', amountCents: -t('A-S3') },
    // S4: exact + >45d, no entity → 50
    { daysAgo: 20, description: 'PAGAMENTO MATERIAL ESCRITORIO', amountCents: -t('A-S4') },
    // 6 unreconciled (no candidate lines up)
    { daysAgo: 1, description: 'TRF ORDENADOS EQUIPA', amountCents: -152343 },
    { daysAgo: 7, description: 'TRF CLIENTE EMPRESA X FICTICIA', amountCents: 250000 },
    { daysAgo: 13, description: 'PAG SEGURANCA SOCIAL', amountCents: -98765 },
    { daysAgo: 27, description: 'PAG IVA ESTADO', amountCents: -43210 },
    { daysAgo: 52, description: 'DEPOSITO NUMERARIO', amountCents: 112233 },
    { daysAgo: 63, description: 'TRF SEGURO ATIVIDADE', amountCents: -7677 },
    // 1 ignored by rule
    { daysAgo: 30, description: 'COMISSAO MANUTENCAO CONTA', amountCents: -520 },
  ]
}

function bankCsv(rows: BankRow[]): Buffer {
  const lines = ['Data;Descrição;Montante;Saldo']
  let balance = 1_500_000 // running balance, cents
  for (const row of rows) {
    balance += row.amountCents
    lines.push(
      `${ptDate(daysAgo(row.daysAgo))};${row.description};${decimalStringFromCents(row.amountCents).replace('.', ',')};${decimalStringFromCents(balance).replace('.', ',')}`,
    )
  }
  return Buffer.from(lines.join('\n'), 'utf-8')
}

// ── Synthetic PDF ────────────────────────────────────────────────────────────

async function invoicePdf(plan: DocPlan): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage([595, 842])
  const lines = [
    `Documento: ${plan.documentNumber}`,
    plan.supplierName ? `Fornecedor: ${plan.supplierName} (NIF ${plan.supplierNif})` : `Emitente: cliente da demo`,
    plan.buyerName ? `Cliente: ${plan.buyerName} (NIF ${plan.buyerNif})` : '',
    `Data: ${ptDate(daysAgo(plan.issueDaysAgo))}`,
    ...plan.bands.map(
      (b) => `IVA ${b.rate}%: base ${decimalStringFromCents(b.baseCents)} EUR, imposto ${decimalStringFromCents(b.vatCents)} EUR`,
    ),
    plan.withholdingCents ? `Retenção IRS: ${decimalStringFromCents(plan.withholdingCents)} EUR` : '',
    `TOTAL: ${decimalStringFromCents(totalCentsOf(plan))} EUR`,
    '',
    'DOCUMENTO FICTÍCIO — gerado pelo seed de demonstração do Gabify.',
  ].filter((l) => l !== '')
  let y = 780
  page.drawText('FATURA (DEMO)', { x: 50, y, size: 18, font })
  y -= 40
  for (const line of lines) {
    page.drawText(line, { x: 50, y, size: 11, font })
    y -= 18
  }
  return Buffer.from(await pdf.save())
}

// ── The seed ─────────────────────────────────────────────────────────────────

export async function seedDemo(): Promise<DemoSeedResult> {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_DEMO_FORCE !== 'true') {
    throw new Error(
      'seed:demo refuses to run with NODE_ENV=production — set SEED_DEMO_FORCE=true to override',
    )
  }

  const ownerEmail = (process.env.SEED_DEMO_OWNER_EMAIL ?? DEFAULT_OWNER_EMAIL).toLowerCase()
  const warnings: string[] = []

  // Deterministic idempotency marker: the demo OWNER user (User.email is unique)
  const existing = await prisma.user.findUnique({ where: { email: ownerEmail } })
  if (existing) {
    return {
      created: false,
      officeId: existing.officeId,
      counts: await countsFor(existing.officeId),
      warnings: [`o utilizador ${ownerEmail} já existe — seed ignorado (idempotência)`],
    }
  }

  // 1 — office + users (via services, same as seed:bootstrap)
  const office = await createOffice({ name: DEMO_OFFICE_NAME, nif: makeTestNif('50999999') })
  const owner = await createUserInOffice({
    officeId: office.id,
    email: ownerEmail,
    role: 'OWNER',
    name: 'Demo — Responsável',
  })
  await createUserInOffice({
    officeId: office.id,
    email: `contabilista.${ownerEmail}`,
    role: 'ACCOUNTANT',
    name: 'Demo — Contabilista',
  })
  await createUserInOffice({
    officeId: office.id,
    email: `leitura.${ownerEmail}`,
    role: 'VIEWER',
    name: 'Demo — Leitura',
  })

  // 2 — clients (three distinct profiles)
  const clientA = await prisma.client.create({
    data: {
      officeId: office.id,
      name: 'Silva & Costa Consultores, Lda',
      nif: NIF.clientServices,
      email: 'geral@silvacosta.demo',
      emailDomains: ['silvacosta.demo'],
      knownEmails: ['geral@silvacosta.demo'],
      notes: 'Cliente de demonstração — empresa de serviços.',
    },
  })
  const clientB = await prisma.client.create({
    data: {
      officeId: office.id,
      name: 'Restaurante O Tacho, Lda',
      nif: NIF.clientRestaurant,
      email: 'gerencia@otacho.demo',
      emailDomains: ['otacho.demo'],
      knownEmails: ['gerencia@otacho.demo'],
      notes: 'Cliente de demonstração — restauração (IVA 6% + 23%).',
    },
  })
  const clientC = await prisma.client.create({
    data: {
      officeId: office.id,
      name: 'Ana Ferreira — Design Gráfico',
      nif: NIF.clientFreelancer,
      email: 'ana@anaferreira.demo',
      emailDomains: ['anaferreira.demo'],
      knownEmails: ['ana@anaferreira.demo'],
      notes: 'Cliente de demonstração — freelancer com retenção IRS.',
    },
  })
  const clientIdOf = { A: clientA.id, B: clientB.id, C: clientC.id } as const

  // 3 — SNC taxonomy (idempotent upserts) + documents with synthetic PDFs
  await seedSncTaxonomy()

  let r2Available = true
  const docIdByKey = new Map<string, string>()
  for (const plan of DOC_PLANS) {
    const totalCents = totalCentsOf(plan)
    const baseCents = plan.bands.reduce((acc, b) => acc + b.baseCents, 0)
    const vatCents = plan.bands.reduce((acc, b) => acc + b.vatCents, 0)
    const pdfBuffer = await invoicePdf(plan)
    const filename = `${plan.documentNumber.replace(/[^\w-]+/g, '_')}.pdf`

    const document = await prisma.document.create({
      data: {
        officeId: office.id,
        clientId: clientIdOf[plan.client],
        source: 'MANUAL_UPLOAD',
        type: plan.type,
        status: plan.status,
        confidence: plan.confidence,
        extractionSource: 'IMPORT',
        classificationSource: 'demo-seed',
        uploadedByUserId: owner.id,
        originalFilename: filename,
        mimeType: 'application/pdf',
        sizeBytes: pdfBuffer.length,
        contentSha256: sha256(pdfBuffer),
        documentNumber: plan.documentNumber,
        supplierName: plan.supplierName ?? null,
        supplierNif: plan.supplierNif ?? null,
        buyerName: plan.buyerName ?? null,
        buyerNif: plan.buyerNif ?? null,
        issueDate: daysAgo(plan.issueDaysAgo),
        dueDate: plan.dueDaysAgo !== undefined ? daysAgo(plan.dueDaysAgo) : null,
        currency: 'EUR',
        totalAmount: decimalStringFromCents(totalCents),
        netAmount: decimalStringFromCents(baseCents),
        vatAmount: decimalStringFromCents(vatCents),
        withholdingAmount: plan.withholdingCents
          ? decimalStringFromCents(plan.withholdingCents)
          : null,
        vatBreakdown: plan.bands.map((b) => ({
          region: 'PT',
          rate: b.rate,
          baseCents: b.baseCents,
          vatCents: b.vatCents,
        })) as unknown as Prisma.InputJsonValue,
        flags: plan.flags ?? [],
        duplicateOfId: plan.duplicateOfKey ? docIdByKey.get(plan.duplicateOfKey) : null,
        suggestedClientId: plan.wrongClientSuggested
          ? clientIdOf[plan.wrongClientSuggested]
          : null,
        suggestedAccountCode: plan.suggestedAccountCode ?? null,
        suggestedVatTreatment: plan.suggestedVatTreatment ?? null,
        sncSource: plan.sncSource ?? null,
      },
    })
    docIdByKey.set(plan.key, document.id)

    // Storage upload — best effort so the demo also seeds without R2 configured
    if (r2Available) {
      const r2Key = `${office.id}/uploads/${document.id}/${filename}`
      try {
        await uploadToR2(r2Key, pdfBuffer, 'application/pdf')
        await prisma.document.update({ where: { id: document.id }, data: { r2Key } })
      } catch {
        r2Available = false
        warnings.push('R2 indisponível — documentos criados sem ficheiro (preview desativado na demo)')
      }
    }
  }

  // Export batch for the EXPORTED documents (linkage must exist)
  const exportedIds = DOC_PLANS.filter((p) => p.exported).map((p) => docIdByKey.get(p.key)!)
  if (exportedIds.length > 0) {
    const batch = await prisma.exportBatch.create({
      data: {
        officeId: office.id,
        createdByUserId: owner.id,
        filters: { clientIds: [clientB.id], demo: true } as unknown as Prisma.InputJsonValue,
        status: 'COMPLETED',
        documentCount: exportedIds.length,
      },
    })
    for (const documentId of exportedIds) {
      await prisma.exportDocument.create({ data: { exportBatchId: batch.id, documentId } })
      await prisma.document.update({ where: { id: documentId }, data: { exportBatchId: batch.id } })
    }
  }

  // Supplier registry (recurring suppliers) + one active rule (auto-classification)
  for (const [nif, name, count] of [
    [NIF.supTechsoft, 'TechSoft Soluções, Lda', 4],
    [NIF.supEnergia, 'Energia Verde Fictícia, SA', 5],
    [NIF.supAlimentar, 'Distribuidora Alimentar Norte, Lda', 4],
  ] as const) {
    await prisma.supplier.create({
      data: { officeId: office.id, nif, name, documentCount: count },
    })
  }
  await createSupplierRule({
    officeId: office.id,
    supplierNif: NIF.supTechsoft,
    defaultDocumentType: 'INVOICE_RECEIVED',
    defaultAccountCode: '6221',
    defaultVatTreatment: 'DEDUTIVEL_TOTAL',
    autoValidate: true,
    createdByUserId: owner.id,
  })

  // 4 — bank: rule → import → confirm → matching (rules run inside) → reconcile
  const bankAccount = await prisma.bankAccount.create({
    data: {
      officeId: office.id,
      clientId: clientA.id,
      name: 'Conta à ordem — Banco Demo',
      iban: 'PT50000000000000000000000',
    },
  })
  await prisma.bankRule.create({
    data: {
      officeId: office.id,
      bankAccountId: bankAccount.id,
      matchType: 'CONTAINS',
      pattern: 'COMISSAO MANUTENCAO',
      action: 'IGNORE',
      priority: 10,
    },
  })

  const rows = buildBankRows()
  const importResult = await createBankStatementImport({
    officeId: office.id,
    userId: owner.id,
    bankAccountId: bankAccount.id,
    filename: 'extrato-demo.csv',
    buffer: bankCsv(rows),
  })
  if (!importResult.ok) {
    throw new Error(`Demo bank import failed: ${importResult.error}`)
  }
  const confirmResult = await confirmBankStatementImport({
    importId: importResult.import.id,
    officeId: office.id,
    mapping: importResult.proposedMapping,
  })
  if (!confirmResult.ok) {
    throw new Error(`Demo bank import confirmation failed: ${confirmResult.error}`)
  }
  await runMatchingForImport({ officeId: office.id, importId: importResult.import.id })

  // Reconcile the 5 engineered rows through the real service (audited, atomic)
  for (const row of rows) {
    if (!row.reconcileWith) continue
    const tx = await prisma.bankTransaction.findFirstOrThrow({
      where: { officeId: office.id, description: row.description, amountCents: row.amountCents },
    })
    const result = await reconcileTransaction({
      officeId: office.id,
      userId: owner.id,
      role: 'OWNER',
      transactionId: tx.id,
      expectedVersion: tx.version,
      documentIds: [docIdByKey.get(row.reconcileWith)!],
    })
    if (!result.ok) {
      throw new Error(`Demo reconciliation failed for "${row.description}": ${result.error}`)
    }
  }

  // 5 — copilot: inbound email + pending draft (AI never invoked — canned text)
  const emailAccount = await prisma.emailAccount.create({
    data: {
      officeId: office.id,
      email: 'geral@gabinetedemo.local',
      name: 'Caixa de entrada — Gabinete Demo',
      provider: 'OUTLOOK',
      active: false, // never picked up by the sync workers
    },
  })
  const inbound = await prisma.inboundEmail.create({
    data: {
      emailAccountId: emailAccount.id,
      clientId: clientB.id,
      providerMessageId: 'demo-msg-0001',
      subject: 'Fatura da Distribuidora — enviar comprovativo?',
      fromEmail: 'gerencia@otacho.demo',
      fromName: 'Gerência O Tacho',
      toEmails: ['geral@gabinetedemo.local'],
      ccEmails: [],
      bodyText:
        'Boa tarde,\n\nSegue em anexo a fatura da Distribuidora Alimentar deste mês. Precisam que envie também o comprovativo de pagamento?\n\nCumprimentos,\nGerência O Tacho',
      receivedAt: daysAgo(1),
      status: 'READ',
      clientMatchScore: 0.95,
    },
  })
  const action = await prisma.emailAction.create({
    data: {
      inboundEmailId: inbound.id,
      type: 'DRAFT_REPLY',
      status: 'PENDING_REVIEW',
      draftContent:
        'Boa tarde,\n\nObrigado pelo envio da fatura — já ficou registada. Sim, agradecemos que nos faça chegar também o comprovativo de pagamento, para conciliarmos o movimento bancário.\n\nQualquer dúvida, estamos ao dispor.\n\nCom os melhores cumprimentos,\nGabinete Demo',
      aiModel: 'demo-seed (texto fixo — IA não invocada)',
    },
  })
  await prisma.auditLog.create({
    data: {
      officeId: office.id,
      userId: null,
      action: 'draft_generated',
      entityType: 'EmailAction',
      entityId: action.id,
      aiGenerated: true,
      aiModel: 'demo-seed',
      emailActionId: action.id,
      metadata: { demo: true },
    },
  })

  return { created: true, officeId: office.id, counts: await countsFor(office.id), warnings }
}

async function countsFor(officeId: string): Promise<DemoSeedResult['counts']> {
  const [users, clients, documents, bankTransactions, reconciled, ignored, pendingSuggestions, emailDrafts] =
    await Promise.all([
      prisma.user.count({ where: { officeId } }),
      prisma.client.count({ where: { officeId } }),
      prisma.document.count({ where: { officeId } }),
      prisma.bankTransaction.count({ where: { officeId } }),
      prisma.bankTransaction.count({ where: { officeId, status: 'RECONCILED' } }),
      prisma.bankTransaction.count({ where: { officeId, status: 'IGNORED' } }),
      prisma.reconciliationSuggestion.count({ where: { officeId, status: 'PENDING' } }),
      prisma.emailAction.count({ where: { status: 'PENDING_REVIEW', inboundEmail: { emailAccount: { officeId } } } }),
    ])
  return { users, clients, documents, bankTransactions, reconciled, ignored, pendingSuggestions, emailDrafts }
}
