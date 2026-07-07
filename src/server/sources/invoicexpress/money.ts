/**
 * Monetary boundary parsers for the InvoiceXpress connector.
 *
 * The saved docs (integrations/invoicexpress/docs/README.md) show amounts as
 * JSON numbers (`sum`, `taxes`, `total`, item `subtotal`, `tax_amount`) and as
 * strings on list items (`unit_price`, `quantity`), with `retention` as a
 * percentage string. Everything is converted to integer cents HERE, at the
 * boundary — never with chained float arithmetic downstream.
 */

/** Decimal string: optional sign, digits, optional fraction. */
const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/

interface ParsedDecimal {
  sign: 1 | -1
  integerPart: string
  fractionPart: string
}

function parseDecimalString(value: string): ParsedDecimal | null {
  const match = DECIMAL_PATTERN.exec(value.trim())
  if (!match) return null
  return {
    sign: match[1] === '-' ? -1 : 1,
    integerPart: match[2],
    fractionPart: match[3] ?? '',
  }
}

/**
 * Converts a decimal representation to integer cents using pure string/integer
 * math. Rounds the third fractional digit half away from zero.
 */
function decimalToCents(decimal: ParsedDecimal): number {
  const fraction = decimal.fractionPart.padEnd(3, '0')
  const wholeCents = Number(decimal.integerPart) * 100 + Number(fraction.slice(0, 2))
  const roundUp = Number(fraction[2]) >= 5 ? 1 : 0
  return decimal.sign * (wholeCents + roundUp)
}

/**
 * Converts an API amount (JSON number or decimal string) to integer cents.
 *
 * Numbers are stringified first (JS renders the shortest exact decimal for the
 * double, e.g. 19.99 → "19.99"), so 19.99 becomes exactly 1999 — no float
 * multiplication anywhere.
 */
export function amountToCents(value: number | string): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid amount: ${String(value)}`)
    }
    // Scientific notation (|value| >= 1e21 or tiny) never occurs for invoice
    // amounts, but toFixed keeps the representation plainly decimal.
    const asString = Math.abs(value) < 1e15 ? String(value) : value.toFixed(2)
    if (asString.includes('e') || asString.includes('E')) {
      return amountToCents(value.toFixed(6))
    }
    return amountToCents(asString)
  }

  const parsed = parseDecimalString(value)
  if (!parsed) {
    throw new Error(`Invalid amount string: "${value}"`)
  }
  return decimalToCents(parsed)
}

/**
 * Derives the IRS withholding amount in cents from the documented `retention`
 * percentage string (e.g. "25.0") applied to the base (before_taxes) in cents.
 *
 * DERIVED VALUE: the API only exposes the percentage, never the amount — see
 * INTEGRATION_NOTES_IVX.md. Integer arithmetic only: the percentage string is
 * turned into a numerator/denominator pair, and the result rounds half away
 * from zero. Returns null when the document carries no retention.
 */
export function percentToWithholdingCents(
  baseCents: number,
  retention: string | null | undefined,
): number | null {
  if (retention === null || retention === undefined || retention.trim() === '') {
    return null
  }
  const parsed = parseDecimalString(retention)
  if (!parsed) {
    throw new Error(`Invalid retention percentage: "${retention}"`)
  }
  // "11.5" → numerator 115, denominator 100 * 10^1
  const digits = `${parsed.integerPart}${parsed.fractionPart}`
  const numerator = Number(digits) * parsed.sign
  const denominator = 100 * 10 ** parsed.fractionPart.length
  if (numerator === 0) return null

  const product = baseCents * numerator
  const quotient = product / denominator
  return quotient >= 0 ? Math.round(quotient) : -Math.round(-quotient)
}
