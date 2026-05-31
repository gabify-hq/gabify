import { cn } from '@/lib/utils'

type StatusVariant =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'processing'
  | 'draft'
  | 'complete'
  | 'incomplete'
  | 'missing'
  | 'classified'
  | 'needs-review'
  | 'reviewed'
  | 'unread'

interface StatusBadgeProps {
  variant: StatusVariant
  label: string
  className?: string
}

// Dot color + text color — minimal, no pill background
const variantStyles: Record<StatusVariant, { dot: string; text: string }> = {
  pending:       { dot: 'bg-amber-400',  text: 'text-amber-400' },
  approved:      { dot: 'bg-green-500',  text: 'text-green-400' },
  rejected:      { dot: 'bg-red-500',    text: 'text-red-400' },
  processing:    { dot: 'bg-blue-500',   text: 'text-blue-400' },
  draft:         { dot: 'bg-zinc-500',   text: 'text-zinc-400' },
  complete:      { dot: 'bg-green-500',  text: 'text-green-400' },
  incomplete:    { dot: 'bg-amber-400',  text: 'text-amber-400' },
  missing:       { dot: 'bg-red-500',    text: 'text-red-400' },
  classified:    { dot: 'bg-green-500',  text: 'text-green-400' },
  'needs-review':{ dot: 'bg-amber-400',  text: 'text-amber-400' },
  reviewed:      { dot: 'bg-zinc-500',   text: 'text-zinc-400' },
  unread:        { dot: 'bg-blue-500',   text: 'text-blue-400' },
}

export function StatusBadge({ variant, label, className }: StatusBadgeProps) {
  const styles = variantStyles[variant]
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', styles.dot)} />
      <span className={cn('text-[11px] font-medium', styles.text)}>{label}</span>
    </span>
  )
}

// Compact pill variant for tight spaces (table cells, etc.)
export function StatusPill({ variant, label, className }: StatusBadgeProps) {
  const pillStyles: Record<StatusVariant, string> = {
    pending:        'bg-amber-500/10 text-amber-400 ring-amber-500/20',
    approved:       'bg-green-500/10 text-green-400 ring-green-500/20',
    rejected:       'bg-red-500/10 text-red-400 ring-red-500/20',
    processing:     'bg-blue-500/10 text-blue-400 ring-blue-500/20',
    draft:          'bg-zinc-700/50 text-zinc-400 ring-zinc-600/20',
    complete:       'bg-green-500/10 text-green-400 ring-green-500/20',
    incomplete:     'bg-amber-500/10 text-amber-400 ring-amber-500/20',
    missing:        'bg-red-500/10 text-red-400 ring-red-500/20',
    classified:     'bg-green-500/10 text-green-400 ring-green-500/20',
    'needs-review': 'bg-amber-500/10 text-amber-400 ring-amber-500/20',
    reviewed:       'bg-zinc-700/50 text-zinc-400 ring-zinc-600/20',
    unread:         'bg-blue-500/10 text-blue-400 ring-blue-500/20',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset',
        pillStyles[variant],
        className
      )}
    >
      {label}
    </span>
  )
}
