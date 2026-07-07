import { prisma } from '../src/lib/prisma.js'
import { Queue } from 'bullmq'
import { redisConnection, QUEUE_DOCUMENT_PARSE } from '../src/lib/redis.js'

async function main() {
const attachments = await prisma.emailAttachment.findMany({
  where: { document: { classificationSource: { in: ['claude-pdf', 'claude-text'] } } },
  select: {
    id: true,
    filename: true,
    document: { select: { classificationSource: true } },
    inboundEmail: {
      select: {
        emailAccountId: true,
        emailAccount: { select: { officeId: true } },
      },
    },
  },
})

console.log('Found:', attachments.length, 'attachments to re-classify')

const q = new Queue(QUEUE_DOCUMENT_PARSE, { connection: redisConnection })

for (const a of attachments) {
  await prisma.document.updateMany({
    where: { attachmentId: a.id },
    data: {
      status: 'PENDING_CLASSIFICATION',
      classificationSource: null,
      confidence: null,
    },
  })
  await q.add('reclassify', {
    attachmentId: a.id,
    emailAccountId: a.inboundEmail.emailAccountId,
    officeId: a.inboundEmail.emailAccount.officeId,
  })
  console.log('queued:', a.filename, '|', a.document?.classificationSource)
}

  console.log('Done.')
  await q.close()
  await prisma.$disconnect()
}

main().catch(console.error)
