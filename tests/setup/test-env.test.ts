import { join } from 'path'
import { describe, it, expect } from 'vitest'
import { checkPrismaClientDrift, isIsolatedRedisDb } from './test-env'

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

describe('checkPrismaClientDrift', () => {
  const projectRoot = join('C:', 'repo', 'worktree')
  const localClientDir = join(projectRoot, 'node_modules', '.prisma', 'client')
  const schema = 'model User {\n  id String @id\n}\n'

  it('passes when the client is local and matches the schema', () => {
    const result = checkPrismaClientDrift({
      projectRoot,
      resolvedClientDir: localClientDir,
      localSchema: schema,
      generatedSchema: schema,
    })
    expect(result).toEqual({ ok: true })
  })

  it('passes when schemas differ only in formatting (alignment, EOL, block attribute order)', () => {
    const result = checkPrismaClientDrift({
      projectRoot,
      resolvedClientDir: localClientDir,
      localSchema:
        'model Doc {\r\n  id    String @id\r\n\r\n  @@index([id])\r\n  @@unique([id])\r\n}\r\n',
      generatedSchema:
        'model Doc {\n  id String @id\n\n  @@unique([id])\n  @@index([id])\n}\n',
    })
    expect(result).toEqual({ ok: true })
  })

  it('aborts when the client resolves from an ancestor directory, naming both paths', () => {
    const ancestorClientDir = join('C:', 'repo', 'node_modules', '.prisma', 'client')
    const result = checkPrismaClientDrift({
      projectRoot,
      resolvedClientDir: ancestorClientDir,
      localSchema: schema,
      generatedSchema: schema,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain(ancestorClientDir)
    expect(result.message).toContain(join(projectRoot, 'prisma', 'schema.prisma'))
    expect(result.message).toContain('npx prisma generate')
  })

  it('aborts when the generated schema content differs from the local one', () => {
    const result = checkPrismaClientDrift({
      projectRoot,
      resolvedClientDir: localClientDir,
      localSchema: schema,
      generatedSchema: 'model User {\n  id String @id\n  clientId String?\n}\n',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('npx prisma generate')
  })

  it('aborts when no generated client can be resolved at all', () => {
    const result = checkPrismaClientDrift({
      projectRoot,
      resolvedClientDir: null,
      localSchema: schema,
      generatedSchema: null,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('npx prisma generate')
  })
})
