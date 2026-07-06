/**
 * Deterministic synthetic fixtures (ADDENDUM A10).
 *
 * QR payloads are built as decoded strings per Portaria 195/2020; real QR
 * images are generated with `qrcode` and embedded into PDFs with `pdf-lib`.
 * `npm run test` is self-sufficient on a clean clone — the acceptance global
 * setup calls ensureFixtures() and generates anything missing.
 */
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import QRCode from 'qrcode'
import AdmZip from 'adm-zip'
import sharp from 'sharp'

export const FIXTURES_DIR = join(__dirname, 'generated')

// ── AT QR payloads (decoded strings — Portaria 195/2020) ────────────────────

export const QR_SINGLE_RATE =
  'A:508234567*B:123456789*C:PT*D:FT*E:N*F:20260315*G:FT A/123*H:ABCD1234-123*' +
  'I1:PT*I7:100.00*I8:23.00*N:23.00*O:123.00*Q:aBcD*R:2500'

export const QR_MULTI_RATE =
  'A:507111222*B:245678901*C:PT*D:FT*E:N*F:20260410*G:FT B/77*H:WXYZ9876-77*' +
  'I1:PT*I2:50.00*I3:100.00*I4:6.00*I5:200.00*I6:26.00*I7:300.00*I8:69.00*' +
  'N:101.00*O:751.00*P:75.00*Q:xYz1*R:2500'

export const QR_PAGE_2 =
  'A:509888777*B:245678901*C:PT*D:FT*E:N*F:20260411*G:FT C/8*H:QQQQ1111-8*' +
  'I1:PT*I7:40.00*I8:9.20*N:9.20*O:49.20*Q:pQrS*R:2500'

export const QR_PAGE_3 =
  'A:506555444*B:245678901*C:PT*D:FS*E:N*F:20260412*G:FS D/9*H:RRRR2222-9*' +
  'I1:PT*I3:10.00*I4:0.60*N:0.60*O:10.60*Q:tUvW*R:2500'

// ── Generators ───────────────────────────────────────────────────────────────

async function qrPng(payload: string): Promise<Buffer> {
  return QRCode.toBuffer(payload, { type: 'png', width: 260, margin: 2 })
}

/**
 * QR as JPEG — PDFs store JPEG streams raw (DCTDecode), which is what the
 * production qr-reader extracts. PNG would be Flate-compressed and invisible.
 */
async function qrJpeg(payload: string): Promise<Buffer> {
  return sharp(await qrPng(payload)).jpeg({ quality: 95 }).toBuffer()
}

async function invoicePdf(params: {
  title: string
  lines: string[]
  qrPayloads?: string[] // one page per payload when provided
}): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const pages = params.qrPayloads?.length ? params.qrPayloads : [null]

  for (const payload of pages) {
    const page = pdf.addPage([595, 842]) // A4
    page.drawText(params.title, { x: 50, y: 780, size: 18, font })
    let y = 740
    for (const line of params.lines) {
      page.drawText(line, { x: 50, y, size: 11, font })
      y -= 18
    }
    if (payload) {
      const jpg = await pdf.embedJpg(await qrJpeg(payload))
      page.drawImage(jpg, { x: 50, y: 80, width: 220, height: 220 })
    }
  }
  return Buffer.from(await pdf.save())
}

async function multiPageNoQrPdf(pages: number): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < pages; i++) {
    const page = pdf.addPage([595, 842])
    page.drawText(`Página ${i + 1}`, { x: 50, y: 780, size: 14, font })
    page.drawText('Documento de teste sem QR.', { x: 50, y: 750, size: 11, font })
  }
  return Buffer.from(await pdf.save())
}

const CIUSPT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:feap.gov.pt:CIUS-PT:2.1.1</cbc:CustomizationID>
  <cbc:ID>FT X/42</cbc:ID>
  <cbc:IssueDate>2026-04-20</cbc:IssueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyName><cbc:Name>Fornecedor XML Lda</cbc:Name></cac:PartyName>
    <cac:PartyTaxScheme><cbc:CompanyID>PT508234567</cbc:CompanyID></cac:PartyTaxScheme>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyTaxScheme><cbc:CompanyID>PT245678901</cbc:CompanyID></cac:PartyTaxScheme>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="EUR">23.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="EUR">100.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="EUR">23.00</cbc:TaxAmount>
      <cac:TaxCategory><cbc:Percent>23</cbc:Percent></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:TaxExclusiveAmount currencyID="EUR">100.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">123.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">123.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>
