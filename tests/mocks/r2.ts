import { vi } from 'vitest'

/**
 * In-memory R2 mock. Usage:
 *   vi.mock('@/lib/r2', async () => (await import('../mocks/r2')).r2MockFactory())
 */

export const r2Store = new Map<string, Buffer>()

export function r2MockFactory() {
  return {
    uploadToR2: vi.fn(async (key: string, body: Buffer) => {
      r2Store.set(key, body)
    }),
    downloadFromR2: vi.fn(async (key: string) => {
      const buf = r2Store.get(key)
      if (!buf) throw new Error(`r2 mock: no object at ${key}`)
      return buf
    }),
    deleteFromR2: vi.fn(async (key: string) => {
      r2Store.delete(key)
    }),
    getSignedDownloadUrl: vi.fn(async (key: string) => `https://signed.test/${key}`),
    buildAttachmentKey: (
      officeId: string,
      clientId: string | null,
      messageId: string,
      attachmentId: string,
      ext: string,
    ) => `${officeId}/${clientId ?? 'unmatched'}/${messageId}/${attachmentId}.${ext}`,
  }
}
