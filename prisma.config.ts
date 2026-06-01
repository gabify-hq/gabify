import { defineConfig, env } from 'prisma/config'
import { config } from 'dotenv'

// Prisma CLI does not load .env.local — load it explicitly so DATABASE_URL is available
config({ path: '.env.local' })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
})
