'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Inbox, Users, FileText, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  unreadCount: number
  pendingCount: number
}

const navItems = [
  { href: '/inbox', label: 'Caixa de entrada', icon: Inbox, badgeKey: 'unread' },
  { href: '/clients', label: 'Clientes', icon: Users, badgeKey: null },
  { href: '/documents', label: 'Documentos', icon: FileText, badgeKey: null },
]

export function Sidebar({ unreadCount, pendingCount }: SidebarProps) {
  const pathname = usePathname()

  const getBadge = (key: string | null) => {
    if (key === 'unread') return unreadCount > 0 ? unreadCount : null
    return null
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <aside className="flex w-60 flex-col border-r border-neutral-200 bg-white">
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-neutral-200 px-5">
        <span className="text-[15px] font-semibold tracking-tight text-neutral-900">Gabify</span>
        <span className="ml-1.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-600">
          beta
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const active = isActive(item.href)
            const badge = getBadge(item.badgeKey)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    active
                      ? 'bg-neutral-100 font-medium text-neutral-900'
                      : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                  )}
                >
                  <item.icon
                    className={cn('h-4 w-4 shrink-0', active ? 'text-neutral-700' : 'text-neutral-400')}
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                  {badge !== null && (
                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-medium text-white">
                      {badge}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>

        {pendingCount > 0 && (
          <Link href="/inbox" className="mt-4 block">
            <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 hover:bg-yellow-100 transition-colors">
              <p className="text-xs font-medium text-yellow-800">
                {pendingCount} rascunho{pendingCount > 1 ? 's' : ''} aguarda{pendingCount === 1 ? '' : 'm'} aprovação
              </p>
            </div>
          </Link>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-neutral-200 px-3 py-3">
        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
            isActive('/settings')
              ? 'bg-neutral-100 font-medium text-neutral-900'
              : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700'
          )}
        >
          <Settings className="h-4 w-4" />
          <span>Definições</span>
        </Link>
        <div className="mt-2 flex items-center gap-2.5 rounded-md px-3 py-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-800 text-[11px] font-medium text-white">
            AF
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-neutral-800">Dr. António Ferreira</p>
            <p className="truncate text-[11px] text-neutral-500">aferreira@gabinete.pt</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
