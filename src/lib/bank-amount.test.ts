import { describe, it, expect } from 'vitest'
import { centsFromBankAmount } from './bank-amount'

/**
 * 🔴RED C1 — dedicated PT bank-amount parser (SPEC C1): money NEVER via
 * parseFloat (A1). Covers PT thousands/decimal conventions and signs.
 */
describe('centsFromBankAmount', () => {
  it('parses PT format with thousands dot: "1.234,56" → 123456', () => {
    expect(centsFromBankAmount('1.234,56')).toBe(123456)
  })

  it('parses negative debit: "-45,00" → -4500', () => {
    expect(centsFromBankAmount('-45,00')).toBe(-4500)
  })

  it('parses multiple thousands groups: "1.234.567,89" → 123456789', () => {
    expect(centsFromBankAmount('1.234.567,89')).toBe(123456789)
  })

  it('parses space as thousands separator: "1 234,56" → 123456', () => {
    expect(centsFromBankAmount('1 234,56')).toBe(123456)
  })

  it('parses plain comma decimal: "45,5" → 4550', () => {
    expect(centsFromBankAmount('45,5')).toBe(4550)
  })

  it('parses dot-decimal exports: "1234.56" → 123456', () => {
    expect(centsFromBankAmount('1234.56')).toBe(123456)
  })

  it('parses integer euros: "200" → 20000', () => {
    expect(centsFromBankAmount('200')).toBe(20000)
  })

  it('parses dot-only full 3-digit groups as thousands: "1.234" → 123400', () => {
    // PT statements: "1.234" is one thousand two hundred and thirty-four euros
    expect(centsFromBankAmount('1.234')).toBe(123400)
  })

  it('parses mixed anglo format: "1,234.56" → 123456', () => {
    expect(centsFromBankAmount('1,234.56')).toBe(123456)
  })

  it('parses explicit plus sign and euro symbol: "+1.000,00 €" → 100000', () => {
    expect(centsFromBankAmount('+1.000,00 €')).toBe(100000)
  })

  it('throws on garbage', () => {
    expect(() => centsFromBankAmount('abc')).toThrow()
    expect(() => centsFromBankAmount('')).toThrow()
    expect(() => centsFromBankAmount('12,34,56')).toThrow()
  })
})
