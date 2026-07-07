'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, Loader2, RotateCw, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface InvitationDTO {
  id: string
  email: string
  role: 'OWNER' | 'ACCOUNTANT' | 'VIEWER'
  createdAt: string
  expiresAt: string
  state: 'pendente' | 'aceite' | 'expirado' | 'revogado'
}

const ROLE_LABELS: Record<InvitationDTO['role'], string> = {
  OWNER: 'Proprietário',
  ACCOUNTANT: 'Contabilista',
  VIEWER: 'Consulta',
}

const STATE_STYLES: Record<InvitationDTO['state'], string> = {
  pendente: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  aceite: 'bg-green-50 text-green-700 ring-1 ring-green-200',
  expirado: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
  revogado: 'bg-red-50 text-red-600 ring-1 ring-red-100',
}

/** Invitations management (S0.1/A2): create, revoke, resend. */
export function InvitationsManager({ invitations }: { invitations: InvitationDTO[] }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<InvitationDTO['role']>('ACCOUNTANT')
  const [busy, setBusy] = useState<string | null>(null) // 'create' | invitation id
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function callApi(
    key: string,
    url: string,
    init: RequestInit,
    successNotice: string
  ): Promise<void> {
    setBusy(key)
    setErrorMessage(null)
    setNotice(null)
    try {
      const res = await fetch(url, init)
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setErrorMessage(
          res.status === 409 && data?.code === 'EMAIL_ALREADY_REGISTERED'
            ? 'Este email já tem uma conta registada.'
            : res.status === 429
              ? 'Demasiados reenvios — tente mais tarde.'
              : data?.error ?? 'Ocorreu um erro. Tente novamente.'
        )
        return
      }
      setNotice(successNotice)
      router.refresh()
    } catch {
      setErrorMessage('Sem ligação ao servidor. Tente novamente.')
    } finally {
      setBusy(null)
    }
  }

  async function createInvitation(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!email.trim()) return
    await callApi(
      'create',
      '/api/invitations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      },
      `Convite enviado para ${email.trim()}.`
    )
    setEmail('')
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      {/* Create form */}
      <form
        onSubmit={createInvitation}
        className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:flex-row sm:items-end"
      >
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy === 'create'}
            placeholder="colega@gabinete.pt"
            className="h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-[13px] text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-1 focus:ring-green-400"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Permissões</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as InvitationDTO['role'])}
            disabled={busy === 'create'}
            className="h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-[13px] text-gray-800 focus:outline-none focus:ring-1 focus:ring-green-400"
          >
            <option value="ACCOUNTANT">Contabilista</option>
            <option value="VIEWER">Consulta</option>
            <option value="OWNER">Proprietário</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={busy === 'create'}
          className="pressable flex h-9 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-4 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50"
        >
          {busy === 'create' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5 stroke-[2]" />}
          Convidar
        </button>
      </form>

      {errorMessage && (
        <p role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-600">
          {errorMessage}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-[12px] text-green-700">
          {notice}
        </p>
      )}

      {/* List */}
      {invitations.length === 0 ? (
        <p className="py-12 text-center text-[13px] text-gray-400">
          Ainda não há convites. Convide o primeiro colega acima.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {invitations.map((inv) => (
            <li
              key={inv.id}
              className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-[13px] font-semibold text-gray-800">{inv.email}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', STATE_STYLES[inv.state])}>
                    {inv.state}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  {ROLE_LABELS[inv.role]} · enviado {inv.createdAt}
                  {inv.state === 'pendente' && <> · expira {inv.expiresAt}</>}
                </p>
              </div>

              {inv.state === 'pendente' && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() =>
                      callApi(inv.id, `/api/invitations/${inv.id}/resend`, { method: 'POST' }, `Convite reenviado para ${inv.email}.`)
                    }
                    disabled={busy !== null}
                    className="pressable flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 transition-colors hover:border-gray-300 disabled:opacity-50"
                  >
                    {busy === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3 stroke-[2]" />}
                    Reenviar
                  </button>
                  <button
                    onClick={() =>
                      callApi(`rev-${inv.id}`, `/api/invitations/${inv.id}`, { method: 'DELETE' }, `Convite para ${inv.email} revogado.`)
                    }
                    disabled={busy !== null}
                    className="pressable flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
                  >
                    {busy === `rev-${inv.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3 stroke-[2]" />}
                    Revogar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
