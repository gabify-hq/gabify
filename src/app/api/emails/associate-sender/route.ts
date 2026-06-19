import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const associateSenderSchema = z.object({
  fromEmail: z.string().email('Email inválido'),
  clientId: z.string().min(1, 'Cliente obrigatório'),
})

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.officeId) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const officeId = session.user.officeId

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }

  const parsed = associateSenderSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  }

  const { fromEmail, clientId } = parsed.data
  const emailLower = fromEmail.toLowerCase()

  const client = await prisma.client.findFirst({
    where: { id: clientId, officeId, deletedAt: null },
    select: { id: true, knownEmails: true },
  })

  if (!client) {
    return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  }

  // Add to knownEmails only if not already present (case-insensitive check)
  const alreadyKnown = client.knownEmails.some(
    (e) => e.toLowerCase() === emailLower
  )

  if (!alreadyKnown) {
    await prisma.client.update({
      where: { id: clientId },
      data: { knownEmails: { push: emailLower } },
    })
  }

  // Retroactively match all unmatched emails from this sender in this office
  const { count: emailsMatched } = await prisma.inboundEmail.updateMany({
    where: {
      emailAccount: { officeId },
      fromEmail: { equals: emailLower, mode: 'insensitive' },
      clientId: null,
    },
    data: { clientId, clientMatchScore: 1.0 },
  })

  return NextResponse.json({ success: true, data: { emailsMatched } })
}
