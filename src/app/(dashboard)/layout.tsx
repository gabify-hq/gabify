import type { ReactNode } from 'react'
import { DashboardProvider } from '@/lib/dashboard-store'
import { Sidebar } from '@/components/dashboard/sidebar'
import { MOCK_EMAILS, MOCK_EMAIL_ACTIONS } from '@/lib/mock-data'

const pendingCount = MOCK_EMAIL_ACTIONS.filter((a) => a.status === 'PENDING_REVIEW').length
const unreadCount = MOCK_EMAILS.filter((e) => e.status === 'UNREAD').length

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardProvider>
      <div className="flex h-screen overflow-hidden bg-neutral-50">
        <Sidebar unreadCount={unreadCount} pendingCount={pendingCount} />
        <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    </DashboardProvider>
  )
}
