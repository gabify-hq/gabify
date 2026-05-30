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

const variantStyles: Record<StatusVariant, string> = {
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  processing: 'bg-blue-50 text-blue-700 border-blue-200',
  draft: 'bg-neutral-100 text-neutral-600 border-neutral-200',
  complete: 'bg-green-50 text-green-700 border-green-200',
  incomplete: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  missing: 'bg-red-50 text-red-700 border-red-200',
  classified: 'bg-green-50 text-green-700 border-green-200',
  'needs-review': 'bg-yellow-50 text-yellow-700 border-yellow-200',
  reviewed: 'bg-neutral-100 text-neutral-600 border-neutral-200',
  unread: 'bg-blue-50 text-blue-700 border-blue-200',
}

export function StatusBadge({ variant, label, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium',
        variantStyles[variant],
        className
      )}
    >
      {label}
    </span>
  )
}
