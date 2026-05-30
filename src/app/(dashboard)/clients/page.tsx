import { Users, CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import { ClientStatusCard } from '@/components/dashboard/client-status-card'
import { MOCK_CLIENTS } from '@/lib/mock-data'

export default function ClientsPage() {
  const complete = MOCK_CLIENTS.filter((c) => c.status === 'complete')
  const incomplete = MOCK_CLIENTS.filter((c) => c.status === 'incomplete')
  const missing = MOCK_CLIENTS.filter((c) => c.status === 'missing')

  const stats = [
    { label: 'Completos', count: complete.length, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Incompletos', count: incomplete.length, icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { label: 'Em falta', count: missing.length, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
  ]

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-neutral-200 px-6 py-3.5">
        <Users className="h-4 w-4 text-neutral-500" />
        <h1 className="text-[15px] font-semibold text-neutral-900">Clientes</h1>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[12px] font-medium text-neutral-600">
          {MOCK_CLIENTS.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-5">
          {/* Stats */}
          <div className="mb-5 grid grid-cols-3 gap-3">
            {stats.map((s) => (
              <div
                key={s.label}
                className={`flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3.5`}
              >
                <div className={`flex h-8 w-8 items-center justify-center rounded-md ${s.bg}`}>
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
                <div>
                  <p className="text-[22px] font-semibold leading-none text-neutral-900">{s.count}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Period label */}
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-medium text-neutral-700">Estado da documentação — Abril 2025</h2>
          </div>

          {/* Client cards */}
          {missing.length > 0 && (
            <section className="mb-5">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-red-600">
                <AlertCircle className="h-3.5 w-3.5" />
                Em falta ({missing.length})
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {missing.map((c) => <ClientStatusCard key={c.id} client={c} />)}
              </div>
            </section>
          )}

          {incomplete.length > 0 && (
            <section className="mb-5">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-yellow-600">
                <Clock className="h-3.5 w-3.5" />
                Incompletos ({incomplete.length})
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {incomplete.map((c) => <ClientStatusCard key={c.id} client={c} />)}
              </div>
            </section>
          )}

          {complete.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-green-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Completos ({complete.length})
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {complete.map((c) => <ClientStatusCard key={c.id} client={c} />)}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
