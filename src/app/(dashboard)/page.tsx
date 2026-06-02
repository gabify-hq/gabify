import Link from 'next/link'
import { Inbox, Users, Mail, FileText, UserX } from 'lucide-react'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface StatCardProps {
  label: string
  value: number
  icon: React.ReactNode
  accent: string
}

function StatCard({ label, value, icon, accent }: StatCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          {label}
        </span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${accent}`}>
          {icon}
        </span>
      </div>
      <p className="text-[28px] font-bold leading-none text-gray-900">{value}</p>
    </div>
  )
}

export default async function DashboardOverviewPage() {
  const session = await auth()
  const officeId = session?.user?.officeId ?? ''

  const [totalEmails, unreadEmails, pendingDrafts, totalClients, unknownSendersCount] = await Promise.all([
    officeId
      ? prisma.inboundEmail.count({ where: { emailAccount: { officeId } } })
      : Promise.resolve(0),
    officeId
      ? prisma.inboundEmail.count({ where: { emailAccount: { officeId }, status: 'UNREAD' } })
      : Promise.resolve(0),
    officeId
      ? prisma.emailAction.count({
          where: {
            inboundEmail: { emailAccount: { officeId } },
            status: 'PENDING_REVIEW',
          },
        })
      : Promise.resolve(0),
    officeId
      ? prisma.client.count({ where: { officeId, deletedAt: null } })
      : Promise.resolve(0),

    officeId
      ? prisma.inboundEmail.groupBy({
          by: ['fromEmail'],
          where: { emailAccount: { officeId }, clientId: null },
          _count: { id: true },
        }).then((rows) => rows.length)
      : Promise.resolve(0),
  ])

  const userName = session?.user?.name ?? session?.user?.email ?? null

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Page header */}
      <div className="flex items-center gap-2.5 border-b border-gray-200 bg-white px-5 py-3.5">
        <h1 className="text-[14px] font-bold text-gray-900">
          {userName ? `Bom dia, ${userName.split(' ')[0]}` : 'Início'}
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50 px-5 py-5">
        <div className="mx-auto max-w-4xl space-y-6">

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <StatCard
              label="Emails recebidos"
              value={totalEmails}
              icon={<Mail className="h-4 w-4 stroke-[1.75] text-gray-500" />}
              accent="bg-gray-100"
            />
            <StatCard
              label="Não lidos"
              value={unreadEmails}
              icon={<Inbox className="h-4 w-4 stroke-[1.75] text-blue-600" />}
              accent="bg-blue-50"
            />
            <StatCard
              label="Rascunhos pendentes"
              value={pendingDrafts}
              icon={<FileText className="h-4 w-4 stroke-[1.75] text-amber-600" />}
              accent="bg-amber-50"
            />
            <StatCard
              label="Total clientes"
              value={totalClients}
              icon={<Users className="h-4 w-4 stroke-[1.75] text-green-600" />}
              accent="bg-green-50"
            />
            <StatCard
              label="Por identificar"
              value={unknownSendersCount}
              icon={<UserX className="h-4 w-4 stroke-[1.75] text-amber-600" />}
              accent="bg-amber-50"
            />
          </div>

          {/* Quick actions */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-[12px] font-bold uppercase tracking-wider text-gray-400">
              Acesso rápido
            </h2>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/inbox"
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-[13px] font-semibold text-gray-700 transition-colors duration-150 hover:bg-gray-50 hover:text-gray-900"
              >
                <Inbox className="h-3.5 w-3.5 stroke-[1.75] text-gray-400" />
                Caixa de entrada
                {unreadEmails > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-100 px-1.5 text-[10px] font-bold text-blue-700">
                    {unreadEmails}
                  </span>
                )}
              </Link>
              <Link
                href="/clients"
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-[13px] font-semibold text-gray-700 transition-colors duration-150 hover:bg-gray-50 hover:text-gray-900"
              >
                <Users className="h-3.5 w-3.5 stroke-[1.75] text-gray-400" />
                Clientes
              </Link>
              {unknownSendersCount > 0 && (
                <Link
                  href="/inbox"
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] font-semibold text-amber-800 transition-colors duration-150 hover:bg-amber-100"
                >
                  <UserX className="h-3.5 w-3.5 stroke-[1.75] text-amber-600" />
                  Identificar remetentes
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-200 px-1.5 text-[10px] font-bold text-amber-800">
                    {unknownSendersCount}
                  </span>
                </Link>
              )}
            </div>
          </div>

          {/* Pending drafts notice */}
          {pendingDrafts > 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <span className="relative flex h-2 w-2 shrink-0 translate-y-1">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-amber-800">
                  {pendingDrafts} rascunho{pendingDrafts !== 1 ? 's' : ''} aguarda{pendingDrafts === 1 ? '' : 'm'} revisão
                </p>
                <p className="mt-0.5 text-[12px] text-amber-700">
                  A IA gerou {pendingDrafts === 1 ? 'uma resposta' : 'respostas'} que precisam da sua aprovação antes de serem enviadas.{' '}
                  <Link href="/inbox" className="font-semibold underline hover:text-amber-800">
                    Ver na caixa de entrada
                  </Link>
                </p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
