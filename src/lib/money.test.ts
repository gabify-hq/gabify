import { describe, it, expect } from 'vitest'
import {
  centsFromDecimalString,
  decimalStringFromCents,
  centsFromUnknown,
  euroNumberFromCents, // 🔴RED — added for the TOConline API boundary
} from './money'

describe('money helpers (A1 — never float arithmetic)', () => {
  it('centsFromDecimalString parses PT and dot formats', () => {
    expect(centsFromDecimalString('123.45')).toBe(12345)
    expect(centsFromDecimalString('123,45')).toBe(12345)
    expect(centsFromDecimalString('1 234,56')).toBe(123456)
  })

  it('decimalStringFromCents renders exact 2-decimal strings', () => {
    expect(decimalStringFromCents(12345)).toBe('123.45')
    expect(decimalStringFromCents(5)).toBe('0.05')
    expect(decimalStringFromCents(-12345)).toBe('-123.45')
  })

  it('centsFromUnknown handles null, numbers and strings safely', () => {
    expect(centsFromUnknown(null)).toBeNull()
    expect(centsFromUnknown('12,30')).toBe(1230)
    expect(centsFromUnknown(12.3)).toBe(1230)
    expect(centsFromUnknown('garbage')).toBeNull()
  })

  describe('euroNumberFromCents — conversion ONLY at the API boundary', () => {
    it('produces cent-exact euro numbers', () => {
      expect(euroNumberFromCents(8134)).toBe(81.34)
      expect(euroNumberFromCents(4567)).toBe(45.67)
      expect(euroNumberFromCents(0)).toBe(0)
      expect(euroNumberFromCents(1)).toBe(0.01)
      expect(euroNumberFromCents(100)).toBe(100 / 100)
    })

    it('serializes to the exact decimal string in JSON payloads', () => {
      expect(JSON.stringify(euroNumberFromCents(8134))).toBe('81.34')
      expect(JSON.stringify(euroNumberFromCents(1485))).toBe('14.85')
      expect(JSON.stringify({ v: euroNumberFromCents(4567) })).toBe('{"v":45.67}')
    })

    it('round-trips with centsFromDecimalString for every cent value in a sweep', () => {
      for (let cents = 0; cents <= 10_000; cents += 7) {
        const euros = euroNumberFromCents(cents)
        expect(centsFromDecimalString(String(euros))).toBe(cents)
      }
    })
  })
})
