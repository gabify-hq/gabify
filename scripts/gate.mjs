#!/usr/bin/env node
/**
 * Quality gate (SPEC_GABIFY_V2 rule 3). Runs, in order:
 *   1. tsc --noEmit        (0 errors)
 *   2. eslint src          (0 errors)
 *   3. vitest run          (0 failures)
 *   4. vitest run --coverage with COVERAGE_ENFORCE=1 (thresholds — rule 4)
 * Exits non-zero on the first failure.
 */
import { spawnSync } from 'child_process'

const steps = [
  { name: 'typecheck', cmd: 'npx', args: ['tsc', '--noEmit'] },
  { name: 'lint', cmd: 'npx', args: ['eslint', 'src'] },
  { name: 'tests', cmd: 'npx', args: ['vitest', 'run'] },
  {
    name: 'coverage',
    cmd: 'npx',
    args: ['vitest', 'run', '--coverage'],
    env: { COVERAGE_ENFORCE: '1' },
  },
]

for (const step of steps) {
  console.log(`\n[gate] ${step.name}...`)
  const result = spawnSync(step.cmd, step.args, {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...(step.env ?? {}) },
  })
  if (result.status !== 0) {
    console.error(`\n[gate] FAILED at step: ${step.name}`)
    process.exit(result.status ?? 1)
  }
}

console.log('\n[gate] all steps green')
