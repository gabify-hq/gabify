import type { ReactNode } from 'react'
import { DashboardProvider } from '@/lib/dashboard-store'
import { Sidebar } from '@/components/dashboard/sidebar'
import { MOCK_EMAILS, MOCK_EMAIL_ACTIONS } from '@/lib/mock-data'

const pendingCount = MOCK_EMAIL_ACTIONS.filter((a) => a.status === 'PENDING_REVIEW').length
const unreadCount = MOCK_EMAILS.filter((e) => e.status === 'UNREAD').length

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardProvider>
      {/* Skip link for keyboard/screen-reader users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-green-600 focus:px-4 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-white focus:outline-none"
      >
        Saltar para o conteúdo principal
      </a>
      <div className="flex h-screen overflow-hidden bg-white">
        <Sidebar unreadCount={unreadCount} pendingCount={pendingCount} />
        <main id="main-content" className="flex flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    </DashboardProvider>
  )
}
