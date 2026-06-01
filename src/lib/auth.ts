import NextAuth from 'next-auth'
import Resend from 'next-auth/providers/resend'
import { prisma } from '@/lib/prisma'
import { authConfig } from '@/lib/auth.config'
import { GabifyAdapter } from '@/lib/auth-adapter'
import type { UserRole } from '@prisma/client'

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Spread pages only — do NOT spread callbacks (authorized is middleware-only)
  pages: authConfig.pages,
  adapter: GabifyAdapter(prisma),
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.FROM_EMAIL ?? 'no-reply@gabify.pt',
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { officeId: true, role: true },
      })
      session.user.id = user.id
      session.user.officeId = dbUser?.officeId ?? null
      session.user.role = dbUser?.role ?? 'ACCOUNTANT'
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
