import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

/**
 * Token encryption at rest (A12).
 *
 * Current format (v2): AES-256-GCM — authenticated encryption.
 *   `v2:<iv-hex>:<authTag-hex>:<ciphertext-hex>`
 *
 * Legacy format: AES-256-CBC — `<iv-hex>:<ciphertext-hex>`. Still readable;
 * tokens are lazily re-encrypted as GCM on the next refresh (any write path
 * goes through encryptToken, which always emits v2).
 */

const GCM_ALGORITHM = 'aes-256-gcm'
const CBC_ALGORITHM = 'aes-256-cbc'
const IV_LENGTH = 16
const GCM_PREFIX = 'v2'

function getEncryptionKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY
  if (!key) {
    throw new Error('TOKEN_ENCRYPTION_KEY environment variable is not set')
  }
  const keyBuffer = Buffer.from(key, 'hex')
  if (keyBuffer.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex characters)')
  }
  return keyBuffer
}

/** Encrypt a plain-text token using AES-256-GCM (v2 format). */
export function encryptToken(plain: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(GCM_ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${GCM_PREFIX}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

/** Decrypt a token in either v2 (GCM) or legacy CBC format. */
export function decryptToken(encrypted: string): string {
  const key = getEncryptionKey()

  if (encrypted.startsWith(`${GCM_PREFIX}:`)) {
    const parts = encrypted.split(':')
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted token format: malformed v2 payload')
    }
    const [, ivHex, tagHex, dataHex] = parts
    const decipher = createDecipheriv(GCM_ALGORITHM, key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ])
    return decrypted.toString('utf8')
  }

  // Legacy AES-256-CBC: <iv-hex>:<ciphertext-hex>
  const separatorIndex = encrypted.indexOf(':')
  if (separatorIndex === -1) {
    throw new Error('Invalid encrypted token format: missing IV separator')
  }
  const iv = Buffer.from(encrypted.slice(0, separatorIndex), 'hex')
  const ciphertext = Buffer.from(encrypted.slice(separatorIndex + 1), 'hex')
  const decipher = createDecipheriv(CBC_ALGORITHM, key, iv)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString('utf8')
}
