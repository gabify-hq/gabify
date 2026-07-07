import { describe, it, expect } from 'vitest'
import { amountToCents, percentToWithholdingCents } from './money'

describe('amountToCents', () => {
  it('converts the 19.99 float boundary case exactly to 1999 cents', () => {
    expect(amountToCents(19.99)).toBe(1999)
  })

  it('converts the doc example values (24.39, 5.61, 30) exactly', () => {
    expect(amountToCents(24.39)).toBe(2439)
    expect(amountToCents(5.61)).toBe(561)
    expect(amountToCents(30)).toBe(3000)
  })

  it('converts small float values without drift (0.07, 1.07)', () => {
    expect(amountToCents(0.07)).toBe(7)
    expect(amountToCents(1.07)).toBe(107)
  })

  it('parses string amounts as returned in list items ("1.0", "19.99")', () => {
    expect(amountToCents('1.0')).toBe(100)
    expect(amountToCents('19.99')).toBe(1999)
    expect(amountToCents('1000.0')).toBe(100000)
  })

  it('handles negative amounts', () => {
    expect(amountToCents(-61.5)).toBe(-6150)
    expect(amountToCents('-61.50')).toBe(-6150)
  })

  it('rounds a third decimal digit half away from zero', () => {
    expect(amountToCents('1.005')).toBe(101)
    expect(amountToCents('-1.005')).toBe(-101)
    expect(amountToCents('1.004')).toBe(100)
  })

  it('handles zero and integer strings', () => {
    expect(amountToCents(0)).toBe(0)
    expect(amountToCents('0')).toBe(0)
    expect(amountToCents('42')).toBe(4200)
  })

  it('rejects non-numeric input with a clear error', () => {
    expect(() => amountToCents('not-a-number')).toThrow(/amount/i)
    expect(() => amountToCents(Number.NaN)).toThrow(/amount/i)
    expect(() => amountToCents(Number.POSITIVE_INFINITY)).toThrow(/amount/i)
  })
})

describe('percentToWithholdingCents', () => {
  it('computes 25% IRS retention over 1000.00 → 25000 cents', () => {
    expect(percentToWithholdingCents(100000, '25.0')).toBe(25000)
  })

  it('computes fractional rates (11.5% over 200.00 → 2300 cents) with integer math', () => {
    expect(percentToWithholdingCents(20000, '11.5')).toBe(2300)
  })

  it('rounds half away from zero on sub-cent results', () => {
    // 25% of 0.01 € (1 cent) = 0.25 cent → 0 cents
    expect(percentToWithholdingCents(1, '25.0')).toBe(0)
    // 25% of 0.02 € (2 cents) = 0.5 cent → 1 cent
    expect(percentToWithholdingCents(2, '25.0')).toBe(1)
  })

  it('returns null for zero or missing retention', () => {
    expect(percentToWithholdingCents(100000, '0')).toBeNull()
    expect(percentToWithholdingCents(100000, '')).toBeNull()
    expect(percentToWithholdingCents(100000, null)).toBeNull()
  })

  it('carries the sign of the base (credit notes)', () => {
    expect(percentToWithholdingCents(-100000, '25.0')).toBe(-25000)
  })

  it('rejects malformed retention strings', () => {
    expect(() => percentToWithholdingCents(100000, 'abc')).toThrow(/retention/i)
  })
})
