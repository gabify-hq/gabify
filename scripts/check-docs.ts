import { prisma } from '../src/lib/prisma.js'

async function main() {
  const docs = await prisma.document.findMany({
    select: {
      classificationSource: true,
      confidence: true,
      status: true,
      attachment: { select: { filename: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  for (const d of docs) {
    const name = (d.attachment?.filename ?? 'unknown').padEnd(35)
    const src = (d.classificationSource ?? 'null').padEnd(20)
    console.log(name, '|', src, '|', d.status, '|', d.confidence)
  }
  await prisma.$disconnect()
}

main().catch(console.error)
