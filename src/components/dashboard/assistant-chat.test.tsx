// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

import { AssistantChat } from './assistant-chat'

function okResponse(answer: string, results: unknown[] = []) {
  return {
    ok: true,
    json: async () => ({ success: true, data: { answer, results, toolsInvoked: [] } }),
  }
}

describe('AssistantChat', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('estado vazio mostra as 4 perguntas sugeridas; clicar numa envia-a', async () => {
    const fetchMock = vi.fn(async () => okResponse('Encontrei 2 faturas.'))
    vi.stubGlobal('fetch', fetchMock)
    render(<AssistantChat />)

    const suggestions = [
      'Faturas da EDP acima de 100€ em maio',
      'Total de IVA a 23% por fornecedor este trimestre',
      'Há faturas duplicadas?',
      'Movimentos bancários por conciliar',
    ]
    for (const suggestion of suggestions) {
      expect(screen.getByRole('button', { name: suggestion })).toBeInTheDocument()
    }

    await userEvent.click(screen.getByRole('button', { name: suggestions[0] }))
    await waitFor(() => expect(screen.getByText('Encontrei 2 faturas.')).toBeInTheDocument())

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body.question).toBe(suggestions[0])
    expect(body.history).toEqual([])
  })

  it('resposta com resultados renderiza tabela com montantes pt-PT e exportação CSV', async () => {
    const results = [
      {
        tool: 'search_documents',
        input: {},
        data: {
          items: [
            {
              id: 'doc-1',
              status: 'VALIDATED',
              supplierName: 'EDP Comercial',
              supplierNif: '503504564',
              documentNumber: 'FT 1/1',
              issueDate: '2026-05-10',
              totalCents: 12345,
              clientName: 'Cliente Um',
            },
          ],
          total: 1,
        },
      },
    ]
    vi.stubGlobal('fetch', vi.fn(async () => okResponse('Aqui está.', results)))
    render(<AssistantChat />)

    await userEvent.type(screen.getByLabelText('Pergunta ao assistente'), 'faturas da EDP')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar pergunta' }))

    await waitFor(() => expect(screen.getByText('EDP Comercial')).toBeInTheDocument())
    expect(screen.getByText('123,45 €')).toBeInTheDocument()
    expect(screen.getByText('10/05/2026')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Exportar tabela Documentos em CSV/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ver em documentos/ })).toHaveAttribute(
      'href',
      '/documents',
    )
  })

  it('erro da API mostra mensagem limpa e "Tentar novamente" reenvia a pergunta', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'O assistente não conseguiu responder — tente novamente' }),
      })
      .mockResolvedValueOnce(okResponse('Agora sim.'))
    vi.stubGlobal('fetch', fetchMock)
    render(<AssistantChat />)

    await userEvent.type(screen.getByLabelText('Pergunta ao assistente'), 'pergunta difícil')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar pergunta' }))

    await waitFor(() =>
      expect(
        screen.getByText('O assistente não conseguiu responder — tente novamente'),
      ).toBeInTheDocument(),
    )

    await userEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    await waitFor(() => expect(screen.getByText('Agora sim.')).toBeInTheDocument())

    const secondBody = JSON.parse(
      String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body),
    )
    expect(secondBody.question).toBe('pergunta difícil')
  })

  it('input e botão ficam desativados enquanto a resposta carrega', async () => {
    let resolveFetch: (value: unknown) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((resolve) => { resolveFetch = resolve })),
    )
    render(<AssistantChat />)

    await userEvent.type(screen.getByLabelText('Pergunta ao assistente'), 'demora')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar pergunta' }))

    expect(screen.getByLabelText('Pergunta ao assistente')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Enviar pergunta' })).toBeDisabled()
    expect(screen.getByText('A consultar os dados…')).toBeInTheDocument()

    resolveFetch(okResponse('Pronto.'))
    await waitFor(() => expect(screen.getByText('Pronto.')).toBeInTheDocument())
    expect(screen.getByLabelText('Pergunta ao assistente')).not.toBeDisabled()
  })
})
