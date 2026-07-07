import Decimal from 'decimal.js'

/**
 * Money handling (ADDENDUM A1): NEVER float arithmetic.
 * Convention: integer cents inside JSONB; `Decimal @db.Decimal(14,2)` in columns.
 * All sums/coherence checks run on integer cents or decimal.js.
 */

/** Coherence tolerance in cents (A1). */
export const COHERENCE_TOLERANCE_CENTS = 2

/** Parses "123.45", "123,45", "1 234,56" into integer cents. Throws on garbage. */
export function centsFromDecimalString(value: string): number {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.')
  const d = new Decimal(normalized)
  return d.times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
}

export function addCents(a: number, b: number): number {
  return a + b
}

/** "12345" cents → "123.45" (string for Prisma Decimal columns). */
export function decimalStringFromCents(cents: number): string {
  return new Decimal(cents).dividedBy(100).toFixed(2)
}

/** Display form with dot decimal, no thousands separator. */
export function formatCents(cents: number): string {
  return decimalStringFromCents(cents)
}

/**
 * Integer cents → euro Number with exactly the cent value (e.g. 8134 → 81.34).
 * For use ONLY at external API boundaries that require JSON numbers (TOConline
 * purchase lines): the value serializes to the exact 2-decimal string.
 * All internal arithmetic stays in integer cents.
 */
export function euroNumberFromCents(cents: number): number {
  return Number(new Decimal(cents).dividedBy(100).toFixed(2))
}

/** Parses a nullable numeric-ish input safely into cents, or null. */
export function centsFromUnknown(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Decimal(value).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
  }
  if (typeof value === 'string' && value.trim() !== '') {
    try {
      return centsFromDecimalString(value)
    } catch {
      return null
    }
  }
  return null
}
