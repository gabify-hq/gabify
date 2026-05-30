import { prisma } from '@/lib/prisma'
import type { ClientMatchResult } from '@/types'

/**
 * Matches an inbound email to a client based on:
 * 1. Exact match against Client.knownEmails (score: 1.0)
 * 2. Domain match against Client.emailDomains (score: 0.8)
 * 3. No match (score: 0.0)
 *
 * Always returns the highest-confidence match.
 */
export async function matchClientByEmail(
  officeId: string,
  fromEmail: string
): Promise<ClientMatchResult> {
  const emailLower = fromEmail.toLowerCase()
  const domain = emailLower.split('@')[1]

  if (!domain) {
    return { clientId: null, score: 0, matchedBy: 'none' }
  }

  // Load all clients for this office with matching data
  const clients = await prisma.client.findMany({
    where: { officeId, deletedAt: null },
    select: { id: true, emailDomains: true, knownEmails: true },
  })

  // 1. Exact email match (highest confidence)
  for (const client of clients) {
    const knownLower = client.knownEmails.map((e) => e.toLowerCase())
    if (knownLower.includes(emailLower)) {
      return { clientId: client.id, score: 1.0, matchedBy: 'known_email' }
    }
  }

  // 2. Domain match
  for (const client of clients) {
    const domainsLower = client.emailDomains.map((d) => d.toLowerCase())
    if (domainsLower.includes(domain)) {
      return { clientId: client.id, score: 0.8, matchedBy: 'domain' }
    }
  }

  return { clientId: null, score: 0, matchedBy: 'none' }
}

/**
 * Updates the clientId on an InboundEmail after matching.
 */
export async function assignClientToEmail(
  inboundEmailId: string,
  matchResult: ClientMatchResult
): Promise<void> {
  await prisma.inboundEmail.update({
    where: { id: inboundEmailId },
    data: {
      clientId: matchResult.clientId,
      clientMatchScore: matchResult.score,
    },
  })
}
