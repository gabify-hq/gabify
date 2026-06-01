'use client'

import { useState, useTransition } from 'react'
import { signIn } from 'next-auth/react'
import { Mail, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim().toLowerCase()

    if (!trimmed) {
      setError('Introduza o seu endereço de email.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Email inválido.')
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await signIn('resend', {
        email: trimmed,
        redirect: false,
        callbackUrl: '/inbox',
      })

      if (result?.error) {
        setError('Não foi possível enviar o link. Tente novamente.')
      } else {
        // Redirect to verify page
        window.location.href = '/login/verify'
      }
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">

        {/* Logo / brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-green-600">
            <Mail className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-[22px] font-bold text-gray-900">Gabify</h1>
          <p className="mt-1 text-[13px] text-gray-500">
            Introduza o seu email para aceder ao gabinete
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="p-5">
              <label
                htmlFor="email"
                className="mb-1.5 block text-[12px] font-semibold text-gray-700"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contabilista@gabinete.pt"
                disabled={isPending}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-green-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20 disabled:opacity-60"
              />

              {error && (
                <p className="mt-2 text-[12px] text-red-600" role="alert">
                  {error}
                </p>
              )}
            </div>

            <div className="border-t border-gray-100 bg-gray-50 px-5 py-3">
              <button
                type="submit"
                disabled={isPending}
                className="pressable flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-60"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    A enviar...
                  </>
                ) : (
                  'Enviar link de acesso'
                )}
              </button>
            </div>
          </div>
        </form>

        <p className="mt-5 text-center text-[11px] text-gray-400">
          Receberá um link por email válido durante 10 minutos.
          <br />
          Não partilhe o link com ninguém.
        </p>

      </div>
    </div>
  )
}
