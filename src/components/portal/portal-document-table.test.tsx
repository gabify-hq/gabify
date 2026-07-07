// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

import { PortalDocumentTable } from './portal-document-table'
import type { PortalDocumentDTO } from '@/server/services/portal-service'

function makeItem(overrides: Partial<PortalDocumentDTO> = {}): PortalDocumentDTO {
  return {
    id: 'doc-1',
    filename: 'fatura-marco.pdf',
    submittedAt: '2026-03-15T10:00:00.000Z',
    origin: 'UPLOAD',
    status: 'PROCESSING',
    ...overrides,
  }
}

describe('PortalDocumentTable (P3 — só estados públicos, nunca internos)', () => {
  it('renderiza os três estados públicos em pt-PT', () => {
    render(
      <PortalDocumentTable
        items={[
          makeItem({ id: 'd1', status: 'PROCESSING', filename: 'a.pdf' }),
          makeItem({ id: 'd2', status: 'PROCESSED', filename: 'b.pdf' }),
          makeItem({ id: 'd3', status: 'RETURNED', filename: 'c.pdf' }),
        ]}
      />,
    )
    expect(screen.getByText('Em processamento')).toBeInTheDocument()
    expect(screen.getByText('Processado')).toBeInTheDocument()
    expect(screen.getByText('Devolvido')).toBeInTheDocument()
    expect(screen.getByText('a.pdf')).toBeInTheDocument()
  })

  it('[INV] nunca renderiza strings de estados/flags internos', () => {
    const { container } = render(
      <PortalDocumentTable
        items={[
          makeItem({ id: 'd1', status: 'PROCESSING' }),
          makeItem({ id: 'd2', status: 'PROCESSED' }),
          makeItem({ id: 'd3', status: 'RETURNED' }),
        ]}
      />,
    )
    const html = container.innerHTML
    for (const internal of [
      'NEEDS_REVIEW', 'PRE_VALIDATED', 'VALIDATED', 'EXPORTED',
      'DUPLICATE_SUSPECT', 'WRONG_CLIENT_SUSPECT', 'A rever', 'Pré-validado',
    ]) {
      expect(html, `estado interno "${internal}" visível no portal`).not.toContain(internal)
    }
  })

  it('estado vazio em pt-PT quando não há documentos', () => {
    render(<PortalDocumentTable items={[]} />)
    expect(screen.getByText(/sem documentos/i)).toBeInTheDocument()
  })

  it('datas em formato DD/MM/YYYY', () => {
    render(<PortalDocumentTable items={[makeItem({ submittedAt: '2026-03-15T10:00:00.000Z' })]} />)
    expect(screen.getByText('15/03/2026')).toBeInTheDocument()
  })
})
