/**
 * Startup validation of security-critical environment variables (§1.3, rule 7).
 * Fail-closed: a missing security env var must crash the process at boot,
 * never degrade into "accept everything".
 */

const REQUIRED_SECURITY_ENVS = [
  'GRAPH_WEBHOOK_SECRET',
  'TOKEN_ENCRYPTION_KEY',
  'DATABASE_URL',
] as const

export function validateSecurityEnv(): void {
  const missing = REQUIRED_SECURITY_ENVS.filter((name) => !process.env[name])
  if (missing.length > 0) {
    throw new Error(
      `Security environment variables missing: ${missing.join(', ')}. ` +
        'Refusing to start — see .env.example.'
    )
  }
}
