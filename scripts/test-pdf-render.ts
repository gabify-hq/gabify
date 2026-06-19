import { prisma } from '../src/lib/prisma.js'
import { getSignedDownloadUrl } from '../src/lib/r2.js'
import { DOMMatrix } from 'canvas'
import jsQR from 'jsqr'
import sharp from 'sharp'
import { MessageChannel } from 'worker_threads'

// pdfjs-dist v6 browser globals + polyfills
;(globalThis as any).DOMMatrix = DOMMatrix
if (!(Promise as any).try) {
  ;(Promise as any).try = <T>(fn: (...a: any[]) => T | Promise<T>, ...args: any[]): Promise<T> =>
    new Promise<T>((res, rej) => { try { res(fn(...args)) } catch (e) { rej(e) } })
}

async function setupPdfjs() {
  const pdfjs = await import('pdfjs-dist/build/pdf.mjs')
  const worker = await import('pdfjs-dist/build/pdf.worker.mjs')

  // Run worker in same thread via MessageChannel (avoids tsx Worker thread issues)
  const { port1, port2 } = new MessageChannel()
  const { WorkerMessageHandler } = worker as any
  WorkerMessageHandler.initializeFromPort(port1)
  pdfjs.GlobalWorkerOptions.workerPort = port2 as any

  return pdfjs
}

async function renderPdfPage(pdfjs: any, pdfBuffer: Buffer, scale = 3.0): Promise<Buffer> {
  // Make a clean copy so the ArrayBuffer isn't shared with the Node.js Buffer pool
  const copy = pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength)
  const data = new Uint8Array(copy)

  const pdf = await pdfjs.getDocument({ data }).promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale })

  const { createCanvas } = await import('canvas')
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D

  await page.render({ canvasContext: ctx, viewport }).promise
  await pdf.destroy()

  return canvas.toBuffer('image/png')
}

async function main() {
  const pdfjs = await setupPdfjs()
  console.log('pdfjs ready')

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
    if (filename.endsWith('.zip')) continue
    console.log('\n===', filename)

    const url = await getSignedDownloadUrl(doc.r2Key, 300)
    const res = await fetch(url)
    const pdfBuffer = Buffer.from(await res.arrayBuffer())

    try {
      const imgBuffer = await renderPdfPage(pdfjs, pdfBuffer, 3.0)
      const { data, info } = await sharp(imgBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      console.log('  rendered:', info.width, 'x', info.height)

      const code = jsQR(new Uint8ClampedArray(data), info.width, info.height)
      console.log('  QR:', code ? '✓ ' + code.data.slice(0, 80) : 'null')
    } catch (e: any) {
      console.log('  ERROR:', e.message?.slice(0, 120))
    }
  }

  await prisma.$disconnect()
  process.exit(0)
}

main().catch(console.error)
