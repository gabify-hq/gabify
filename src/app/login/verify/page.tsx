import { Mail } from 'lucide-react'
import Link from 'next/link'

export default function VerifyPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm text-center">

        {/* Icon */}
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-green-50 ring-8 ring-green-50/50">
          <Mail className="h-6 w-6 text-green-600" />
        </div>

        <h1 className="text-[20px] font-bold text-gray-900">
          Verifique o seu email
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-gray-500">
          Enviámos um link de acesso para o seu endereço de email.
          <br />
          Clique no link para entrar no Gabify.
        </p>

        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-[12px] text-amber-700">
            O link é válido durante <strong>10 minutos</strong>.
            Verifique também a pasta de spam.
          </p>
        </div>

        <p className="mt-6 text-[12px] text-gray-400">
          Não recebeu o email?{' '}
          <Link
            href="/login"
            className="font-semibold text-green-600 hover:text-green-700"
          >
            Tentar novamente
          </Link>
        </p>

      </div>
    </div>
  )
}
