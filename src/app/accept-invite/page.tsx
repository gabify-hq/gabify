import Link from 'next/link'
import { UserPlus, AlertTriangle } from 'lucide-react'
import { inspectInvitationToken } from '@/server/services/invitation-service'
import { homePathFor } from '@/lib/area-redirect'
import { RequestAccessButton } from './request-access-button'

interface AcceptInvitePageProps {
  searchParams: Promise<{ token?: string }>
}

/**
 * /accept-invite — landing page for invitation emails (audit F1.1 / C-1).
 *
 * Valid token → shows the office + invited email and triggers the standard
 * magic-link flow (the adapter turns the pending invitation into the account
 * on the email callback). Every non-valid state gets a pt-PT explanation with
 * a clear way out — never a generic 404.
 */
export default async function AcceptInvitePage({ searchParams }: AcceptInvitePageProps) {
  const { token } = await searchParams
  const inspection = await inspectInvitationToken(token ?? '')

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-green-600">
            <UserPlus className="h-5 w-5 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-[22px] font-bold leading-tight text-slate-900">Gabify</h1>
          <p className="mt-1 text-[13px] text-slate-500">Convite de acesso</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          {inspection.state === 'valid' && (
            <div className="space-y-4">
              <p className="text-[13px] leading-relaxed text-slate-700">
                Foi convidado(a) para aceder ao Gabify de{' '}
                <span className="font-semibold">{inspection.officeName}</span> com o email{' '}
                <span className="font-semibold">{inspection.invitation.email}</span>.
              </p>
              <p className="text-[12px] text-slate-500">
                Não precisa de palavra-passe: enviamos-lhe um link de acesso para esse email.
              </p>
              <RequestAccessButton
                email={inspection.invitation.email}
                callbackUrl={homePathFor(inspection.invitation.role)}
              />
            </div>
          )}

          {inspection.state === 'expired' && (
            <ErrorState
              title="Este convite expirou"
              body={`Os convites são válidos durante 72 horas. Peça um novo convite ao responsável de ${inspection.officeName} — o email convidado era ${inspection.invitation.email}.`}
            />
          )}

          {inspection.state === 'revoked' && (
            <ErrorState
              title="Este convite foi anulado"
              body={`O convite para ${inspection.invitation.email} foi revogado pelo gabinete. Se acha que foi engano, peça um novo convite ao responsável de ${inspection.officeName}.`}
            />
          )}

          {inspection.state === 'accepted' && (
            <ErrorState
              title="Este convite já foi aceite"
              body={`Este convite já foi utilizado para criar a conta de ${inspection.invitation.email}. Basta entrar com esse email — não precisa de novo convite.`}
              actionLabel="Ir para o início de sessão"
            />
          )}

          {inspection.state === 'invalid' && (
            <ErrorState
              title="Convite inválido ou em falta"
              body="Este link de convite não é reconhecido. Confirme que abriu o link completo que recebeu por email; se o problema continuar, peça um novo convite a quem o convidou."
            />
          )}
        </div>

        <p className="mt-5 text-center text-[11px] text-slate-400">
          Já tem conta?{' '}
          <Link href="/login" className="font-semibold text-green-700 hover:underline">
            Entrar com o seu email
          </Link>
        </p>
      </div>
    </div>
  )
}

function ErrorState({
  title,
  body,
  actionLabel = 'Ir para o início de sessão',
}: {
  title: string
  body: string
  actionLabel?: string
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
        <div>
          <h2 className="text-[14px] font-bold text-slate-900">{title}</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{body}</p>
        </div>
      </div>
      <Link
        href="/login"
        className="flex h-11 w-full items-center justify-center rounded-lg border border-gray-200 bg-gray-50 px-4 text-[13px] font-semibold text-slate-700 transition-colors duration-150 hover:bg-gray-100"
      >
        {actionLabel}
      </Link>
    </div>
  )
}
