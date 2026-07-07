import { describe, it, expect, beforeEach, vi } from 'vitest'
import AdmZip from 'adm-zip'
import { truncateAll, prisma } from '../helpers/db'
import { makeTwoOffices, makeClient } from '../helpers/factories'

vi.mock('@/lib/r2', async () => (await import('../mocks/r2')).r2MockFactory())

import { r2Store } from '../mocks/r2'
import { runExport } from '@/server/services/export-service'

/**
 * AUDIT F3.11 — CSV de export correto (A-1/A-2).
 *  - RFC 4180: campos com ; " ou quebras de linha vêm entre aspas (aspas
 *    duplicadas) — um fornecedor "A;B" desalinhava TODAS as colunas.
 *  - Taxas das regiões autónomas (Açores 4/9/16, Madeira 5/12/22) NUNCA são
 *    silenciosamente omitidas — ganham colunas próprias no lancamentos.csv.
 */

/** Splitter RFC 4180 mínimo para as asserções (aspas duplas escapadas). */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ';') {
      out.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  out.push(current)
  return out
}

async function makeExportDoc(params: {
  officeId: string
  clientId: string
  number: string
  supplierName: string
  bands: Array<{ region: string; rate: number; baseCents: number; vatCents: number }>
  totalCents: number
}) {
  const totalEuros = (params.totalCents / 100).toFixed(2)
  return prisma.document.create({
    data: {
      officeId: params.officeId,
      clientId: params.clientId,
      source: 'MANUAL_UPLOAD',
      status: 'VALIDATED',
      type: 'INVOICE_RECEIVED',
      confidence: 0.95,
      documentNumber: params.number,
      supplierName: params.supplierName,
      supplierNif: '508234567',
      issueDate: new Date(Date.UTC(2026, 2, 10, 12)),
      totalAmount: totalEuros,
      vatBreakdown: params.bands,
      originalFilename: `${params.number.replace(/\W+/g, '_')}.pdf`,
    },
  })
}

describe('AUDIT-F3.11 export CSV', () => {
  beforeEach(async () => {
    await truncateAll()
    r2Store.clear()
  })

  it('campos com ; e aspas ficam corretamente escapados — colunas nunca desalinham', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const client = await makeClient({ officeId: officeA.id, name: 'Cliente; Com Ponto-e-Vírgula' })
    await makeExportDoc({
      officeId: officeA.id,
      clientId: client.id,
      number: 'FT ESC/1',
      supplierName: 'Silva; Costa "e Filhos", Lda',
      bands: [{ region: 'PT', rate: 23, baseCents: 10000, vatCents: 2300 }],
      totalCents: 12300,
    })

    const result = await runExport({
      officeId: officeA.id,
      userId: ownerA.id,
      periodFrom: '2026-03',
      periodTo: '2026-03',
    })
    if (!result.ok) throw new Error(result.error)

    const zip = new AdmZip(r2Store.get(result.r2Key)!)
    const csv = zip.getEntry('lancamentos.csv')!.getData().toString('utf-8')
    const lines = csv.split('\n').filter((l) => l !== '' && !l.startsWith('#'))
    const header = splitCsvLine(lines[0])
    const dataLine = splitCsvLine(lines[1])

    // Mesmo nº de colunas no header e na linha — o ; do fornecedor não parte nada
    expect(dataLine).toHaveLength(header.length)

    // O campo vem inteiro, com as aspas interiores preservadas
    expect(dataLine).toContain('Silva; Costa "e Filhos", Lda')
    expect(csv).toContain('"Silva; Costa ""e Filhos"", Lda"')
  })

  it('fatura dos Açores a 16% aparece no CSV com base e IVA exatos — nunca a zeros', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const client = await makeClient({ officeId: officeA.id, name: 'Cliente Açores' })
    await makeExportDoc({
      officeId: officeA.id,
      clientId: client.id,
      number: 'FT AC/1',
      supplierName: 'Fornecedor Açoriano Lda',
      bands: [{ region: 'PT-AC', rate: 16, baseCents: 40000, vatCents: 6400 }],
      totalCents: 46400,
    })

    const result = await runExport({
      officeId: officeA.id,
      userId: ownerA.id,
      periodFrom: '2026-03',
      periodTo: '2026-03',
    })
    if (!result.ok) throw new Error(result.error)

    const zip = new AdmZip(r2Store.get(result.r2Key)!)
    const csv = zip.getEntry('lancamentos.csv')!.getData().toString('utf-8')
    const lines = csv.split('\n').filter((l) => l !== '' && !l.startsWith('#'))
    const header = splitCsvLine(lines[0])
    const dataLine = splitCsvLine(lines[1])

    // Colunas dinâmicas para a banda fora do continente
    const baseIdx = header.findIndex((h) => /base.*16/i.test(h) && /ac/i.test(h))
    const ivaIdx = header.findIndex((h) => /iva.*16/i.test(h) && /ac/i.test(h))
    expect(baseIdx).toBeGreaterThan(-1)
    expect(ivaIdx).toBeGreaterThan(-1)
    expect(dataLine[baseIdx]).toBe('400,00')
    expect(dataLine[ivaIdx]).toBe('64,00')

    // O dinheiro não desapareceu para as colunas continentais
    expect(dataLine).toContain('464,00') // total
    // resumo_iva inclui a taxa com a região
    const resumo = zip.getEntry('resumo_iva.csv')!.getData().toString('utf-8')
    expect(resumo).toMatch(/16;400,00;64,00/)
  })
})
