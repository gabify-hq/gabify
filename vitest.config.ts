import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: [
        'node_modules/**',
        'src/app/**',          // Next.js pages — e2e later
        'src/components/**',   // UI components — e2e later
        '**/*.d.ts',
        'vitest.config.ts',
        'prisma.config.ts',
        'next.config.ts',
      ],
      thresholds: {
        'src/server/services/**': { lines: 90 },
        'src/queues/**': { lines: 80 },
        'src/lib/**': { lines: 80 },
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
