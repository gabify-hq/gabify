import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-cbc'
const IV_LENGTH = 16

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

/**
 * Encrypt a plain-text token using AES-256-CBC.
 * Returns a hex string: <iv>:<ciphertext>
 */
export function encryptToken(plain: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Decrypt an AES-256-CBC encrypted token.
 * Expects the format produced by encryptToken: <iv>:<ciphertext>
 */
export function decryptToken(encrypted: string): string {
  const key = getEncryptionKey()
  const separatorIndex = encrypted.indexOf(':')
  if (separatorIndex === -1) {
    throw new Error('Invalid encrypted token format: missing IV separator')
  }
  const iv = Buffer.from(encrypted.slice(0, separatorIndex), 'hex')
  const ciphertext = Buffer.from(encrypted.slice(separatorIndex + 1), 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString('utf8')
}
