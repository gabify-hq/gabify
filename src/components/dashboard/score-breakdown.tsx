import type { ReactElement } from 'react'

export interface ScoreBreakdownParts {
  amount: number
  date: number
  entity: number
  reference: number
}

/**
 * Reconciliation score breakdown in plain words (audit F1.4): always visible,
 * never hover-only, never single-letter codes — "M50 · D25" meant nothing to
 * an accountant, on mobile it did not even render.
 */
export function ScoreBreakdownLine({ breakdown }: { breakdown: ScoreBreakdownParts }): ReactElement {
  const parts = [
    `Montante ${breakdown.amount}`,
    `Data ${breakdown.date}`,
    `Entidade ${breakdown.entity}`,
    `Referência ${breakdown.reference}`,
  ]
  return (
    <span className="data w-full text-[10px] text-gray-400">
      {parts.join(' · ')}
    </span>
  )
}
