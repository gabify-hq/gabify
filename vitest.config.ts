import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Coverage thresholds are enforced from the end of Fase 1 onwards (SPEC_GABIFY_V2 rule 4).
// Set COVERAGE_ENFORCE=1 to fail the run when thresholds are not met.
const enforceThresholds = process.env.COVERAGE_ENFORCE === '1'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov', 'json'],
      include: [
        'src/server/**',
        'src/queues/**',
        'src/lib/**',
        'src/app/api/**',
      ],
      exclude: [
        '**/*.test.*',
        '**/*.d.ts',
        // BullMQ wiring shells — connect to Redis at import; the processing
        // logic lives in *.processor.ts, which is fully covered.
        'src/queues/*.worker.ts',
      ],
      ...(enforceThresholds
        ? {
            thresholds: {
              'src/queues/**': { lines: 80 },
              'src/app/api/**': { lines: 70 },
              'src/server/**': { lines: 75 },
            },
          }
        : {}),
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: ['node_modules/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'acceptance',
          include: ['tests/**/*.test.ts'],
          exclude: ['node_modules/**'],
          globalSetup: ['tests/setup/global-setup.ts'],
          setupFiles: ['tests/setup/acceptance-env.ts'],
          // Acceptance tests share one real PostgreSQL database — never run files in parallel
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
