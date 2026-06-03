import sharp from 'sharp'
import jsQR from 'jsqr'

/**
 * Attempts to extract a QR code string from an image buffer.
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
