import sharp from 'sharp'
import jsQR from 'jsqr'

/**
 * Attempts to extract a QR code string from an image buffer (JPEG, PNG, etc.).
 * Uses sharp to convert to raw RGBA pixel data, then jsQR to decode.
 *
 * Returns the decoded QR string, or null if no QR code found.
 * Never throws — failures are silently absorbed so callers can fall back.
 */
export async function extractQRCodeFromImage(imageBuffer: Buffer): Promise<string | null> {
  try {
    const { data, info } = await sharp(imageBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const code = jsQR(new Uint8ClampedArray(data), info.width, info.height)
    return code?.data ?? null
  } catch {
    return null
  }
}

/**
 * Attempts to extract a QR code string from a PDF buffer.
 * Renders the first page using pdfjs-dist + canvas, then runs jsQR on the pixel data.
 *
 * Covers scanned PDFs that have an embedded AT fiscal QR code image.
 * Returns null if rendering fails or no QR code is found.
 * Never throws.
 */
export async function extractQRCodeFromPDF(pdfBuffer: Buffer): Promise<string | null> {
  try {
    // Dynamic import to avoid loading heavy PDF lib unless needed
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const { createCanvas } = await import('canvas')

    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) })
    const pdf = await loadingTask.promise
    const page = await pdf.getPage(1)

    // Render at 2x scale for better QR readability
    const SCALE = 2.0
    const viewport = page.getViewport({ scale: SCALE })
    const canvas = createCanvas(viewport.width, viewport.height)
    const ctx = canvas.getContext('2d')

    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
      canvas: canvas as unknown as HTMLCanvasElement,
    }).promise

    const imageData = ctx.getImageData(0, 0, viewport.width, viewport.height)
    const code = jsQR(
      new Uint8ClampedArray(imageData.data),
      imageData.width,
      imageData.height
    )
    return code?.data ?? null
  } catch {
    return null
  }
}
