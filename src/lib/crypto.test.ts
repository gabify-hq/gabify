import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { encryptToken, decryptToken } from './crypto'

const VALID_KEY = 'a'.repeat(64) // 32 bytes as hex

describe('encryptToken', () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = VALID_KEY
  })

  afterEach(() => {
    delete process.env.TOKEN_ENCRYPTION_KEY
  })

  it('returns a non-empty string in iv:ciphertext format', () => {
    const result = encryptToken('my-secret-token')
    expect(result).toMatch(/^[0-9a-f]+:[0-9a-f]+$/)
  })

  it('produces different ciphertext each call due to random IV', () => {
    const first = encryptToken('same-value')
    const second = encryptToken('same-value')
    expect(first).not.toBe(second)
  })

  it('throws when TOKEN_ENCRYPTION_KEY is not set', () => {
    delete process.env.TOKEN_ENCRYPTION_KEY
    expect(() => encryptToken('token')).toThrow('TOKEN_ENCRYPTION_KEY environment variable is not set')
  })

  it('throws when TOKEN_ENCRYPTION_KEY is wrong length', () => {
    process.env.TOKEN_ENCRYPTION_KEY = 'abc'
    expect(() => encryptToken('token')).toThrow('TOKEN_ENCRYPTION_KEY must be 32 bytes')
  })
})

describe('decryptToken', () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = VALID_KEY
  })

  afterEach(() => {
    delete process.env.TOKEN_ENCRYPTION_KEY
  })

  it('round-trips a token correctly', () => {
    const plain = 'my-access-token-value'
    const encrypted = encryptToken(plain)
    const decrypted = decryptToken(encrypted)
    expect(decrypted).toBe(plain)
  })

  it('round-trips a token with special characters', () => {
    const plain = 'token/with+special=chars&more'
    expect(decryptToken(encryptToken(plain))).toBe(plain)
  })

  it('throws on malformed input with no separator', () => {
    expect(() => decryptToken('badinput')).toThrow('Invalid encrypted token format')
  })

  it('throws when TOKEN_ENCRYPTION_KEY is not set', () => {
    const encrypted = encryptToken('token')
    delete process.env.TOKEN_ENCRYPTION_KEY
    expect(() => decryptToken(encrypted)).toThrow('TOKEN_ENCRYPTION_KEY environment variable is not set')
  })
})
