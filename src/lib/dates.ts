/**
 * Parses PT-style dates (DD/MM/YYYY, DD-MM-YYYY) and ISO (YYYY-MM-DD).
 * Normalised to 12:00 UTC (A12): the calendar date is stable in any timezone —
 * midnight-UTC parsing shifted dates by one day west of Greenwich.
 */
export function parsePtDate(dateStr: string): Date | null {
  const trimmed = dateStr.trim()

  let year: number, month: number, day: number
  const pt = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (pt) {
    day = Number(pt[1])
    month = Number(pt[2])
    year = Number(pt[3])
  } else if (iso) {
    year = Number(iso[1])
    month = Number(iso[2])
    day = Number(iso[3])
  } else {
    return null
  }

  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  if (isNaN(d.getTime()) || d.getUTCDate() !== day || d.getUTCMonth() !== month - 1) {
    return null
  }
  return d
}
