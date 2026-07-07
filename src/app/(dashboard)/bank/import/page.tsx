import Link from 'next/link'
import { ChevronLeft, Upload } from 'lucide-react'
import { auth } from '@/lib/auth'
import { can } from '@/server/authz/can'
import { BankImportWizard } from '@/components/dashboard/bank-import-wizard'

/** /bank/import (fase C3) — bank statement import wizard (3 steps, human-confirmed mapping). */
export default async function BankImportPage() {
  const session = await auth()
  const canWrite = can(session?.user?.role, 'bank:import')

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
        <Upload className="h-4 w-4 stroke-[1.75] text-gray-400" />
        <h1 className="text-[13px] font-semibold text-gray-800">Importar extrato bancário</h1>
      </div>
      <div className="flex-1 overflow-y-auto bg-gray-50 px-5 py-5">
        <BankImportWizard canWrite={canWrite} />
      </div>
    </div>
  )
}
