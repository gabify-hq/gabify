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

const dotStyles: Record<StatusVariant, { dot: string; text: string }> = {
  pending:        { dot: 'bg-amber-500',  text: 'text-amber-700' },
  approved:       { dot: 'bg-green-500',  text: 'text-green-700' },
  rejected:       { dot: 'bg-red-500',    text: 'text-red-600' },
  processing:     { dot: 'bg-blue-500',   text: 'text-blue-700' },
  draft:          { dot: 'bg-gray-400',   text: 'text-gray-500' },
  complete:       { dot: 'bg-green-500',  text: 'text-green-700' },
  incomplete:     { dot: 'bg-amber-500',  text: 'text-amber-700' },
  missing:        { dot: 'bg-red-500',    text: 'text-red-600' },
  classified:     { dot: 'bg-green-500',  text: 'text-green-700' },
  'needs-review': { dot: 'bg-amber-500',  text: 'text-amber-700' },
  reviewed:       { dot: 'bg-gray-400',   text: 'text-gray-500' },
  unread:         { dot: 'bg-blue-500',   text: 'text-blue-700' },
}

export function StatusBadge({ variant, label, className }: StatusBadgeProps) {
  const styles = dotStyles[variant]
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', styles.dot)} />
      <span className={cn('text-[11px] font-medium', styles.text)}>{label}</span>
    </span>
  )
}

const pillStyles: Record<StatusVariant, string> = {
  pending:        'bg-amber-50 text-amber-700 ring-amber-200',
  approved:       'bg-green-50 text-green-700 ring-green-200',
  rejected:       'bg-red-50 text-red-600 ring-red-200',
  processing:     'bg-blue-50 text-blue-700 ring-blue-200',
  draft:          'bg-gray-100 text-gray-500 ring-gray-200',
  complete:       'bg-green-50 text-green-700 ring-green-200',
  incomplete:     'bg-amber-50 text-amber-700 ring-amber-200',
  missing:        'bg-red-50 text-red-600 ring-red-200',
  classified:     'bg-green-50 text-green-700 ring-green-200',
  'needs-review': 'bg-amber-50 text-amber-700 ring-amber-200',
  reviewed:       'bg-gray-100 text-gray-500 ring-gray-200',
  unread:         'bg-blue-50 text-blue-700 ring-blue-200',
}

export function StatusPill({ variant, label, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset',
        pillStyles[variant],
        className,
      )}
    >
      {label}
    </span>
  )
}
