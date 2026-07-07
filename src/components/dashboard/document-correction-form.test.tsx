// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const routerPush = vi.fn()
const routerRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

import { DocumentCorrectionForm, type CorrectionDocumentDTO } from './document-correction-form'

function makeDoc(overrides: Partial<CorrectionDocumentDTO> = {}): CorrectionDocumentDTO {
  return {
    id: 'doc-1',
    version: 3,
    status: 'NEEDS_REVIEW',
    type: 'INVOICE_RECEIVED',
    typeLabel: 'Fatura recebida',
    filename: 'fatura.pdf',
    mimeType: 'application/pdf',
    hasFile: false, // skip the preview fetch in tests
    confidence: 0.7,
    extractionSource: 'AI_TEXT',
    flags: [],
    supplierName: 'Fornecedor Original Lda',
    supplierNif: '508234565',
    documentNumber: 'FT A/1',
    issueDate: '15/03/2026',
    dueDate: null,
    currency: 'EUR',
    vatBreakdown: [{ region: 'PT', rate: 23, baseCents: 10000, vatCents: 2300 }],
    withholdingCents: null,
    totalCents: 12300,
    accountCode: null,
    accountIsSuggestion: false,
    vatTreatment: null,
    clientId: null,
    suggestedClientId: null,
    ...overrides,
  }
}

const clients = [{ id: 'client-1', name: 'Cliente Um' }]

describe('DocumentCorrectionForm', () => {
  beforeEach(() => {
    routerPush.mockClear()
    routerRefresh.mockClear()
    vi.unstubAllGlobals()
  })

  it('submete correções: campos alterados vão como decision correct com os diffs', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<DocumentCorrectionForm document={makeDoc()} clients={clients} role="ACCOUNTANT" />)

    const supplierInput = screen.getByPlaceholderText('Nome do fornecedor')
    await user.clear(supplierInput)
    await user.type(supplierInput, 'Fornecedor Corrigido Lda')

    const totalInput = screen.getByLabelText(/^Total/)
    await user.clear(totalInput)
    await user.type(totalInput, '150,00')

    await user.click(screen.getByRole('button', { name: /Guardar correções e validar/ }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/documents/doc-1/review')
    const body = JSON.parse(init.body as string)
    expect(body.decision).toBe('correct')
    expect(body.expectedVersion).toBe(3)
    expect(body.corrections.supplierName).toBe('Fornecedor Corrigido Lda')
    expect(body.corrections.totalCents).toBe(15000)

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/review'))
  })

  it('S5.1 — editar IVA por taxa e retenção envia vatBreakdown/withholdingCents em cêntimos', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<DocumentCorrectionForm document={makeDoc()} clients={clients} role="ACCOUNTANT" />)

    const baseInput = screen.getByLabelText('Base da taxa 23%')
    await user.clear(baseInput)
    await user.type(baseInput, '200,00')
    const vatInput = screen.getByLabelText('IVA da taxa 23%')
    await user.clear(vatInput)
    await user.type(vatInput, '46,00')

    const withholdingInput = screen.getByLabelText('Retenção na fonte')
    await user.type(withholdingInput, '0,00')

    const totalInput = screen.getByLabelText(/^Total/)
    await user.clear(totalInput)
    await user.type(totalInput, '246,00')

    await user.click(screen.getByRole('button', { name: /Guardar correções e validar/ }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.corrections.vatBreakdown).toEqual([
      { region: 'PT', rate: 23, baseCents: 20000, vatCents: 4600 },
    ])
    expect(body.corrections.withholdingCents).toBe(0)
    expect(body.corrections.totalCents).toBe(24600)
    // Coherent values — no warning shown
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('S5.1 — adicionar e remover linhas de taxa funciona; VIEWER não vê os controlos', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const user = userEvent.setup()
    const { unmount } = render(
      <DocumentCorrectionForm document={makeDoc()} clients={clients} role="OWNER" />,
    )

    await user.click(screen.getByRole('button', { name: 'Adicionar taxa' }))
    expect(screen.getAllByLabelText(/^Base da taxa/)).toHaveLength(2)

    await user.click(screen.getAllByRole('button', { name: /^Remover taxa/ })[1])
    expect(screen.getAllByLabelText(/^Base da taxa/)).toHaveLength(1)
    unmount()

    render(<DocumentCorrectionForm document={makeDoc()} clients={clients} role="VIEWER" />)
    expect(screen.queryByRole('button', { name: 'Adicionar taxa' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Remover taxa/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Base da taxa 23%')).toBeDisabled()
  })

  it('VIEWER não vê ações de escrita e os campos estão desativados', () => {
    vi.stubGlobal('fetch', vi.fn())
    render(<DocumentCorrectionForm document={makeDoc()} clients={clients} role="VIEWER" />)

    expect(screen.queryByRole('button', { name: /Validar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Rejeitar/ })).not.toBeInTheDocument()
    expect(screen.getByText('Sem permissões de revisão — consulta apenas.')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Nome do fornecedor')).toBeDisabled()
  })

  it('erro de API mostra feedback e não perde o input do utilizador', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'Documento atualizado por outro utilizador' }), { status: 409 })
    )
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<DocumentCorrectionForm document={makeDoc()} clients={clients} role="OWNER" />)

    const supplierInput = screen.getByPlaceholderText('Nome do fornecedor')
    await user.clear(supplierInput)
    await user.type(supplierInput, 'Texto que não pode perder-se')

    await user.click(screen.getByRole('button', { name: /Guardar correções e validar/ }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert').textContent).toContain('atualizado por outro utilizador')
    // Input intact after the failure
    expect(supplierInput).toHaveValue('Texto que não pode perder-se')
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('aviso de coerência aparece quando bases+IVA−retenção ≠ total (não bloqueia)', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const user = userEvent.setup()
    render(<DocumentCorrectionForm document={makeDoc()} clients={clients} role="OWNER" />)

    const totalInput = screen.getByLabelText(/^Total/)
    await user.clear(totalInput)
    await user.type(totalInput, '999,99')

    expect(await screen.findByRole('status')).toHaveTextContent('não correspondem ao total')
    // Action still available — warning, not a block
    expect(screen.getByRole('button', { name: /validar/i })).toBeEnabled()
  })
})
