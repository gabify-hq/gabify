import { describe, it, expect } from 'vitest'
import { isIsolatedRedisDb } from './test-env'

describe('isIsolatedRedisDb', () => {
  it('returns true for a non-default logical database', () => {
    expect(isIsolatedRedisDb('redis://localhost:6379/15')).toBe(true)
    expect(isIsolatedRedisDb('redis://localhost:6379/1')).toBe(true)
  })

  it('returns false for logical database 0 (shared dev keyspace)', () => {
    expect(isIsolatedRedisDb('redis://localhost:6379/0')).toBe(false)
  })

  it('returns false when no logical database is specified', () => {
    expect(isIsolatedRedisDb('redis://localhost:6379')).toBe(false)
    expect(isIsolatedRedisDb('redis://localhost:6379/')).toBe(false)
  })

  it('returns false for a non-numeric database path', () => {
    expect(isIsolatedRedisDb('redis://localhost:6379/queue')).toBe(false)
  })

  it('returns false for an unparseable URL', () => {
    expect(isIsolatedRedisDb('not-a-url')).toBe(false)
  })
})
