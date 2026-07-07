import Link from 'next/link'
import { Landmark, Upload, SlidersHorizontal } from 'lucide-react'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { can } from '@/server/authz/can'
import { BankPageClient } from '@/components/dashboard/bank-page-client'

interface BankPageProps {
  searchParams: Promise<{ status?: string; accountId?: string }>
}

/**
 * /bank (fase C3) — accounts per client + reconciliation queue.
 * Data comes from the /api/bank endpoints on the client; this shell only
 * resolves the session role and the client options for account creation.
 */
export default async function BankPage({ searchParams }: BankPageProps) {
  const { status, accountId } = await searchParams
  const session = await auth()
  const officeId = session?.user?.officeId ?? ''
  const role = session?.user?.role

  const clients = officeId
    ? await prisma.client.findMany({
        where: { officeId, deletedAt: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      })
    : []

  const canManage = can(role, 'bank:manage')
  const canImport = can(role, 'bank:import')
  const canRules = can(role, 'bankRule:manage')

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white px-5 py-3">
        <div className="flex items-center gap-2.5">
          <Landmark className="h-4 w-4 stroke-[1.75] text-gray-400" />
          <h1 className="text-[13px] font-semibold text-gray-800">Banco</h1>
        </div>
        <div className="flex items-center gap-2">
          {canRules && (
            <Link
              href="/settings/bank-rules"
              className="pressable flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 transition-colors hover:border-gray-300"
            >
              <SlidersHorizontal className="h-3 w-3" />
              Regras
            </Link>
          )}
          {canImport && (
            <Link
              href="/bank/import"
              className="pressable flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm transition-colors hover:bg-green-700"
            >
              <Upload className="h-3 w-3 stroke-[2]" />
              Importar extrato
            </Link>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50 px-5 py-5">
        <BankPageClient
          clients={clients}
          canManage={canManage}
          initialStatus={status}
          initialAccountId={accountId}
        />
      </div>
    </div>
  )
}
