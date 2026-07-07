import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/sidebar'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveAreaRedirect } from '@/lib/area-redirect'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth()

  // Fase P3 — role barrier: a portal user (CLIENT) never renders the office
  // dashboard (the portal layout is the mirror barrier)
  const target = resolveAreaRedirect(session?.user?.role ?? null, 'dashboard')
  if (target) redirect(target)

  const officeId = session?.user?.officeId ?? ''

  const [unreadCount, pendingCount] = await Promise.all([
    officeId
      ? prisma.inboundEmail.count({
          where: { emailAccount: { officeId }, status: 'UNREAD' },
        })
      : Promise.resolve(0),
    officeId
      ? prisma.emailAction.count({
          where: {
            inboundEmail: { emailAccount: { officeId } },
            status: 'PENDING_REVIEW',
          },
        })
      : Promise.resolve(0),
  ])

  return (
    <>
      {/* Skip link for keyboard/screen-reader users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-green-600 focus:px-4 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-white focus:outline-none"
      >
        Saltar para o conteúdo principal
      </a>
      <div className="flex h-screen overflow-hidden bg-white">
        <Sidebar
          unreadCount={unreadCount}
          pendingCount={pendingCount}
          user={session?.user}
        />
        <main id="main-content" className="flex flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    </>
  )
}
