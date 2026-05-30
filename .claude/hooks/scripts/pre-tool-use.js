#!/usr/bin/env node
/**
 * PreToolUse Hook — Gabify
 * Runs before tool execution. Blocks dangerous database commands outside dev.
 */

const input = JSON.parse(process.argv[2] || '{}')
const { tool_name, tool_input } = input

if (tool_name === 'Bash') {
  const cmd = tool_input?.command || ''

  // Block prisma db push — always use migrations
  if (cmd.includes('prisma db push')) {
    console.error('❌ BLOCKED: `prisma db push` is not allowed in Gabify.')
    console.error('   Use `npx prisma migrate dev --name <description>` instead.')
    process.exit(1)
  }

  // Warn on prisma migrate deploy without confirmation
  if (cmd.includes('prisma migrate deploy') && !cmd.includes('--preview-feature')) {
    console.error('⚠️  WARNING: `prisma migrate deploy` applies migrations to the target database.')
    console.error('   Ensure you are targeting the correct environment.')
    // Don't block — just warn
  }
}
