/**
 * Boundary conversion of Moloni float values into integer cents/permil.
 * The Moloni doc types every monetary value as float — conversion happens
 * exactly once, here, with string/integer arithmetic (never chained float
 * math). See INTEGRATION_NOTES_MOLONI.md §4.
 */

/** Converts a monetary float (e.g. 19.99) to integer cents (1999). */
export function decimalToCents(value: number): number {
  void value
  throw new Error('Not implemented (RED)')
}

/** Converts a percent rate (e.g. 23, 6.5) to integer permil (230, 65). */
export function percentToPermil(value: number): number {
  void value
  throw new Error('Not implemented (RED)')
}
