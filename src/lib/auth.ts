import NextAuth from 'next-auth'
import Resend from 'next-auth/providers/resend'
import { prisma } from '@/lib/prisma'
import { authConfig } from '@/lib/auth.config'
import { GabifyAdapter } from '@/lib/auth-adapter'
import type { UserRole } from '@prisma/client'

export const { handlers, auth, signIn, signOut } = NextAuth({
  pages: authConfig.pages,
  adapter: GabifyAdapter(prisma),
  session: { strategy: 'jwt', maxAge: 24 * 60 * 60 }, // 24h
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
    async jwt({ token, user }) {
      // `user` is only present on first sign-in — enrich token with DB fields
      if (user?.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { officeId: true, role: true },
        })
        token.id = user.id
        token.officeId = dbUser?.officeId ?? null
        token.role = dbUser?.role ?? 'ACCOUNTANT'
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.id as string
      session.user.officeId = (token.officeId as string | null) ?? null
      session.user.role = (token.role as UserRole) ?? 'ACCOUNTANT'
      return session
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

