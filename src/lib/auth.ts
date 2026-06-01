import NextAuth from 'next-auth'
import Resend from 'next-auth/providers/resend'
import { prisma } from '@/lib/prisma'
import { authConfig } from '@/lib/auth.config'
import { GabifyAdapter } from '@/lib/auth-adapter'
import type { UserRole } from '@prisma/client'

export const { handlers, auth, signIn, signOut } = NextAuth({
  pages: authConfig.pages,
  adapter: GabifyAdapter(prisma),
  session: { strategy: 'jwt' },
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.FROM_EMAIL ?? 'no-reply@gabify.pt',
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

