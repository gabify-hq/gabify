import { prisma } from '../src/lib/prisma.js'
import { getSignedDownloadUrl } from '../src/lib/r2.js'
import { extractQRCodeFromPDF, extractQRCodeFromImage } from '../src/lib/qr-reader.js'

async function main() {
  const docs = await prisma.document.findMany({
    where: { classificationSource: { in: ['claude-pdf', 'claude-text'] } },
    select: {
      r2Key: true,
      classificationSource: true,
      attachment: { select: { filename: true, mimeType: true } },
    },
    take: 6,
  })

  for (const doc of docs) {
    const filename = doc.attachment?.filename ?? 'unknown'
    console.log('\n---', filename, '|', doc.classificationSource)

    const url = await getSignedDownloadUrl(doc.r2Key, 300)
    const res = await fetch(url)
    const buffer = Buffer.from(await res.arrayBuffer())
    console.log('  size:', buffer.length, 'bytes')

    const qr = await extractQRCodeFromPDF(buffer)
    console.log('  QR result:', qr ? qr.slice(0, 80) + '...' : 'null')
  }

  await prisma.$disconnect()
}

main().catch(console.error)
