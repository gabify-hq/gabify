'use client'

import { useState, useTransition } from 'react'
import { signIn } from 'next-auth/react'
import { Loader2, MailCheck } from 'lucide-react'

interface RequestAccessButtonProps {
  /** Invitation email — the magic link is always sent to this address. */
  email: string
  /** Landing area after login, decided by the invitation role. */
  callbackUrl: string
}

/**
 * "Enviar link de acesso" for /accept-invite: triggers the standard magic-link
 * flow with the invitation email (never editable here — the invitation binds
 * the address). No passwords, ever.
 */
export function RequestAccessButton({ email, callbackUrl }: RequestAccessButtonProps) {
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await signIn('resend', { email, redirect: false, callbackUrl })
      if (result?.error) {
        setError('Não foi possível enviar o link. Tente novamente.')
      } else {
        setSent(true)
      }
    })
  }

  if (sent) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
        <p className="text-[13px] text-green-800">
          Enviámos um link de acesso para <span className="font-semibold">{email}</span>.
          Abra o email e clique no link para entrar. Verifique também a pasta de spam.
        </p>
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-green-600 px-4 text-[13px] font-bold text-white transition-colors duration-150 hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            <span>A enviar...</span>
          </>
        ) : (
          'Enviar link de acesso'
        )}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
