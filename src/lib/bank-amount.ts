import Decimal from 'decimal.js'

/**
 * Dedicated parser for bank-statement amounts (fase C1). PT statements mix
 * conventions: "1.234,56" (dot thousands, comma decimal), "1 234,56",
 * "1234.56" (anglo exports), signs and currency symbols. NEVER parseFloat (A1).
 *
 * Rules, in order:
 *  1. Strip spaces (incl. NBSP), currency symbols and a leading sign.
 *  2. Both '.' and ',' present → the LAST one is the decimal separator.
 *  3. Only ',' → decimal separator (PT default).
 *  4. Only '.' → thousands separator when it forms full 3-digit groups
 *     ("1.234" = 1234€), decimal otherwise ("1234.56").
 * Throws on anything that does not survive as a plain decimal number.
 */
export function centsFromBankAmount(value: string): number {
  const stripped = value
    .replace(/[\s  ]/g, '')
    .replace(/€|EUR/gi, '')
  const signMatch = stripped.match(/^([+-]?)(.*)$/) as RegExpMatchArray
  const sign = signMatch[1] === '-' ? -1 : 1
  const body = signMatch[2]

  if (body === '' || !/^[\d.,]+$/.test(body)) {
    throw new Error(`Unparseable bank amount: "${value}"`)
  }

  const lastDot = body.lastIndexOf('.')
  const lastComma = body.lastIndexOf(',')

  let normalized: string
  if (lastDot !== -1 && lastComma !== -1) {
    // Both present — whichever comes last is the decimal separator
    const decimalSep = lastDot > lastComma ? '.' : ','
    const thousandsSep = decimalSep === '.' ? ',' : '.'
    normalized = body.split(thousandsSep).join('').replace(decimalSep, '.')
  } else if (lastComma !== -1) {
    if (body.indexOf(',') !== lastComma) {
      throw new Error(`Unparseable bank amount: "${value}"`)
    }
    normalized = body.replace(',', '.')
  } else if (lastDot !== -1) {
    // Dot-only: full 3-digit groups ⇒ PT thousands ("1.234" → 1234)
    if (/^\d{1,3}(\.\d{3})+$/.test(body)) {
      normalized = body.split('.').join('')
    } else if (body.indexOf('.') === lastDot) {
      normalized = body
    } else {
      throw new Error(`Unparseable bank amount: "${value}"`)
    }
  } else {
    normalized = body
  }

  const cents = new Decimal(normalized)
    .times(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber()
  return sign * cents
}
