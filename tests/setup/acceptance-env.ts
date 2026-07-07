import { applyTestEnv } from './test-env'

// Runs before each acceptance test file is imported — guarantees the Prisma
// singleton and every service module see the TEST database URL, never the dev one.
applyTestEnv()
