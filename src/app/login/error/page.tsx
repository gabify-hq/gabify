import Link from 'next/link'
import { AlertCircle } from 'lucide-react'

const errorMessages: Record<string, string> = {
  Configuration: 'Erro de configuração do servidor. Contacte o suporte.',
  AccessDenied: 'Acesso negado. Não tem permissão para entrar.',
  Verification: 'O link de acesso expirou ou já foi utilizado. Solicite um novo.',
  Default: 'Ocorreu um erro ao iniciar sessão. Tente novamente.',
}

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const message = errorMessages[error ?? 'Default'] ?? errorMessages['Default']

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4">
      <div className="w-full max-w-sm text-center">

        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 ring-8 ring-red-50/50">
          <AlertCircle className="h-6 w-6 text-red-500" aria-hidden="true" />
        </div>

        <h1 className="text-[20px] font-bold text-slate-900">Erro de autenticação</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{message}</p>

        <Link
          href="/login"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-green-600 px-6 text-[13px] font-bold text-white transition-colors duration-150 hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
        >
          Voltar ao login
        </Link>

      </div>
    </div>
  )
}
