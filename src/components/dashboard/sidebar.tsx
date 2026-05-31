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

  const getBadge = (key: string | null) =>
    key === 'unread' && unreadCount > 0 ? unreadCount : null

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
      {/* Logo */}
      <div className="flex h-12 items-center border-b border-zinc-800 px-4">
        <span className="text-sm font-semibold tracking-tight text-zinc-100">
          Gabify
        </span>
        <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
          beta
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {pendingCount > 0 && (
          <div className="mb-2 flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
            <span className="text-[11px] font-medium text-amber-400/90">
              {pendingCount} rascunho{pendingCount > 1 ? 's' : ''} pendente{pendingCount > 1 ? 's' : ''}
            </span>
          </div>
        )}

        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const active = isActive(item.href)
            const badge = getBadge(item.badgeKey)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors duration-150',
                    active
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                  )}
                >
                  {/* Active left border */}
                  {active && (
                    <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r bg-green-500" />
                  )}
                  <item.icon
                    className={cn(
                      'h-3.5 w-3.5 shrink-0 stroke-[1.5]',
                      active ? 'text-zinc-300' : 'text-zinc-500 group-hover:text-zinc-300'
                    )}
                  />
                  <span className="flex-1 truncate font-medium">{item.label}</span>
                  {badge !== null && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded bg-blue-500/20 px-1 text-[10px] font-semibold text-blue-400">
                      {badge}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-zinc-800 px-2 py-2">
        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors duration-150',
            isActive('/settings')
              ? 'bg-zinc-800 text-zinc-200'
              : 'text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300'
          )}
        >
          <Settings className="h-3.5 w-3.5 stroke-[1.5]" />
          <span className="font-medium">Definições</span>
        </Link>

        <div className="mt-1 flex items-center gap-2.5 px-3 py-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-zinc-700 text-[10px] font-semibold text-zinc-300">
            AF
          </div>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-medium text-zinc-300">Dr. António Ferreira</p>
            <p className="truncate text-[10px] text-zinc-600">aferreira@gabinete.pt</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
