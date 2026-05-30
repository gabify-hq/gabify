import type { ReactNode } from 'react'
import Link from 'next/link'
import { Inbox, Users, FileText, Settings, LayoutDashboard } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MOCK_EMAILS, MOCK_EMAIL_ACTIONS } from '@/lib/mock-data'

const pendingCount = MOCK_EMAIL_ACTIONS.filter((a) => a.status === 'PENDING_REVIEW').length
const unreadCount = MOCK_EMAILS.filter((e) => e.status === 'UNREAD').length

const navItems = [
  {
    href: '/inbox',
    label: 'Caixa de entrada',
    icon: Inbox,
    badge: unreadCount > 0 ? unreadCount : null,
  },
  {
    href: '/clients',
    label: 'Clientes',
    icon: Users,
    badge: null,
  },
  {
    href: '/documents',
    label: 'Documentos',
    icon: FileText,
    badge: null,
  },
]

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col border-r border-neutral-200 bg-white">
        {/* Logo */}
        <div className="flex h-14 items-center border-b border-neutral-200 px-5">
          <span className="text-[15px] font-semibold tracking-tight text-neutral-900">
            Gabify
          </span>
          <span className="ml-1.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-600">
            beta
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <ul className="space-y-0.5">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-neutral-600 transition-colors',
                    'hover:bg-neutral-100 hover:text-neutral-900'
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge !== null && (
                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-medium text-white">
                      {item.badge}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>

          {pendingCount > 0 && (
            <div className="mt-4 rounded-md border border-yellow-200 bg-yellow-50 p-3">
              <p className="text-xs font-medium text-yellow-800">
                {pendingCount} rascunho{pendingCount > 1 ? 's' : ''} aguarda{pendingCount === 1 ? '' : 'm'} aprovação
              </p>
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="border-t border-neutral-200 px-3 py-3">
          <Link
            href="/settings"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
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

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </div>
  )
}