`

const RANDOM_XML = `<?xml version="1.0"?><config><setting name="theme">dark</setting><items><item>1</item></items></config>`

const SHEET_VALID = [
  'data;numero;nif;base;taxa_iva;total',
  '15/03/2026;FT 1/100;508234565;100,00;23;123,00',
  '16/03/2026;FT 1/101;507111222;50,00;6;53,00',
  '17/03/2026;FT 1/102;509888771;200,00;13;226,00',
].join('\n')

const SHEET_2BAD = [
  'data;numero;nif;base;taxa_iva;total',
  '01/04/2026;FT 2/1;508234565;100,00;23;123,00',
  '02/04/2026;FT 2/2;111111111;100,00;23;123,00', // NIF checksum inválido
  '03/04/2026;FT 2/3;507111222;80,00;23;98,40',
  '04/04/2026;FT 2/4;509888771;100,00;23;200,00', // base+IVA ≠ total
  '05/04/2026;FT 2/5;508234565;10,00;6;10,60',
  '06/04/2026;FT 2/6;507111222;20,00;13;22,60',
  '07/04/2026;FT 2/7;509888771;30,00;23;36,90',
  '08/04/2026;FT 2/8;508234565;40,00;23;49,20',
  '09/04/2026;FT 2/9;507111222;55,00;6;58,30',
  '10/04/2026;FT 2/10;509888771;70,00;23;86,10',
].join('\n')

function zipBomb(): Buffer {
  const zip = new AdmZip()
  // 60MB of zeros compresses to ~60KB — ratio far above 100:1 (A4)
  zip.addFile('zeros.bin', Buffer.alloc(60 * 1024 * 1024, 0))
  return zip.toBuffer()
}

async function validZipWith3Pdfs(): Promise<Buffer> {
  const zip = new AdmZip()
  for (let i = 1; i <= 3; i++) {
    const pdf = await invoicePdf({
      title: `Fatura ZIP ${i}`,
      lines: ['Fornecedor Zipado Lda', 'NIF: 508234567', `Total: ${i * 10},00 EUR`],
    })
    zip.addFile(`fatura-${i}.pdf`, pdf)
  }
  return zip.toBuffer()
}

function fakePdfExe(): Buffer {
  // MZ executable magic bytes wearing a .pdf name
  return Buffer.concat([Buffer.from('MZ'), Buffer.alloc(256, 0x90)])
}

// Minimal valid 1x1 JPEG (hand-crafted baseline) — enough for magic-byte checks
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==',
  'base64'
)

// ── Entry point ──────────────────────────────────────────────────────────────

export async function ensureFixtures(): Promise<void> {
  mkdirSync(FIXTURES_DIR, { recursive: true })

  const files: Array<[string, () => Buffer | Promise<Buffer>]> = [
    ['fx-qr-single.pdf', () =>
      invoicePdf({
        title: 'FATURA FT A/123',
        lines: ['Fornecedor Alfa Lda', 'NIF: 508234567', 'Total: 123,00 EUR'],
        qrPayloads: [QR_SINGLE_RATE],
      })],
    ['fx-qr-multirate.pdf', () =>
      invoicePdf({
        title: 'FATURA FT B/77',
        lines: ['Fornecedor Beta Lda', 'NIF: 507111222', 'Total: 751,00 EUR'],
        qrPayloads: [QR_MULTI_RATE],
      })],
    ['fx-noqr-invoice.pdf', () =>
      invoicePdf({
        title: 'FATURA FT 2026/55',
        lines: [
          'Fornecedor Gama Unipessoal Lda',
          'NIF: 509888777',
          'Data: 05/05/2026',
          'Base: 200,00 EUR',
          'IVA (23%): 46,00 EUR',
          'Total: 246,00 EUR',
        ],
      })],
    ['fx-recibo-verde.pdf', () =>
      invoicePdf({
        title: 'RECIBO N. 12',
        lines: [
          'Trabalhador Independente',
          'NIF: 212345675',
          'Data: 10/05/2026',
          'Valor base: 1000,00 EUR',
          'IVA (23%): 230,00 EUR',
          'Retencao IRS (25%): 250,00 EUR',
          'Total recebido: 980,00 EUR',
        ],
      })],
    ['fx-multi-invoice.pdf', () =>
      invoicePdf({
        title: 'FATURAS AGRUPADAS',
        lines: ['Documento multi-fatura de teste'],
        qrPayloads: [QR_MULTI_RATE, QR_PAGE_2, QR_PAGE_3],
      })],
    ['fx-5page-noqr.pdf', () => multiPageNoQrPdf(5)],
    ['fx-51page-noqr.pdf', () => multiPageNoQrPdf(51)],
    ['fx-ciuspt.xml', () => Buffer.from(CIUSPT_XML, 'utf-8')],
    ['fx-xml-random.xml', () => Buffer.from(RANDOM_XML, 'utf-8')],
    ['fx-sheet-valid.csv', () => Buffer.from(SHEET_VALID, 'utf-8')],
    ['fx-sheet-2bad.csv', () => Buffer.from(SHEET_2BAD, 'utf-8')],
    ['fx-zipbomb.zip', () => zipBomb()],
    ['fx-zip-3pdfs.zip', () => validZipWith3Pdfs()],
    ['fx-fake-pdf.exe.pdf', () => fakePdfExe()],
    ['fx-ticket.jpg', () => TINY_JPEG],
  ]

  for (const [name, build] of files) {
    const path = join(FIXTURES_DIR, name)
    if (existsSync(path)) continue
    writeFileSync(path, await build())
  }
}

export function fixturePath(name: string): string {
  return join(FIXTURES_DIR, name)
}
