// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const routerRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: routerRefresh }),
}))

import {
  ToconlineIntegrationPanel,
  type ToconlineConnectionInfo,
  type ToconlinePushableDocument,
} from './toconline-integration-panel'

function makeConnection(overrides: Partial<ToconlineConnectionInfo> = {}): ToconlineConnectionInfo {
  return {
    status: 'ACTIVE',
    dryRun: true,
    oauthUrl: 'https://oauth.example.test/oauth',
    apiUrl: 'https://api.example.test',
    oauthClientId: 'integrator-id',
    lastError: null,
    ...overrides,
  }
}

function makeDoc(overrides: Partial<ToconlinePushableDocument> = {}): ToconlinePushableDocument {
  return {
    id: 'doc-1',
    number: 'FT 2026/123',
    date: '15/06/2026',
    supplier: 'Fornecedor Lda',
    total: '148,46 €',
    pushStatus: null,
    pushError: null,
    ...overrides,
  }
}

describe('ToconlineIntegrationPanel', () => {
  it('desligar dry-run exige confirmação explícita com o aviso "nunca testada"', async () => {
    const user = userEvent.setup()
    render(
      <ToconlineIntegrationPanel
        clientId="c1"
        connection={makeConnection({ dryRun: true })}
        documents={[]}
        canManage
        canGoLive
      />,
    )

    await user.click(screen.getByRole('button', { name: /Ativar envios reais/ }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent(
      'Esta integração nunca foi testada contra o TOConline real. Ativar envia documentos reais.',
    )
    // Explicit two-step: the destructive action needs its own click
    expect(screen.getByRole('button', { name: /Compreendo, ativar envios reais/ })).toBeInTheDocument()
  })

  it('sem toconline:goLive (ACCOUNTANT) o botão de envios reais não existe', () => {
    render(
      <ToconlineIntegrationPanel
        clientId="c1"
        connection={makeConnection({ dryRun: true })}
        documents={[]}
        canManage
        canGoLive={false}
      />,
    )
    expect(screen.queryByRole('button', { name: /Ativar envios reais/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar credenciais' })).toBeInTheDocument()
  })

  it('VIEWER (read-only): vê estado e tabela mas sem formulário, checkboxes ou botões de gestão', () => {
    render(
      <ToconlineIntegrationPanel
        clientId="c1"
        connection={makeConnection({ dryRun: false })}
        documents={[makeDoc()]}
        canManage={false}
        canGoLive={false}
      />,
    )
    expect(screen.getByText('Ativa')).toBeInTheDocument()
    expect(screen.getByText('FT 2026/123')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Enviar para TOConline/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar credenciais' })).not.toBeInTheDocument()
  })

  it('estados de envio em pt-PT com o mapa de cores da casa; aviso NÃO TESTADA sempre visível', () => {
    render(
      <ToconlineIntegrationPanel
        clientId="c1"
        connection={makeConnection()}
        documents={[
          makeDoc({ id: 'd1', pushStatus: 'SENT', number: 'FT 1' }),
          makeDoc({ id: 'd2', pushStatus: 'ERROR', number: 'FT 2', pushError: 'falhou' }),
          makeDoc({ id: 'd3', pushStatus: 'PENDING', number: 'FT 3' }),
          makeDoc({ id: 'd4', pushStatus: null, number: 'FT 4' }),
        ]}
        canManage
        canGoLive
      />,
    )
    expect(screen.getByText('Enviado')).toBeInTheDocument()
    expect(screen.getByText('Erro')).toBeInTheDocument()
    expect(screen.getByText('Pendente')).toBeInTheDocument()
    expect(screen.getByText(/NÃO testada contra o TOConline real/)).toBeInTheDocument()
    // SENT/PENDING rows are not selectable; ERROR is retryable — FT 2 + FT 4
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  })
})
