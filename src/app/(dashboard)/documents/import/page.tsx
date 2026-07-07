import { FileSpreadsheet } from 'lucide-react'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ImportWizard } from '@/components/dashboard/import-wizard'

/** Spreadsheet import (S2.4): upload → confirm AI-proposed mapping → report. */
export default async function ImportPage() {
  const session = await auth()
  const officeId = session?.user?.officeId ?? ''

  const clients = officeId
    ? await prisma.client.findMany({
        where: { officeId, deletedAt: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      })
    : []

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-gray-200 px-5 py-3">
        <FileSpreadsheet className="h-4 w-4 stroke-[1.75] text-gray-400" />
        <h1 className="text-[13px] font-semibold text-gray-800">Importar folha de lançamentos</h1>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <ImportWizard clients={clients} canWrite={session?.user?.role !== 'VIEWER'} />
      </div>
    </div>
  )
}
