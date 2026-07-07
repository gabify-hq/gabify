/**
 * PT-PT display formatting helpers (production home of what previously
 * lived in mock-data).
 */

export function formatDateTime(date: Date): string {
  return date.toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 60) return `há ${diffMins}min`
  if (diffHours < 24) return `há ${diffHours}h`
  if (diffDays === 1) return 'ontem'
  if (diffDays < 7) return `há ${diffDays} dias`
  return formatDate(date)
}
