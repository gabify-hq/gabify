'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Inbox, Users, FileText, Settings, LogOut } from 'lucide-react'
import { signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'

interface SidebarUser {
  name?: string | null
  email?: string | null
}

interface SidebarProps {
  unreadCount: number
  pendingCount: number
  user?: SidebarUser
}

const navItems = [
  { href: '/inbox', label: 'Caixa de entrada', icon: Inbox, badgeKey: 'unread' as const },
  { href: '/clients', label: 'Clientes', icon: Users, badgeKey: null },
  { href: '/documents', label: 'Documentos', icon: FileText, badgeKey: null },
]

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return ((parts[0][0] ?? '') + (parts[1][0] ?? '')).toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }
  if (email) {
    return email.slice(0, 2).toUpperCase()
  }
  return '?'
}

function LogoutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: '/auth/signin' })}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[12px] font-medium text-gray-400 transition-colors duration-150 hover:bg-red-50 hover:text-red-500"
      aria-label="Terminar sessão"
    >
      <LogOut className="h-3.5 w-3.5 shrink-0 stroke-[1.75]" />
      <span>Terminar sessão</span>
    </button>
  )
}

export function Sidebar({ unreadCount, pendingCount, user }: SidebarProps) {
  const pathname = usePathname()

  const getBadge = (key: 'unread' | null) =>
    key === 'unread' && unreadCount > 0 ? unreadCount : null

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  const initials = getInitials(user?.name, user?.email)
  const displayName = user?.name ?? user?.email ?? 'Utilizador'
  const displayEmail = user?.email ?? ''

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-gray-50">
      {/* Logo */}
      <div className="flex h-13 items-center border-b border-gray-200 px-4 py-3.5">
        <Link href="/inbox" className="flex flex-1 items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-600 shadow-sm">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 7h4M7 2v4M7 8v4M8 7h4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </span>
          <span className="text-[14px] font-bold tracking-tight text-gray-900">
            Gabify
          </span>
        </Link>
        <span className="rounded-md bg-green-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-green-700">
          beta
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {/* Pending drafts notice */}
        {pendingCount > 0 && (
          <div className="mb-3 flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
            </span>
            <span className="text-[11px] font-semibold leading-tight text-amber-700">
              {pendingCount} rascunho{pendingCount !== 1 ? 's' : ''} pendente{pendingCount !== 1 ? 's' : ''}
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
                    'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-all duration-150',
                    active
                      ? 'bg-white text-green-700 shadow-sm ring-1 ring-gray-200'
                      : 'text-gray-500 hover:bg-white/60 hover:text-gray-700',
                  )}
                >
                  {/* Active left border */}
                  {active && (
                    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-green-500" />
                  )}
                  <item.icon
                    className={cn(
                      'h-4 w-4 shrink-0 stroke-[1.75]',
                      active ? 'text-green-600' : 'text-gray-400 group-hover:text-gray-500',
                    )}
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                  {badge !== null && (
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-100 px-1.5 text-[10px] font-bold text-blue-700">
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
      <div className="border-t border-gray-200 px-3 py-3">
        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150',
            isActive('/settings')
              ? 'bg-white text-gray-800 shadow-sm ring-1 ring-gray-200'
              : 'text-gray-500 hover:bg-white/60 hover:text-gray-700',
          )}
        >
          <Settings className="h-4 w-4 shrink-0 stroke-[1.75] text-gray-400" />
          <span>Definições</span>
        </Link>

        {/* User */}
        <div className="mt-1 flex items-center gap-3 px-3 py-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-600 text-[11px] font-bold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-gray-700">{displayName}</p>
            {displayEmail && (
              <p className="truncate text-[10px] text-gray-400">{displayEmail}</p>
            )}
          </div>
        </div>

        {/* Logout */}
        <LogoutButton />
      </div>
    </aside>
  )
}
