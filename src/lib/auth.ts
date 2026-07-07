import NextAuth from 'next-auth'
import Resend from 'next-auth/providers/resend'
import { prisma } from '@/lib/prisma'
import { authConfig } from '@/lib/auth.config'
import { GabifyAdapter } from '@/lib/auth-adapter'
import { enrichSession } from '@/lib/auth-session'
import type { UserRole } from '@prisma/client'
import type { User as PrismaUser } from '@prisma/client'

export const { handlers, auth, signIn, signOut } = NextAuth({
  pages: authConfig.pages,
  adapter: GabifyAdapter(prisma),
  // Database sessions (§1.2): revocable, role/officeId resolved per request.
  // 24h rolling expiration; logout deletes the Session row.
  session: { strategy: 'database', maxAge: 24 * 60 * 60, updateAge: 60 * 60 },
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.FROM_EMAIL ?? 'no-reply@gabify.pt',
      // Closed onboarding (S0.1/A2): the magic link is only actually sent when the
      // email belongs to an existing user or has a pending invitation. The HTTP
      // response is identical either way — an outsider cannot enumerate accounts.
      async sendVerificationRequest({ identifier, url, provider }) {
        const { canRequestMagicLink } = await import('@/server/services/invitation-service')
        if (!(await canRequestMagicLink(identifier))) {
          return // silent no-op — neutral response
        }
        const { resend, FROM_EMAIL } = await import('@/lib/resend')
        await resend.emails.send({
          from: (provider.from as string | undefined) ?? FROM_EMAIL,
          to: identifier,
          subject: 'Entrar no Gabify',
          text: `Bom dia,\n\nPara entrar no Gabify, abra o link seguinte:\n${url}\n\nSe não pediu este email, pode ignorá-lo.`,
        })
      },
    }),
  ],
  callbacks: {
    session({ session, user }) {
      // `user` is the fresh database row — role/office are never stale
      return enrichSession(
        session as unknown as { user?: Record<string, unknown>; expires: string },
        user as unknown as PrismaUser,
      )
    },
  },
})

// Extend next-auth types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      image?: string | null
      officeId: string | null
      role: UserRole
    }
  }
}

