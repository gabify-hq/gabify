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
 * Attempts to extract a QR code from a PDF buffer.
 *
 * Strategy (in order):
 *  1. Search for AT QR string pattern directly in the PDF binary text streams.
 *     Many AT-certified POS systems write the QR code content as text/annotation
 *     data inside the PDF, even when the page is otherwise raster.
 *  2. Extract embedded JPEG image streams from the PDF binary and run jsQR on each.
 *     Scanned receipt PDFs typically embed the receipt photo as a raw JPEG.
 *
 * Never throws — returns null on any failure.
 */
export async function extractQRCodeFromPDF(pdfBuffer: Buffer): Promise<string | null> {
  // Strategy 1: search for AT QR string in PDF binary
  const inlineQR = searchATQRInPDFBinary(pdfBuffer)
  if (inlineQR) {
    console.log('[qr-reader] found AT QR string inline in PDF binary')
    return inlineQR
  }

  // Strategy 2: extract embedded JPEG streams and run jsQR
  const jpegs = extractJPEGsFromPDF(pdfBuffer)
  console.log(`[qr-reader] extracted ${jpegs.length} JPEG stream(s) from PDF`)

  for (const jpeg of jpegs) {
    const qr = await extractQRCodeFromImage(jpeg)
    if (qr) {
      console.log('[qr-reader] found QR code in embedded JPEG')
      return qr
    }
  }

  return null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Searches the PDF binary for an AT fiscal QR code string embedded as text.
 * AT QR strings follow the pattern: A:XXXXXXXXX*B:...*C:PT*D:...
 *
 * Some AT-certified POS software writes the QR code data as PDF text stream
 * content (e.g. in form fields, annotations, or as invisible text overlay).
 */
function searchATQRInPDFBinary(pdfBuffer: Buffer): string | null {
  // Convert to latin-1 — PDF uses latin-1 for text streams
  const text = pdfBuffer.toString('latin1')

  // AT QR pattern: A: + 9-digit NIF + * + fields up to O: (total) field
  // Full pattern can be 100-500 chars. Use a broad match then validate.
  const match = text.match(/A:\d{9}\*[A-Z0-9:.*]{20,600}O:\d+[.,]\d{2}[*A-Z0-9:.]*/)
  if (!match) return null

  // Normalise decimal separator (PDF may store comma as separator)
  const raw = match[0].replace(/,/g, '.')
  return raw
}

/**
 * Extracts embedded JPEG images from a PDF buffer by scanning for JPEG markers.
 *
 * JPEG streams inside PDFs use the DCT compression filter (/Filter /DCTDecode).
 * The raw JPEG data starts with FF D8 FF (SOI marker) and ends with FF D9 (EOI).
 * We scan the PDF binary for these markers to extract each JPEG.
 *
 * Returns up to MAX_IMAGES extracted JPEG buffers, largest-first (biggest images
 * are most likely to contain a readable QR code).
 */
function extractJPEGsFromPDF(pdfBuffer: Buffer): Buffer[] {
  const MAX_IMAGES = 5
  const MIN_JPEG_BYTES = 1_000   // ignore tiny thumbnails
  const MAX_JPEG_BYTES = 20_000_000 // 20 MB sanity cap

  const jpegs: { start: number; end: number }[] = []
  let i = 0

  while (i < pdfBuffer.length - 3) {
    // JPEG SOI: FF D8 FF
    if (pdfBuffer[i] === 0xFF && pdfBuffer[i + 1] === 0xD8 && pdfBuffer[i + 2] === 0xFF) {
      const start = i
      // Scan forward for JPEG EOI: FF D9
      let j = i + 2
      let found = false
      while (j < pdfBuffer.length - 1 && j - start < MAX_JPEG_BYTES) {
        if (pdfBuffer[j] === 0xFF && pdfBuffer[j + 1] === 0xD9) {
          const end = j + 2
          if (end - start >= MIN_JPEG_BYTES) {
            jpegs.push({ start, end })
          }
          i = end
          found = true
          break
        }
        j++
      }
      if (!found) i++
    } else {
      i++
    }
  }

  // Sort largest-first — bigger images = higher quality = better QR detection
  jpegs.sort((a, b) => (b.end - b.start) - (a.end - a.start))

  return jpegs
    .slice(0, MAX_IMAGES)
    .map(({ start, end }) => pdfBuffer.slice(start, end))
}
