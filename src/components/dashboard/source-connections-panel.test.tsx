// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const routerRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: routerRefresh }),
}))

import { SourceConnectionsPanel, type SourceConnectionInfo } from './source-connections-panel'

function moloniInfo(overrides: Partial<SourceConnectionInfo> = {}): SourceConnectionInfo {
  return {
    status: 'ATIVA',
    pullEnabled: true,
    lastPullAt: '01/07/2026 09:00',
    lastError: null,
    importedCount: 3,
    hasCredentials: true,
    companyId: 12345,
    companyName: 'Empresa X',
    ...overrides,
  }
}

describe('SourceConnectionsPanel', () => {
  beforeEach(() => {
    routerRefresh.mockReset()
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ success: true, data: {} }), { status: 200 })) as never
  })

  it('mostra sempre o aviso NÃO TESTADO contra a API real', () => {
    render(<SourceConnectionsPanel clientId="c1" moloni={null} invoicexpress={null} canManage />)
    expect(screen.getByText(/NÃO TESTADO contra a API real/i)).toBeInTheDocument()
    // both systems are listed as source entries
    expect(screen.getByText('Moloni')).toBeInTheDocument()
    expect(screen.getByText('InvoiceXpress')).toBeInTheDocument()
  })

  it('VIEWER (canManage=false) não vê o botão de ligar nem edita', () => {
    render(<SourceConnectionsPanel clientId="c1" moloni={null} invoicexpress={null} canManage={false} />)
    expect(screen.queryByRole('button', { name: /Ligar ao Moloni/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ligar ao InvoiceXpress/ })).not.toBeInTheDocument()
  })

  it('mostra a última sincronização e a contagem de importados de uma ligação ativa', () => {
    render(<SourceConnectionsPanel clientId="c1" moloni={moloniInfo()} invoicexpress={null} canManage />)
    expect(screen.getByText(/Última sincronização: 01\/07\/2026 09:00/)).toBeInTheDocument()
    expect(screen.getByText(/3 importados/)).toBeInTheDocument()
  })

  it('"Sincronizar agora" chama a rota de sync do sistema', async () => {
    const user = userEvent.setup()
    render(<SourceConnectionsPanel clientId="c1" moloni={moloniInfo()} invoicexpress={null} canManage />)
    await user.click(screen.getByRole('button', { name: /Sincronizar agora/ }))
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/clients/c1/sources/moloni/sync',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
