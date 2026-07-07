/**
 * Single application timezone (ADDENDUM A12).
 * Month closes at 23:59:59 Lisbon time — used by exports and period dashboards.
 */
export const APP_TZ = 'Europe/Lisbon'

/** Formats a date as DD/MM/YYYY in the application timezone. */
export function formatDatePt(date: Date): string {
  return new Intl.DateTimeFormat('pt-PT', {
    timeZone: APP_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

/** Year and month (1-12) of a date in the application timezone. */
export function periodInAppTz(date: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('pt-PT', {
    timeZone: APP_TZ,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(date)
  const year = Number(parts.find((p) => p.type === 'year')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  return { year, month }
}
