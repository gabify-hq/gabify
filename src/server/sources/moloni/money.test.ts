import { describe, expect, it } from 'vitest'
import { decimalToCents, percentToPermil } from './money'

describe('decimalToCents', () => {
  it('converts 19.99 exactly (naive float truncation yields 1998)', () => {
    expect(decimalToCents(19.99)).toBe(1999)
  })

  it('converts plain and sub-euro values exactly', () => {
    expect(decimalToCents(0)).toBe(0)
    expect(decimalToCents(0.07)).toBe(7)
    expect(decimalToCents(0.3)).toBe(30)
    expect(decimalToCents(4.6)).toBe(460)
    expect(decimalToCents(8.2)).toBe(820)
    expect(decimalToCents(10)).toBe(1000)
    expect(decimalToCents(35.56)).toBe(3556)
    expect(decimalToCents(1234.56)).toBe(123456)
  })

  it('handles other classic float traps', () => {
    expect(decimalToCents(1.15)).toBe(115)
    expect(decimalToCents(2.675)).toBe(268) // rounds half away from zero at 2dp
    expect(decimalToCents(0.1 + 0.2)).toBe(30)
  })

  it('handles negative values (credit amounts)', () => {
    expect(decimalToCents(-3.5)).toBe(-350)
    expect(decimalToCents(-19.99)).toBe(-1999)
  })

  it('rejects non-finite input', () => {
    expect(() => decimalToCents(Number.NaN)).toThrow()
    expect(() => decimalToCents(Number.POSITIVE_INFINITY)).toThrow()
  })
})

describe('percentToPermil', () => {
  it('converts integer and fractional rates exactly', () => {
    expect(percentToPermil(23)).toBe(230)
    expect(percentToPermil(6)).toBe(60)
    expect(percentToPermil(6.5)).toBe(65)
    expect(percentToPermil(0)).toBe(0)
  })

  it('rejects non-finite input', () => {
    expect(() => percentToPermil(Number.NaN)).toThrow()
  })
})
