import { Users, CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import { ClientStatusCard } from '@/components/dashboard/client-status-card'
import { MOCK_CLIENTS } from '@/lib/mock-data'

export default function ClientsPage() {
  const complete = MOCK_CLIENTS.filter((c) => c.status === 'complete')
  const incomplete = MOCK_CLIENTS.filter((c) => c.status === 'incomplete')
  const missing = MOCK_CLIENTS.filter((c) => c.status === 'missing')

  const stats = [
    { label: 'Completos', count: complete.length, color: 'text-green-400', dot: 'bg-green-500' },
    { label: 'Incompletos', count: incomplete.length, color: 'text-amber-400', dot: 'bg-amber-400' },
    { label: 'Em falta', count: missing.length, color: 'text-red-400', dot: 'bg-red-500' },
  ]

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-gray-200 px-5 py-3">
        <Users className="h-4 w-4 stroke-[1.75] text-gray-400" />
        <h1 className="text-[13px] font-semibold text-gray-800">Clientes</h1>
        <span className="data rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-400">
          {MOCK_CLIENTS.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto max-w-3xl space-y-5">
          {/* Stats row */}
          <div className="flex items-center gap-5 border-b border-gray-200 pb-4">
            {stats.map((s) => (
              <div key={s.label} className="flex items-center gap-2">
                <span className={`data text-2xl font-bold ${s.color}`}>{s.count}</span>
                <span className="text-[11px] text-gray-400">{s.label}</span>
              </div>
            ))}
            <div className="ml-auto text-[11px] text-gray-400">Abril 2025</div>
          </div>

          {/* Missing */}
          {missing.length > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 stroke-[1.75] text-red-400" />
                <span className="section-label text-red-500">Em falta ({missing.length})</span>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {missing.map((c) => <ClientStatusCard key={c.id} client={c} />)}
              </div>
            </section>
          )}

          {/* Incomplete */}
          {incomplete.length > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 stroke-[1.75] text-amber-400" />
                <span className="section-label text-amber-500">Incompletos ({incomplete.length})</span>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {incomplete.map((c) => <ClientStatusCard key={c.id} client={c} />)}
              </div>
            </section>
          )}

          {/* Complete */}
          {complete.length > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 stroke-[1.75] text-green-400" />
                <span className="section-label text-green-600">Completos ({complete.length})</span>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {complete.map((c) => <ClientStatusCard key={c.id} client={c} />)}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
