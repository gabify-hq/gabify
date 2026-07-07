import { describe, it, expect } from 'vitest'
import { extractQRCodeFromImage } from './qr-reader'

// Smoke tests (S1.7) — the heavy paths (pdfjs/canvas rendering) are exercised
// by the acceptance fixtures; here we assert the error-tolerant contract.
describe('qr-reader', () => {
  it('returns null for a buffer that is not an image', async () => {
    const result = await extractQRCodeFromImage(Buffer.from('not an image at all'))
    expect(result).toBeNull()
  })

  it('returns null for an empty buffer without throwing', async () => {
    const result = await extractQRCodeFromImage(Buffer.alloc(0))
    expect(result).toBeNull()
  })
})
