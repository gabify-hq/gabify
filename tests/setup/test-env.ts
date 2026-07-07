import { isAbsolute, join, relative } from 'path'

/**
 * Shared test environment constants.
 *
 * The acceptance suite runs against a dedicated PostgreSQL database
 * (`gabify_test` by default) — never against the development database.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://gabify:gabify@localhost:5432/gabify_test'

/**
 * The acceptance suite must never share a Redis logical database with dev:
 * BullMQ workers started by the tests would consume stale dev jobs whose
 * officeIds do not exist in the test database (FK violations, flaky runs).
 * Logical db 15 keeps the same local instance but a fully isolated keyspace.
 */
export const TEST_REDIS_URL =
  process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15'

/**
 * True when the URL points at a non-default Redis logical database (db > 0).
 * Flushing is only allowed on isolated databases — db 0 is where dev queues
 * live and must never be wiped by the test suite.
 */
export function isIsolatedRedisDb(redisUrl: string): boolean {
  let url: URL
  try {
    url = new URL(redisUrl)
  } catch {
    return false
  }
  const db = Number(url.pathname.replace(/^\//, ''))
  return Number.isInteger(db) && db > 0
}

export interface PrismaClientDriftInput {
  /** Root of the current worktree/repo (where `prisma/schema.prisma` lives). */
  projectRoot: string
  /** Real directory of the resolved `.prisma/client`, or null when unresolvable. */
  resolvedClientDir: string | null
  /** Contents of the local `prisma/schema.prisma`, or null when missing. */
  localSchema: string | null
  /** Contents of the `schema.prisma` embedded in the resolved client, or null when missing. */
  generatedSchema: string | null
}

export type PrismaClientDriftResult = { ok: true } | { ok: false; message: string }

/**
 * `prisma generate` reformats the schema (alignment, block attribute order),
 * so byte equality is meaningless. Comparing the sorted multiset of
 * whitespace-normalised, non-empty lines is format-insensitive while still
 * catching any real content drift (missing models, fields, indexes).
 */
function normalizeSchemaLines(schema: string): string {
  return schema
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => line !== '')
    .sort()
    .join('\n')
}

const REGENERATE_HINT = 'corre `npx prisma generate` neste diretório'

/**
 * Guards against a stale or foreign Prisma Client. Worktrees live INSIDE the
 * main repo, so when `node_modules/.prisma/client` is missing locally, Node
 * silently resolves the client generated in an ANCESTOR directory — from a
 * different branch's schema (symptom: "The column `X` does not exist in the
 * current database", dozens of phantom failures). Same spirit as
 * `isIsolatedRedisDb`: fail fast, before any test runs.
 */
export function checkPrismaClientDrift(
  input: PrismaClientDriftInput
): PrismaClientDriftResult {
  const { projectRoot, resolvedClientDir, localSchema, generatedSchema } = input

  if (localSchema === null) {
    return {
      ok: false,
      message: `Prisma Client guard: schema local não encontrado em ${join(projectRoot, 'prisma', 'schema.prisma')}.`,
    }
  }
  if (resolvedClientDir === null) {
    return {
      ok: false,
      message: `Prisma Client guard: nenhum Prisma Client gerado foi resolvido — ${REGENERATE_HINT} (${projectRoot}).`,
    }
  }

  const localNodeModules = join(projectRoot, 'node_modules')
  const rel = relative(localNodeModules, resolvedClientDir)
  const isInsideLocalNodeModules =
    rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
  if (!isInsideLocalNodeModules) {
    return {
      ok: false,
      message:
        `Prisma Client guard: o client resolvido vem de FORA deste diretório — provavelmente do node_modules de um diretório ancestral, gerado com o schema de outro branch.\n` +
        `  schema local:    ${join(projectRoot, 'prisma', 'schema.prisma')}\n` +
        `  client resolvido: ${resolvedClientDir}\n` +
        `Correção: ${REGENERATE_HINT} (${projectRoot}).`,
    }
  }

  if (generatedSchema === null) {
    return {
      ok: false,
      message: `Prisma Client guard: o client resolvido em ${resolvedClientDir} não contém schema.prisma — ${REGENERATE_HINT} (${projectRoot}).`,
    }
  }
  if (normalizeSchemaLines(localSchema) !== normalizeSchemaLines(generatedSchema)) {
    return {
      ok: false,
      message:
        `Prisma Client guard: o Prisma Client gerado está desatualizado face ao schema local.\n` +
        `  schema local:    ${join(projectRoot, 'prisma', 'schema.prisma')}\n` +
        `  client resolvido: ${resolvedClientDir}\n` +
        `Correção: ${REGENERATE_HINT} (${projectRoot}).`,
    }
  }

  return { ok: true }
}

/** Applied before any application module is imported (see acceptance-env.ts). */
export function applyTestEnv(): void {
  process.env.DATABASE_URL = TEST_DATABASE_URL
  process.env.REDIS_URL = TEST_REDIS_URL
  ;(process.env as Record<string, string>).NODE_ENV = 'test'
  process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? 'test-auth-secret'
  process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  process.env.TOKEN_ENCRYPTION_KEY =
    process.env.TOKEN_ENCRYPTION_KEY ?? '0'.repeat(64)
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY ?? 're_test_key'
  process.env.FROM_EMAIL = process.env.FROM_EMAIL ?? 'no-reply@test.gabify.pt'
  process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? 'sk-ant-test'
  process.env.GRAPH_WEBHOOK_SECRET = process.env.GRAPH_WEBHOOK_SECRET ?? 'test-graph-secret'
  process.env.MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID ?? 'test-ms-client-id'
  process.env.MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET ?? 'test-ms-client-secret'
  process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? 'test-google-client-id'
  process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? 'test-google-client-secret'
  process.env.GMAIL_PUBSUB_TOPIC = process.env.GMAIL_PUBSUB_TOPIC ?? 'projects/test/topics/gabify'
  process.env.R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? 'test-account'
  process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? 'test-key'
  process.env.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? 'test-secret'
  process.env.R2_BUCKET_NAME = process.env.R2_BUCKET_NAME ?? 'gabify-test'
}
