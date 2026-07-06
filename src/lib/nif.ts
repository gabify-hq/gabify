/**
 * Portuguese NIF validation (module 11 check digit).
 */
export function isValidNif(nif: string): boolean {
  if (!/^\d{9}$/.test(nif)) return false
  const digits = nif.split('').map(Number)
  const sum = digits.slice(0, 8).reduce((acc, d, i) => acc + d * (9 - i), 0)
  const remainder = sum % 11
  const check = remainder < 2 ? 0 : 11 - remainder
  return check === digits[8]
}
