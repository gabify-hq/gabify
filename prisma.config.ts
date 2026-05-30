// Prisma 7 configuration
// Database connection is handled via DATABASE_URL env var
// The adapter is instantiated in src/lib/prisma.ts for the client
// and referenced here for migrations

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { defineConfig } = require('prisma/config')

module.exports = defineConfig({
  schema: 'prisma/schema.prisma',
})
