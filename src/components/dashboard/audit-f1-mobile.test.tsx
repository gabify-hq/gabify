// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/inbox',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('next-auth/react', () => ({ signOut: vi.fn() }))

/**
 * AUDIT F1.4 — mobile (UX jornada 0): o dashboard tem de ser utilizável a
 * ~380px. A sidebar fixa desaparece em mobile a favor de um menu acessível,
 * as listas empilham em coluna, e o breakdown de conciliação é legível sem
 * hover (labels por extenso, nunca "M50 · D25").
 */

describe('AUDIT-F1.4 shell responsivo', () => {
  it('a sidebar de desktop fica escondida abaixo de md', async () => {
    const { Sidebar } = await import('./sidebar')
    const { container } = render(<Sidebar unreadCount={0} pendingCount={0} user={{ name: 'Fátima', email: 'f@g.pt' }} />)
    const aside = container.querySelector('aside')
    expect(aside).not.toBeNull()
    expect(aside!.className).toMatch(/hidden/)
    expect(aside!.className).toMatch(/md:flex/)
  })

  it('MobileNav: hambúrguer acessível abre e fecha o menu com os destinos principais', async () => {
    const { MobileNav } = await import('./mobile-nav')
    render(<MobileNav unreadCount={2} pendingCount={1} user={{ name: 'Fátima', email: 'f@g.pt' }} />)

    const openButton = screen.getByRole('button', { name: /abrir menu/i })
    await userEvent.click(openButton)

    for (const label of ['Caixa de entrada', 'Rever', 'Banco', 'Exportar', 'Definições']) {
      expect(screen.getByRole('link', { name: new RegExp(label, 'i') })).toBeInTheDocument()
    }

    const closeButton = screen.getByRole('button', { name: /fechar menu/i })
    await userEvent.click(closeButton)
    expect(screen.queryByRole('link', { name: /caixa de entrada/i })).not.toBeInTheDocument()
  })
})

describe('AUDIT-F1.4 breakdown de conciliação legível', () => {
  it('ScoreBreakdownLine mostra labels por extenso, visíveis sem hover', async () => {
    const { ScoreBreakdownLine } = await import('./score-breakdown')
    const { container } = render(
      <ScoreBreakdownLine breakdown={{ amount: 50, date: 25, entity: 20, reference: 0 }} />,
    )
    expect(screen.getByText(/Montante 50/)).toBeInTheDocument()
    expect(screen.getByText(/Data 25/)).toBeInTheDocument()
    expect(screen.getByText(/Entidade 20/)).toBeInTheDocument()
    expect(screen.getByText(/Referência 0/)).toBeInTheDocument()
    // Nunca escondido atrás de breakpoint ou de tooltip
    expect(container.innerHTML).not.toMatch(/hidden/)
  })

  it('BankQueue renderiza o breakdown legível nas sugestões (viewport mobile)', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/bank/accounts')) {
        return new Response(JSON.stringify({ success: true, data: { items: [] } }), { status: 200 })
      }
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            items: [
              {
                id: 'tx1',
                bankAccountId: 'acc1',
                bankAccountName: 'Conta à ordem',
                clientName: 'Cliente X',
                bookingDate: '2026-07-01',
                description: 'DD ENERGIA',
                amountCents: -45510,
                status: 'SUGGESTED',
                version: 1,
                suggestions: [
                  {
                    id: 's1',
                    documentId: 'd1',
                    scoreTotal: 95,
                    scoreBreakdown: { amount: 50, date: 25, entity: 20, reference: 0 },
                    autoMatch: true,
                    status: 'PENDING',
                    documentNumber: 'FT EN/1',
                    supplierName: 'Energia Verde',
                    issueDate: '2026-06-29',
                    totalAmount: '455.10',
                  },
                ],
              },
            ],
            total: 1,
          },
        }),
        { status: 200 },
      )
    }) as never

    const { BankQueue } = await import('./bank-queue')
    render(<BankQueue />)

    expect(await screen.findByText(/Montante 50/)).toBeInTheDocument()
    expect(screen.getByText(/Referência 0/)).toBeInTheDocument()
    // O código críptico morreu
    expect(screen.queryByText(/M50 · D25/)).not.toBeInTheDocument()
  })
})

describe('AUDIT-F1.4 listas empilham em mobile', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ success: true, data: {} }), { status: 200 })) as never
  })

  it('cartão da fila de revisão é coluna em mobile (sm:flex-row só a partir de sm)', async () => {
    const { ReviewQueue } = await import('./review-queue')
    const { container } = render(
      <ReviewQueue
        items={[
          {
            id: 'doc1',
            version: 1,
            status: 'NEEDS_REVIEW',
            typeLabel: 'Fatura recebida',
            supplierName: 'Fornecedor Muito Comprido de Nome Extenso, Lda',
            supplierNif: '508234567',
            documentNumber: 'FT XPTO/2026-000123',
            issueDate: '01/07/2026',
            totalAmount: 1234.56,
            flags: ['DUPLICATE_SUSPECT'],
            filename: 'ficheiro-com-nome-muito-comprido-que-nao-pode-transbordar.pdf',
            clientName: 'Cliente Y',
          },
        ]}
      />,
    )
    const item = container.querySelector('li')
    expect(item).not.toBeNull()
    expect(item!.className).toMatch(/flex-col/)
    expect(item!.className).toMatch(/sm:flex-row/)
  })

  it('formulário de correção usa coluna única em mobile (grid-cols-1)', async () => {
    const { DocumentCorrectionForm } = await import('./document-correction-form')
    const { container } = render(
      <DocumentCorrectionForm
        document={{
          id: 'doc1',
          version: 1,
          status: 'NEEDS_REVIEW',
          type: 'INVOICE_RECEIVED',
          typeLabel: 'Fatura recebida',
          filename: 'f.pdf',
          mimeType: 'application/pdf',
          hasFile: false,
          confidence: 0.66,
          extractionSource: 'AI_TEXT',
          flags: [],
          supplierName: 'Fornecedor',
          supplierNif: '508234567',
          documentNumber: 'FT 1',
          issueDate: '01/07/2026',
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
        }}
        clients={[]}
        role="OWNER"
      />,
    )
    const grid = container.querySelector('.grid-cols-1')
    expect(grid).not.toBeNull()
    expect(grid!.className).toMatch(/sm:grid-cols-2/)
  })
})
