import { Users } from 'lucide-react'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NewClientDialog } from '@/components/dashboard/new-client-dialog'
import { EditClientDialog } from '@/components/dashboard/edit-client-dialog'
import { cn } from '@/lib/utils'

export default async function ClientsPage() {
  const session = await auth()
  const officeId = session?.user?.officeId ?? ''

  const clients = officeId
    ? await prisma.client.findMany({
        where: { officeId, deletedAt: null },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          nif: true,
          email: true,
          emailDomains: true,
          knownEmails: true,
          notes: true,
          createdAt: true,
          _count: { select: { inboundEmails: true } },
        },
      })
    : []

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Page header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Users className="h-4 w-4 stroke-[1.75] text-gray-400" />
          <h1 className="text-[14px] font-bold text-gray-900">Clientes</h1>
          <span className="data rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
            {clients.length}
          </span>
        </div>
        <NewClientDialog officeId={officeId} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-white">
        {clients.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Users className="mb-3 h-8 w-8 stroke-[1] text-gray-300" aria-hidden="true" />
            <p className="text-[13px] font-semibold text-gray-500">Nenhum cliente ainda.</p>
            <p className="mt-1 text-[12px] text-gray-400">
              Crie o primeiro cliente para começar a associar emails automaticamente.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Nome', 'NIF', 'Email', 'Domínios / Emails conhecidos', 'Emails', ''].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clients.map((client, index) => (
                  <tr
                    key={client.id}
                    className={cn(
                      'transition-colors duration-100 hover:bg-gray-50',
                      index < clients.length - 1 && 'border-b border-gray-100',
                    )}
                  >
                    {/* Name */}
                    <td className="px-5 py-3">
                      <span className="text-[13px] font-semibold text-gray-900">
                        {client.name}
                      </span>
                    </td>

                    {/* NIF */}
                    <td className="px-5 py-3">
                      <span className="data text-[12px] text-gray-500">
                        {client.nif ?? '—'}
                      </span>
                    </td>

                    {/* Email */}
                    <td className="px-5 py-3">
                      <span className="text-[12px] text-gray-600">
                        {client.email ?? '—'}
                      </span>
                    </td>

                    {/* Domains + known emails */}
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {client.emailDomains.map((d) => (
                          <span
                            key={d}
                            className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 ring-1 ring-blue-200"
                          >
                            @{d}
                          </span>
                        ))}
                        {client.knownEmails.map((e) => (
                          <span
                            key={e}
                            className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700 ring-1 ring-green-200"
                          >
                            {e}
                          </span>
                        ))}
                        {client.emailDomains.length === 0 && client.knownEmails.length === 0 && (
                          <span className="text-[11px] text-gray-400">Sem matching configurado</span>
                        )}
                      </div>
                    </td>

                    {/* Email count */}
                    <td className="px-5 py-3">
                      <span className="data text-[12px] text-gray-500">
                        {client._count.inboundEmails}
                      </span>
                    </td>

                    {/* Edit action */}
                    <td className="px-3 py-3">
                      <EditClientDialog client={client} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
