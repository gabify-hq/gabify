import { describe, it, expect } from 'vitest'
import { homePathFor, resolveAreaRedirect } from './area-redirect'

describe('resolveAreaRedirect (P3 — dupla barreira por role)', () => {
  it('CLIENT a navegar na área do gabinete → /portal', () => {
    expect(resolveAreaRedirect('CLIENT', 'dashboard')).toBe('/portal')
  })

  it('users internos a navegar no portal → área do gabinete', () => {
    for (const role of ['OWNER', 'ACCOUNTANT', 'VIEWER'] as const) {
      expect(resolveAreaRedirect(role, 'portal'), role).toBe('/inbox')
    }
  })

  it('área correta → sem redirect', () => {
    expect(resolveAreaRedirect('CLIENT', 'portal')).toBeNull()
    for (const role of ['OWNER', 'ACCOUNTANT', 'VIEWER'] as const) {
      expect(resolveAreaRedirect(role, 'dashboard'), role).toBeNull()
    }
  })

  it('sem sessão → /login em qualquer área', () => {
    expect(resolveAreaRedirect(null, 'dashboard')).toBe('/login')
    expect(resolveAreaRedirect(undefined, 'portal')).toBe('/login')
  })
})

describe('homePathFor', () => {
  it('CLIENT entra no portal; internos entram no inbox; anónimo no login', () => {
    expect(homePathFor('CLIENT')).toBe('/portal')
    expect(homePathFor('OWNER')).toBe('/inbox')
    expect(homePathFor('ACCOUNTANT')).toBe('/inbox')
    expect(homePathFor('VIEWER')).toBe('/inbox')
    expect(homePathFor(null)).toBe('/login')
  })
})
