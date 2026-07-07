/**
 * Boundary conversion of Moloni float values into integer cents/permil.
 * The Moloni doc types every monetary value as float — conversion happens
 * exactly once, here, with string/integer arithmetic (never chained float
 * math). See INTEGRATION_NOTES_MOLONI.md §4.
 */

const SERIALIZATION_DECIMALS = 6

/**
 * Scales a decimal number to an integer with `decimals` decimal places,
 * rounding half away from zero. Works on the decimal string representation
 * so float artifacts (19.99 → 1998.999…) never reach the result.
 */
function scaleDecimal(value: number, decimals: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot convert non-finite number to scaled integer: ${value}`)
  }
  const isNegative = value < 0
  const serialized = Math.abs(value).toFixed(SERIALIZATION_DECIMALS)
  const [integerPart, fractionPart] = serialized.split('.')
  const keptDigits = fractionPart.slice(0, decimals)
  const remainder = fractionPart.slice(decimals)
  let scaled = Number(integerPart) * 10 ** decimals + Number(keptDigits === '' ? '0' : keptDigits)
  if (remainder !== '' && Number(remainder.charAt(0)) >= 5) {
    scaled += 1
  }
  return isNegative ? -scaled : scaled
}

/** Converts a monetary float (e.g. 19.99) to integer cents (1999). */
export function decimalToCents(value: number): number {
  return scaleDecimal(value, 2)
}

/** Converts a percent rate (e.g. 23, 6.5) to integer permil (230, 65). */
export function percentToPermil(value: number): number {
  return scaleDecimal(value, 1)
}
