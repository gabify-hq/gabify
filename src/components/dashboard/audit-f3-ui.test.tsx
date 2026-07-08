// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/review',
  useSearchParams: () => new URLSearchParams(),
}))

/**
 * AUDIT F3 — UI: rejeitar com confirmação+undo (F3.9), botões de resolução de
 * duplicado (F3.8) e conciliação manual por pesquisa (F3.10).
 */

function fetchSpy(responder: (url: string, init?: RequestInit) => object) {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = responder(String(input), init)
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  global.fetch = spy as never
  return spy
}

const REVIEW_ITEM = {
  id: 'doc1',
  version: 1,
  status: 'NEEDS_REVIEW' as const,
  typeLabel: 'Fatura recebida',
  supplierName: 'Fornecedor X',
  supplierNif: '508234567',
  documentNumber: 'FT 1',
  issueDate: '01/07/2026',
  totalAmount: 100,
  flags: [],
  filename: 'f.pdf',
  clientName: 'Cliente Y',
}

describe('AUDIT-F3.9 rejeitar com confirmação e undo', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('clicar Rejeitar NÃO chama a API — pede confirmação primeiro', async () => {
    const spy = fetchSpy(() => ({ success: true, data: {} }))
    const { ReviewQueue } = await import('./review-queue')
    render(<ReviewQueue items={[REVIEW_ITEM]} />)

    await userEvent.click(screen.getByRole('button', { name: /rejeitar/i }))

    // Nada enviado ainda; a confirmação está visível
    expect(spy).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /confirmar/i })).toBeInTheDocument()
  })

  it('confirmar envia a rejeição; aparece "Anular" que restaura via /restore', async () => {
    const calls: string[] = []
    fetchSpy((url) => {
      calls.push(url)
      return { success: true, data: { status: 'NEEDS_REVIEW', version: 2 } }
    })
    const { ReviewQueue } = await import('./review-queue')
    render(<ReviewQueue items={[REVIEW_ITEM]} />)

    await userEvent.click(screen.getByRole('button', { name: /rejeitar/i }))
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }))

    await waitFor(() => {
      expect(calls.some((u) => u.includes('/api/documents/doc1/review'))).toBe(true)
    })

    // Undo à vista
    const undo = await screen.findByRole('button', { name: /anular/i })
    await userEvent.click(undo)
    await waitFor(() => {
      expect(calls.some((u) => u.includes('/api/documents/doc1/restore'))).toBe(true)
    })
  })

  it('cancelar a confirmação não envia nada', async () => {
    const spy = fetchSpy(() => ({ success: true, data: {} }))
    const { ReviewQueue } = await import('./review-queue')
    render(<ReviewQueue items={[REVIEW_ITEM]} />)

    await userEvent.click(screen.getByRole('button', { name: /rejeitar/i }))
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(spy).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /rejeitar/i })).toBeInTheDocument()
  })
})

describe('AUDIT-F3.8 resolução de duplicado na UI', () => {
  it('documento com flag DUPLICATE_SUSPECT tem ações de resolução que chamam a rota', async () => {
    const calls: Array<{ url: string; body: unknown }> = []
    fetchSpy((url, init) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
      return { success: true, data: { status: 'REVIEWED', version: 2 } }
    })

    const { DocumentCorrectionForm } = await import('./document-correction-form')
    render(
      <DocumentCorrectionForm
        document={{
          id: 'doc-dup',
          version: 1,
          status: 'NEEDS_REVIEW',
          type: 'INVOICE_RECEIVED',
          typeLabel: 'Fatura recebida',
          filename: 'dup.pdf',
          mimeType: 'application/pdf',
          hasFile: false,
          confidence: 0.9,
          extractionSource: 'AI_TEXT',
          flags: ['DUPLICATE_SUSPECT'],
          supplierName: 'Fornecedor',
          supplierNif: '508234567',
          documentNumber: 'FT DUP',
          issueDate: '01/07/2026',
          dueDate: null,
          currency: 'EUR',
          vatBreakdown: [],
          withholdingCents: null,
          totalCents: 12300,
          accountCode: null,
          accountIsSuggestion: false,
          vatTreatment: null,
          clientId: null,
          suggestedClientId: null,
        }}
        clients={[]}
        role="OWNER"
      />,
    )

    // As duas saídas existem, em linguagem dela
    const keepButton = screen.getByRole('button', { name: /é duplicado/i })
    expect(screen.getByRole('button', { name: /documentos distintos/i })).toBeInTheDocument()

    await userEvent.click(keepButton)
    await waitFor(() => {
      const call = calls.find((c) => c.url.includes('/api/documents/doc-dup/resolve-duplicate'))
      expect(call).toBeTruthy()
      expect((call!.body as { resolution: string }).resolution).toBe('keep')
    })
  })
})

describe('AUDIT-F3.10 conciliação manual na UI', () => {
  it('movimento sem sugestões tem "Conciliar manualmente": pesquisa → seleção → POST reconcile', async () => {
    const calls: Array<{ url: string; body: unknown }> = []
    fetchSpy((url, init) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
      if (url.includes('/api/bank/accounts')) {
        return { success: true, data: { items: [] } }
      }
      if (url.includes('/candidates')) {
        return {
          success: true,
          data: {
            items: [
              {
                id: 'docM',
                documentNumber: 'FT M/300',
                supplierName: 'Fornecedor Manual',
                issueDate: '2026-06-28',
                totalAmount: '300.00',
              },
            ],
          },
        }
      }
      if (url.includes('/api/bank/transactions?')) {
        return {
          success: true,
          data: {
            items: [
              {
                id: 'tx-nomatch',
                bankAccountId: 'acc1',
                bankAccountName: 'Conta à ordem',
                clientName: 'Cliente X',
                bookingDate: '2026-07-01',
                description: 'TRF SEM MATCH',
                amountCents: -30000,
                status: 'UNRECONCILED',
                version: 1,
                suggestions: [],
              },
            ],
            total: 1,
          },
        }
      }
      return { success: true, data: { status: 'RECONCILED', version: 2 } }
    })

    const { BankQueue } = await import('./bank-queue')
    render(<BankQueue />)

    const manualButton = await screen.findByRole('button', { name: /conciliar manualmente/i })
    await userEvent.click(manualButton)

    const search = await screen.findByPlaceholderText(/procurar documento/i)
    await userEvent.type(search, 'FT M')

    // Resultado da pesquisa aparece e é selecionável
    const candidate = await screen.findByText(/FT M\/300/)
    expect(candidate).toBeInTheDocument()
    const checkbox = await screen.findByRole('checkbox', { name: /FT M\/300/i })
    await userEvent.click(checkbox)

    await userEvent.click(screen.getByRole('button', { name: /conciliar 1 documento/i }))

    await waitFor(() => {
      const call = calls.find((c) => c.url.includes('/api/bank/transactions/tx-nomatch/reconcile'))
      expect(call).toBeTruthy()
      expect((call!.body as { documentIds: string[] }).documentIds).toEqual(['docM'])
    })
  })
})
