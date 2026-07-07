import { prisma } from '../src/lib/prisma.js'
import { getSignedDownloadUrl } from '../src/lib/r2.js'
import { extractQRCodeFromImage } from '../src/lib/qr-reader.js'
import sharp from 'sharp'
import jsQR from 'jsqr'

function searchATQRInBinary(buf: Buffer): string | null {
  const text = buf.toString('latin1')
  const match = text.match(/A:\d{9}\*[^\r\n]{20,600}O:\d+[.,]\d{2}[^\r\n]*/)
  return match ? match[0] : null
}

function extractJPEGs(buf: Buffer): Buffer[] {
  const jpegs: { start: number; end: number }[] = []
  let i = 0
  while (i < buf.length - 3) {
    if (buf[i] === 0xFF && buf[i+1] === 0xD8 && buf[i+2] === 0xFF) {
      const start = i
      let j = i + 2
      while (j < buf.length - 1 && j - start < 20_000_000) {
        if (buf[j] === 0xFF && buf[j+1] === 0xD9) {
          if (j + 2 - start >= 1000) jpegs.push({ start, end: j + 2 })
          i = j + 2; break
        }
        j++
      }
      if (i !== j + 2) i++
    } else i++
  }
  jpegs.sort((a, b) => (b.end - b.start) - (a.end - a.start))
  return jpegs.slice(0, 5).map(({ start, end }) => buf.slice(start, end))
}

async function main() {
  const docs = await prisma.document.findMany({
    where: { classificationSource: { in: ['claude-pdf', 'claude-text'] } },
    select: {
      r2Key: true, classificationSource: true,
      attachment: { select: { filename: true } },
    },
    take: 4,
  })

  for (const doc of docs) {
    const filename = doc.attachment?.filename ?? '?'
    console.log('\n===', filename)

    const url = await getSignedDownloadUrl(doc.r2Key, 300)
    const res = await fetch(url)
    const buffer = Buffer.from(await res.arrayBuffer())

    // Strategy 1: binary text search
    const inlineQR = searchATQRInBinary(buffer)
    console.log('  [S1 binary]', inlineQR ? 'FOUND: ' + inlineQR.slice(0, 60) : 'null')

    // Strategy 2: JPEG extraction
    const jpegs = extractJPEGs(buffer)
    console.log('  [S2 jpegs]', jpegs.length, 'found, sizes:', jpegs.map(j => j.length).join(', '))

    for (let i = 0; i < jpegs.length; i++) {
      const qr = await extractQRCodeFromImage(jpegs[i])
      console.log(`    jpeg[${i}]: QR=`, qr ? qr.slice(0, 60) : 'null')
      if (!qr) {
        // show image dimensions to understand quality
        try {
          const meta = await sharp(jpegs[i]).metadata()
          console.log(`    jpeg[${i}]: ${meta.width}x${meta.height}`)
        } catch (e) {
          console.log(`    jpeg[${i}]: sharp error`)
        }
      }
    }
  }

  await prisma.$disconnect()
}

main().catch(console.error)
