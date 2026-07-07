import Link from 'next/link'
import { UserPlus, ShieldAlert } from 'lucide-react'
import { auth } from '@/lib/auth'
import { can } from '@/server/authz/can'
import { prisma } from '@/lib/prisma'
import { InvitationsManager, type InvitationDTO } from '@/components/dashboard/invitations-manager'

function invitationState(inv: {
  acceptedAt: Date | null
  revokedAt: Date | null
  expiresAt: Date
}): InvitationDTO['state'] {
  if (inv.acceptedAt) return 'aceite'
  if (inv.revokedAt) return 'revogado'
  if (inv.expiresAt.getTime() < Date.now()) return 'expirado'
  return 'pendente'
}

/** Team invitations (S0.1/A2) — OWNER only (`invitation:manage`). */
export default async function InvitationsPage() {
  const session = await auth()
  const officeId = session?.user?.officeId ?? ''

  if (!officeId || !can(session!.user.role, 'invitation:manage')) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
        <ShieldAlert className="h-8 w-8 stroke-[1] text-gray-300" />
        <p className="text-[13px] font-semibold text-gray-500">
          Apenas o proprietário do gabinete gere convites.
        </p>
        <Link href="/settings" className="text-[12px] font-medium text-green-600 hover:underline">
          Voltar às definições
        </Link>
      </div>
    )
  }

  const invitations = await prisma.invitation.findMany({
    where: { officeId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  })

  const items: InvitationDTO[] = invitations.map((inv) => ({
    id: inv.id,
    email: inv.email,
    role: inv.role,
    createdAt: inv.createdAt.toLocaleDateString('pt-PT'),
    expiresAt: inv.expiresAt.toLocaleDateString('pt-PT'),
    state: invitationState(inv),
  }))

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-gray-200 px-5 py-3">
        <UserPlus className="h-4 w-4 stroke-[1.75] text-gray-400" />
        <h1 className="text-[13px] font-semibold text-gray-800">Convites da equipa</h1>
        <span className="data rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-400">
          {items.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <InvitationsManager invitations={items} />
      </div>
    </div>
  )
}
