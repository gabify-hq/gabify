import { type NextRequest, NextResponse } from 'next/server'
import { handlers } from '@/lib/auth'
import { checkMagicLinkRateLimit } from '@/server/rate-limit'

export const GET = handlers.GET

/**
 * Magic-link requests are rate limited per target email + IP (A11: 5/hour)
 * BEFORE NextAuth processes them. Other auth POSTs pass through untouched.
 */
export async function POST(request: NextRequest) {
  if (request.nextUrl.pathname.includes('/signin/resend')) {
    const form = await request.clone().formData().catch(() => null)
    const email = form?.get('email')
    if (typeof email === 'string' && email.length > 0) {
      const ip =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
      const rate = checkMagicLinkRateLimit(email, ip)
      if (!rate.allowed) {
        return NextResponse.json(
          { error: 'Demasiados pedidos — tente mais tarde' },
          { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
        )
      }
    }
  }
  return handlers.POST(request)
}
