import Link from 'next/link'
import { Settings, Mail, Unlink, Plus, CheckCircle2, AlertCircle } from 'lucide-react'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { EmailProvider } from '@prisma/client'

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
    description: 'SincronizaÃ§Ã£o via Microsoft Graph API. Recomendado para gabinetes portugueses.',
    initial: 'O',
    initialBg: 'bg-blue-50 text-blue-600',
    connectHref: '/api/auth/outlook/initiate',
  },
  {
    provider: 'GMAIL',
    name: 'Gmail',
    description: 'SincronizaÃ§Ã£o via Gmail API com Pub/Sub push notifications.',
    initial: 'G',
    initialBg: 'bg-red-50 text-red-600',
    connectHref: '/api/auth/google/initiate',
  },
  {
    provider: 'IMAP',
    name: 'IMAP',
    description: 'CompatÃ­vel com qualquer servidor de email. Polling a cada 5 minutos.',
    initial: 'I',
    initialBg: 'bg-gray-100 text-gray-500',
    connectHref: null,
  },
]

// ---------------------------------------------------------------------------
// Banner messages
// ---------------------------------------------------------------------------

const successMessages: Record<string, string> = {
  gmail:   'Conta Gmail ligada com sucesso.',
  outlook: 'Conta Outlook ligada com sucesso.',
}

const errorMessages: Record<string, string> = {
  gmail_auth_failed:         'NÃ£o foi possÃ­vel ligar a conta Gmail. Tente novamente.',
  gmail_auth_invalid_state:  'Pedido de autenticaÃ§Ã£o invÃ¡lido. Tente novamente.',
  outlook_auth_failed:       'NÃ£o foi possÃ­vel ligar a conta Outlook. Tente novamente.',
  outlook_auth_denied:       'AutorizaÃ§Ã£o recusada. Tente novamente.',
  outlook_auth_invalid_state:'Pedido de autenticaÃ§Ã£o invÃ¡lido. Tente novamente.',
  outlook_not_configured:    'Outlook nÃ£o configurado. Adicione MICROSOFT_CLIENT_ID ao servidor.',
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface SettingsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = await searchParams
  const connected = typeof params.connected === 'string' ? params.connected : null
  const error    = typeof params.error    === 'string' ? params.error    : null

  const session = await auth()
  const officeId = session?.user?.officeId ?? ''

  const accounts = officeId
    ? await prisma.emailAccount.findMany({
        where: { officeId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          email: true,
          provider: true,
          active: true,
          updatedAt: true,
        },
      })
    : []

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Page header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Settings className="h-4 w-4 stroke-[1.75] text-gray-400" />
          <h1 className="text-[14px] font-bold text-gray-900">DefiniÃ§Ãµes</h1>
        </div>
        <div className="flex items-center gap-2">
          {(session?.user?.role === 'OWNER' || session?.user?.role === 'ACCOUNTANT') && (
            <Link
              href="/settings/bank-rules"
              className="pressable rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 transition-colors hover:border-gray-300"
            >
              Regras bancÃ¡rias
            </Link>
          )}
          {session?.user?.role === 'OWNER' && (
            <Link
              href="/settings/invitations"
              className="pressable rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 transition-colors hover:border-gray-300"
            >
              Convites da equipa
            </Link>
          )}
          {session?.user?.role === 'OWNER' && (
            <Link
              href="/admin/jobs"
              className="pressable rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 transition-colors hover:border-gray-300"
            >
              Execuções de tarefas
            </Link>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50 px-5 py-5">
        <div className="mx-auto max-w-3xl space-y-8">

          {/* Status banners */}
          {connected && successMessages[connected] && (
            <div className="flex items-center gap-2.5 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
              <p className="text-[13px] font-semibold text-green-800">
                {successMessages[connected]}
              </p>
            </div>
          )}
          {error && errorMessages[error] && (
            <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
              <p className="text-[13px] font-semibold text-red-800">
                {errorMessages[error]}
              </p>
            </div>
          )}

          {/* Section 1: Connected accounts */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 stroke-[1.75] text-gray-400" />
              <h2 className="section-label">Contas de email ligadas</h2>
            </div>

            {accounts.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['Email', 'Fornecedor', 'Estado', 'Ãšltima actualizaÃ§Ã£o', 'AÃ§Ãµes'].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((account, index) => (
                      <tr
                        key={account.id}
                        className={cn(
                          'transition-colors duration-100 hover:bg-gray-50',
                          index < accounts.length - 1 && 'border-b border-gray-100',
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
                          <StatusBadge
                            variant={account.active ? 'approved' : 'draft'}
                            label={account.active ? 'Ativo' : 'Inativo'}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span className="data text-[12px] text-gray-500">
                            {formatDate(account.updatedAt)}{' '}
                            <span className="text-gray-400">Ã s</span>{' '}
                            {formatTime(account.updatedAt)}
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
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12">
                <Mail className="mb-3 h-8 w-8 stroke-[1] text-gray-300" />
                <p className="text-[13px] font-semibold text-gray-500">Nenhuma conta ligada</p>
                <p className="mt-1 text-[12px] text-gray-400">
                  Liga uma conta de email para comeÃ§ar a sincronizar mensagens.
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
                  <div
                    className={cn(
                      'mb-4 flex h-9 w-9 items-center justify-center rounded-lg text-[15px] font-bold',
                      card.initialBg,
                    )}
                    aria-hidden="true"
                  >
                    {card.initial}
                  </div>

                  <p className="mb-1.5 text-[13px] font-bold text-gray-800">{card.name}</p>
                  <p className="mb-5 flex-1 text-[12px] leading-relaxed text-gray-500">
                    {card.description}
                  </p>

                  {card.connectHref ? (
                    <a
                      href={card.connectHref}
                      className="pressable inline-flex h-9 w-full cursor-pointer items-center justify-center rounded-lg bg-green-600 px-3 text-[12px] font-bold text-white transition-colors duration-150 hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
                    >
                      Ligar
                    </a>
                  ) : (
                    <Button
                      size="sm"
                      disabled
                      className="h-9 w-full border-0 bg-gray-100 text-[12px] font-bold text-gray-400 shadow-none"
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
