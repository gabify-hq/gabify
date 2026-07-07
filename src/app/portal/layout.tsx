import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveAreaRedirect } from '@/lib/area-redirect'
import { PortalNav } from '@/components/portal/portal-nav'

/**
 * End-client portal layout (fase P3) — its own shell, never the dashboard's.
 * Second barrier of the role split: only CLIENT sessions render here; internal
 * users are sent back to the office area (first barrier lives in the dashboard
 * layout — both consume `resolveAreaRedirect`).
 */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const session = await auth()
  const target = resolveAreaRedirect(session?.user?.role ?? null, 'portal')
  if (target) redirect(target)

  const clientId = session?.user?.clientId ?? null
  const client = clientId
    ? await prisma.client.findFirst({
        where: { id: clientId, deletedAt: null },
        select: { name: true },
      })
    : null
  if (!client) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-gray-900">Gabify</p>
            <p className="truncate text-[11px] text-gray-400">{client.name}</p>
          </div>
          <div className="hidden sm:block">
            <PortalNav />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-4 sm:pb-8">{children}</main>
      <div className="sm:hidden">
        <PortalNav />
      </div>
    </div>
  )
}
