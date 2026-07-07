'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send, UserX, XCircle, KeyRound } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * "Acessos do portal" tab on the client page (fase P3) — invite an end-client
 * user, see access states, revoke invitations and active accesses.
 * OWNER + ACCOUNTANT (`clientInvitation:manage`); the page hides it otherwise.
 */

export interface PortalUserDTO {
  id: string
  email: string
  name: string | null
  since: string // DD/MM/YYYY
}

export interface PortalInvitationDTO {
  id: string
  email: string
  state: 'pendente' | 'aceite' | 'expirado' | 'revogado'
  expiresAt: string // DD/MM/YYYY
}

interface PortalAccessManagerProps {
  clientId: string
  users: PortalUserDTO[]
  invitations: PortalInvitationDTO[]
}

const STATE_STYLES: Record<PortalInvitationDTO['state'], string> = {
  pendente: 'bg-amber-50 text-amber-600',
  aceite: 'bg-green-50 text-green-700',
  expirado: 'bg-gray-100 text-gray-400',
  revogado: 'bg-red-50 text-red-500',
}

export function PortalAccessManager({ clientId, users, invitations }: PortalAccessManagerProps) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function invite(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (!email.trim() || isSubmitting) return
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role: 'CLIENT', clientId }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body?.error ?? 'Não foi possível enviar o convite')
        return
      }
      setEmail('')
      router.refresh()
    } catch {
      setError('Sem ligação ao servidor')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function revokeInvitation(id: string): Promise<void> {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/invitations/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error ?? 'Não foi possível revogar o convite')
        return
      }
      router.refresh()
    } catch {
      setError('Sem ligação ao servidor')
    } finally {
      setBusyId(null)
    }
  }

  async function revokeAccess(userId: string): Promise<void> {
    setBusyId(userId)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/portal-access/${userId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error ?? 'Não foi possível revogar o acesso')
        return
      }
      router.refresh()
    } catch {
      setError('Sem ligação ao servidor')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 stroke-[1.75] text-gray-400" />
        <h2 className="text-[13px] font-semibold text-gray-800">Acessos do portal</h2>
      </div>
      <p className="text-[11px] text-gray-400">
        O cliente entra num portal próprio onde apenas carrega documentos e vê o estado dos seus.
      </p>

      <form onSubmit={invite} className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isSubmitting}
          placeholder="email@empresa.pt"
          aria-label="Email do acesso a convidar"
          className="h-8 min-w-0 flex-1 rounded-lg border border-gray-200 px-2.5 text-[12px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-green-400 disabled:bg-gray-50"
        />
        <button
          type="submit"
          disabled={isSubmitting || !email.trim()}
          className="pressable flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-[12px] font-bold text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50"
        >
          {isSubmitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5 stroke-[2]" />
          )}
          Convidar
        </button>
      </form>

      {error && (
        <p role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-[12px] text-red-600">
          {error}
        </p>
      )}

      {users.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {users.map((user) => (
            <li key={user.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium text-gray-700">{user.email}</p>
                <p className="text-[11px] text-gray-400">acesso ativo desde {user.since}</p>
              </div>
              <button
                type="button"
                onClick={() => revokeAccess(user.id)}
                disabled={busyId === user.id}
                aria-label={`Revogar acesso de ${user.email}`}
                className="pressable flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-500 transition-colors hover:border-red-200 hover:text-red-500 disabled:opacity-50"
              >
                {busyId === user.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <UserX className="h-3 w-3 stroke-[2]" />
                )}
                Revogar
              </button>
            </li>
          ))}
        </ul>
      )}

      {invitations.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {invitations.map((inv) => (
            <li key={inv.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium text-gray-700">{inv.email}</p>
                <p className="text-[11px] text-gray-400">expira a {inv.expiresAt}</p>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  STATE_STYLES[inv.state],
                )}
              >
                {inv.state}
              </span>
              {inv.state === 'pendente' && (
                <button
                  type="button"
                  onClick={() => revokeInvitation(inv.id)}
                  disabled={busyId === inv.id}
                  aria-label={`Revogar convite de ${inv.email}`}
                  className="pressable flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-500 transition-colors hover:border-red-200 hover:text-red-500 disabled:opacity-50"
                >
                  {busyId === inv.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <XCircle className="h-3 w-3 stroke-[2]" />
                  )}
                  Revogar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {users.length === 0 && invitations.length === 0 && (
        <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-center text-[12px] text-gray-400">
          Este cliente ainda não tem acessos ao portal.
        </p>
      )}
    </div>
  )
}
