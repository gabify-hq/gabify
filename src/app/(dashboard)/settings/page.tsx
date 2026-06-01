import { Settings, Mail, Unlink, Plus, CheckCircle2, AlertCircle } from 'lucide-react'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EmailProvider = 'OUTLOOK' | 'GMAIL' | 'IMAP'
type AccountStatus = 'active' | 'error' | 'disconnected'

interface MockEmailAccount {
  id: string
  email: string
  provider: EmailProvider
  status: AccountStatus
  lastSyncAt: Date
}

// ---------------------------------------------------------------------------
// Mock data — replace with real DB query later
// ---------------------------------------------------------------------------

const mockAccounts: MockEmailAccount[] = [
  {
    id: 'acc-001',
    email: 'aferreira@gabinete.pt',
    provider: 'OUTLOOK',
    status: 'active',
    lastSyncAt: new Date('2025-05-02T14:30:00'),
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  })
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('pt-PT', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Lisbon',
  })
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const providerBadgeStyles: Record<EmailProvider, string> = {
  OUTLOOK: 'bg-blue-50 text-blue-700 ring-blue-200',
  GMAIL:   'bg-red-50 text-red-600 ring-red-200',
  IMAP:    'bg-gray-100 text-gray-500 ring-gray-200',
}

const providerLabels: Record<EmailProvider, string> = {
  OUTLOOK: 'Outlook',
  GMAIL:   'Gmail',
  IMAP:    'IMAP',
}

function ProviderPill({ provider }: { provider: EmailProvider }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset',
        providerBadgeStyles[provider],
      )}
    >
      {providerLabels[provider]}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Connect-provider card data
// ---------------------------------------------------------------------------

interface ProviderCardDef {
  provider: EmailProvider
  name: string
  description: string
  initial: string
  initialBg: string
  connectHref: string | null
}

const providerCards: ProviderCardDef[] = [
  {
    provider: 'OUTLOOK',
    name: 'Microsoft Outlook',
    description: 'Sincronização via Microsoft Graph API. Recomendado para gabinetes portugueses.',
    initial: 'O',
    initialBg: 'bg-blue-50 text-blue-600',
    connectHref: '/api/auth/microsoft/initiate',
  },
  {
    provider: 'GMAIL',
    name: 'Gmail',
    description: 'Sincronização via Gmail API com Pub/Sub push notifications.',
    initial: 'G',
    initialBg: 'bg-red-50 text-red-600',
    connectHref: '/api/auth/google/initiate',
  },
  {
    provider: 'IMAP',
    name: 'IMAP',
    description: 'Compatível com qualquer servidor de email. Polling a cada 5 minutos.',
    initial: 'I',
    initialBg: 'bg-gray-100 text-gray-500',
    connectHref: null,
  },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface SettingsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = await searchParams
  const connected = params.connected
  const error = params.error

  const hasAccounts = mockAccounts.length > 0

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Page header */}
      <div className="flex items-center gap-2.5 border-b border-gray-200 bg-white px-5 py-3.5">
        <Settings className="h-4 w-4 stroke-[1.75] text-gray-400" />
        <h1 className="text-[14px] font-bold text-gray-900">Definições</h1>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50 px-5 py-5">
        <div className="mx-auto max-w-3xl space-y-8">

          {/* Connection status banners */}
          {connected === 'gmail' && (
            <div className="flex items-center gap-2.5 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
              <p className="text-[13px] font-semibold text-green-800">
                Conta Gmail ligada com sucesso.
              </p>
            </div>
          )}

          {error === 'gmail_auth_failed' && (
            <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <p className="text-[13px] font-semibold text-red-800">
                Não foi possível ligar a conta Gmail. Tente novamente.
              </p>
            </div>
          )}

          {error === 'gmail_auth_invalid_state' && (
            <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <p className="text-[13px] font-semibold text-red-800">
                Pedido de autenticação inválido. Tente novamente.
              </p>
            </div>
          )}

          {/* Section 1: Connected accounts */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 stroke-[1.75] text-gray-400" />
              <h2 className="section-label">Contas de email ligadas</h2>
            </div>

            {hasAccounts ? (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        Email
                      </th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        Fornecedor
                      </th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        Estado
                      </th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        Última sincronização
                      </th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockAccounts.map((account, index) => (
                      <tr
                        key={account.id}
                        className={cn(
                          'transition-colors duration-100 hover:bg-gray-50',
                          index < mockAccounts.length - 1 && 'border-b border-gray-100',
                        )}
                      >
                        <td className="px-4 py-3">
                          <span className="text-[13px] font-semibold text-gray-800">
                            {account.email}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <ProviderPill provider={account.provider} />
                        </td>
                        <td className="px-4 py-3">
                          {account.status === 'active' && (
                            <StatusBadge variant="approved" label="Ativo" />
                          )}
                          {account.status === 'error' && (
                            <StatusBadge variant="rejected" label="Erro" />
                          )}
                          {account.status === 'disconnected' && (
                            <StatusBadge variant="draft" label="Desligado" />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="data text-[12px] text-gray-500">
                            {formatDate(account.lastSyncAt)}{' '}
                            <span className="text-gray-400">às</span>{' '}
                            {formatTime(account.lastSyncAt)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            className="pressable inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-red-500 transition-colors duration-150 hover:bg-red-50 hover:text-red-600"
                            aria-label={`Desligar conta ${account.email}`}
                          >
                            <Unlink className="h-3 w-3 stroke-[1.75]" />
                            Desligar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Empty state */
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12">
                <Mail className="mb-3 h-8 w-8 stroke-[1] text-gray-300" />
                <p className="text-[13px] font-semibold text-gray-500">Nenhuma conta ligada</p>
                <p className="mt-1 text-[12px] text-gray-400">
                  Liga uma conta de email para começar a sincronizar mensagens.
                </p>
              </div>
            )}
          </section>

          {/* Section 2: Connect new account */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Plus className="h-3.5 w-3.5 stroke-[1.75] text-gray-400" />
              <h2 className="section-label">Ligar nova conta</h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {providerCards.map((card) => (
                <div
                  key={card.provider}
                  className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                  {/* Icon area */}
                  <div
                    className={cn(
                      'mb-4 flex h-9 w-9 items-center justify-center rounded-lg text-[15px] font-bold',
                      card.initialBg,
                    )}
                    aria-hidden="true"
                  >
                    {card.initial}
                  </div>

                  <p className="mb-1.5 text-[13px] font-bold text-gray-800">
                    {card.name}
                  </p>

                  <p className="mb-5 flex-1 text-[12px] leading-relaxed text-gray-500">
                    {card.description}
                  </p>

                  {card.connectHref ? (
                    <a
                      href={card.connectHref}
                      className="pressable inline-flex h-8 w-full items-center justify-center rounded-md bg-green-600 px-3 text-[12px] font-bold text-white transition-colors duration-150 hover:bg-green-700"
                    >
                      Ligar
                    </a>
                  ) : (
                    <Button
                      size="sm"
                      disabled
                      className="h-8 w-full border-0 bg-gray-100 text-[12px] font-bold text-gray-400 shadow-none"
                    >
                      Em breve
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
