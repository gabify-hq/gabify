import Link from 'next/link'
import { ChevronLeft, SlidersHorizontal } from 'lucide-react'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { can } from '@/server/authz/can'
import { BankRulesManager } from '@/components/dashboard/bank-rules-manager'

/**
 * /settings/bank-rules (fase C3) — bank rule management, OWNER/ACCOUNTANT
 * only (bankRule:manage via can()). VIEWER never sees this page.
 */
export default async function BankRulesPage() {
  const session = await auth()
  const officeId = session?.user?.officeId ?? ''

  if (!can(session?.user?.role, 'bankRule:manage')) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-[13px] text-gray-400">Sem permissões para gerir regras bancárias.</p>
      </div>
    )
  }

  const clients = await prisma.client.findMany({
    where: { officeId, deletedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-gray-200 bg-white px-5 py-3">
        <Link
          href="/bank"
          aria-label="Voltar ao banco"
          className="pressable rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <SlidersHorizontal className="h-4 w-4 stroke-[1.75] text-gray-400" />
        <h1 className="text-[13px] font-semibold text-gray-800">Regras bancárias</h1>
      </div>
      <div className="flex-1 overflow-y-auto bg-gray-50 px-5 py-5">
        <div className="mx-auto w-full max-w-4xl">
          <BankRulesManager clients={clients} />
        </div>
      </div>
    </div>
  )
}
