'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NAV_ITEMS, getInitials, LogoutButton } from './sidebar'

interface MobileNavUser {
  name?: string | null
  email?: string | null
}

interface MobileNavProps {
  unreadCount: number
  pendingCount: number
  user?: MobileNavUser
}

/**
 * Mobile shell (audit F1.4): top bar with hamburger below `md`, opening a
 * full-height drawer with the same destinations as the desktop sidebar.
 * The desktop sidebar is `hidden md:flex`; this is its mirror (`md:hidden`).
 */
export function MobileNav({ unreadCount, pendingCount, user }: MobileNavProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const initials = getInitials(user?.name, user?.email)

  return (
    <div className="md:hidden">
      {/* Top bar */}
      <div className="flex h-12 items-center gap-2.5 border-b border-gray-200 bg-gray-50 px-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          className="pressable rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100"
        >
          <Menu className="h-5 w-5 stroke-[1.75]" />
        </button>
        <Link href="/inbox" className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-green-600">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 7h4M7 2v4M7 8v4M8 7h4" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <span className="text-[14px] font-bold tracking-tight text-gray-900">Gabify</span>
        </Link>
        {pendingCount > 0 && (
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            {pendingCount} rascunho{pendingCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop — click closes; the drawer's X is the accessible control */}
          <div
            role="presentation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/30"
          />
          <nav
            aria-label="Menu principal"
            className="relative flex h-full w-64 flex-col border-r border-gray-200 bg-gray-50 shadow-xl"
          >
            <div className="flex h-12 items-center justify-between border-b border-gray-200 px-3">
              <span className="text-[14px] font-bold tracking-tight text-gray-900">Gabify</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
                className="pressable rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100"
              >
                <X className="h-4 w-4 stroke-[2]" />
              </button>
            </div>

            <ul className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
              {NAV_ITEMS.map((item) => {
                const active = isActive(item.href)
                const badge = item.badgeKey === 'unread' && unreadCount > 0 ? unreadCount : null
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors',
                        active
                          ? 'bg-white text-green-700 shadow-sm ring-1 ring-gray-200'
                          : 'text-gray-500 hover:bg-white/60 hover:text-gray-700',
                      )}
                    >
                      <item.icon
                        className={cn(
                          'h-4 w-4 shrink-0 stroke-[1.75]',
                          active ? 'text-green-600' : 'text-gray-400',
                        )}
                      />
                      <span className="flex-1">{item.label}</span>
                      {badge !== null && (
                        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-100 px-1.5 text-[10px] font-bold text-blue-700">
                          {badge}
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
              <li>
                <Link
                  href="/settings"
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors',
                    isActive('/settings')
                      ? 'bg-white text-gray-800 shadow-sm ring-1 ring-gray-200'
                      : 'text-gray-500 hover:bg-white/60 hover:text-gray-700',
                  )}
                >
                  <Settings className="h-4 w-4 shrink-0 stroke-[1.75] text-gray-400" />
                  <span>Definições</span>
                </Link>
              </li>
            </ul>

            <div className="border-t border-gray-200 px-3 py-3">
              <div className="flex items-center gap-3 px-3 py-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-600 text-[11px] font-bold text-white">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-gray-700">
                    {user?.name ?? user?.email ?? 'Utilizador'}
                  </p>
                  {user?.email && (
                    <p className="truncate text-[10px] text-gray-400">{user.email}</p>
                  )}
                </div>
              </div>
              <LogoutButton />
            </div>
          </nav>
        </div>
      )}
    </div>
  )
}
