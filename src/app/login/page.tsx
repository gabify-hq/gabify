'use client'

import { useState, useTransition } from 'react'
import { signIn } from 'next-auth/react'
import { Mail, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [touched, setTouched] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function validateEmail(value: string): string | null {
    if (!value.trim()) return 'Introduza o seu endereço de email.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'Email inválido.'
    return null
  }

  const inlineError = touched ? validateEmail(email) : null

  function handleBlur() {
    setTouched(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setTouched(true)
    const error = validateEmail(email)
    if (error) return

    setSubmitError(null)
    startTransition(async () => {
      const result = await signIn('resend', {
        email: email.trim().toLowerCase(),
        redirect: false,
        callbackUrl: '/inbox',
      })

      if (result?.error) {
        setSubmitError('Não foi possível enviar o link. Tente novamente.')
      } else {
        window.location.href = '/login/verify'
      }
    })
  }

  const displayError = submitError ?? inlineError

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4">
      <div className="w-full max-w-sm">

        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-green-600">
            <Mail className="h-5 w-5 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-[22px] font-bold leading-tight text-slate-900">Gabify</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            Introduza o seu email para aceder ao gabinete
          </p>
        </div>

        {/* Card */}
        <form onSubmit={handleSubmit} noValidate aria-label="Formulário de acesso">
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="p-5">
              <label
                htmlFor="email"
                className="mb-1.5 block text-[12px] font-semibold text-slate-700"
              >
                Email <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={handleBlur}
                placeholder="contabilista@gabinete.pt"
                disabled={isPending}
                aria-describedby={displayError ? 'email-error' : undefined}
                aria-invalid={!!displayError}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13px] text-slate-900 placeholder:text-gray-400 transition-colors duration-150 focus:border-green-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20 disabled:opacity-60 aria-[invalid=true]:border-red-400 aria-[invalid=true]:ring-red-100"
              />

              {displayError && (
                <p
                  id="email-error"
                  role="alert"
                  className="mt-1.5 text-[12px] text-red-600"
                >
                  {displayError}
                </p>
              )}
            </div>

            <div className="border-t border-gray-100 bg-gray-50 px-5 py-3">
              <button
                type="submit"
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
            </div>
          </div>
        </form>

        <p className="mt-5 text-center text-[11px] text-slate-400">
          Receberá um link por email válido durante 10 minutos.
          <br />
          Não partilhe o link com ninguém.
        </p>

      </div>
    </div>
  )
}
