'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FileText, Upload, LogOut } from 'lucide-react'
import { signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'

/**
 * Portal navigation (fase P3) — deliberately minimal: Documentos, Carregar,
 * Sair. Nothing else exists for the end-client. Mobile-first: fixed bottom
 * bar with large touch targets; inline header nav from `sm` up.
 */

const LINKS = [
  { href: '/portal', label: 'Documentos', icon: FileText },
  { href: '/portal/upload', label: 'Carregar', icon: Upload },
] as const

export function PortalNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Navegação do portal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white sm:static sm:border-0 sm:bg-transparent"
    >
      <ul className="flex items-stretch justify-around sm:justify-end sm:gap-1">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href
          return (
            <li key={href} className="flex-1 sm:flex-none">
              <Link
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-0.5 px-3 py-2.5 text-[11px] font-semibold transition-colors sm:flex-row sm:gap-1.5 sm:rounded-lg sm:py-1.5 sm:text-[12px]',
                  isActive ? 'text-green-700 sm:bg-green-50' : 'text-gray-400 hover:text-gray-600',
                )}
              >
                <Icon className="h-4 w-4 stroke-[1.75]" />
                {label}
              </Link>
            </li>
          )
        })}
        <li className="flex-1 sm:flex-none">
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            aria-label="Terminar sessão"
            className="flex w-full flex-col items-center gap-0.5 px-3 py-2.5 text-[11px] font-semibold text-gray-400 transition-colors hover:text-red-500 sm:flex-row sm:gap-1.5 sm:rounded-lg sm:py-1.5 sm:text-[12px]"
          >
            <LogOut className="h-4 w-4 stroke-[1.75]" />
            Sair
          </button>
        </li>
      </ul>
    </nav>
  )
}
