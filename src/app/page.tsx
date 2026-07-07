import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { homePathFor } from '@/lib/area-redirect'

export default async function RootPage() {
  const session = await auth()
  // Role-aware landing (fase P3): CLIENT → portal; internal roles → inbox
  redirect(homePathFor(session?.user?.role ?? null))
}
