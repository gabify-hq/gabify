#!/usr/bin/env node
/**
 * Stop Hook — Gabify
 * Runs when Claude finishes a turn. Nudges developer on critical checklist items.
 */

const input = JSON.parse(process.argv[2] || '{}')
const { stop_reason, session_id } = input

// Only nudge on normal stop (not on error or compact)
if (stop_reason === 'end_turn') {
  const reminders = []

  // Check if any tool edits touched sensitive areas — nudge about AuditLog
  const editedFiles = input.tool_uses
    ?.filter(t => t.tool_name === 'Edit' || t.tool_name === 'Write')
    ?.map(t => t.tool_input?.file_path || '')
    || []

  const touchedServices = editedFiles.some(f =>
    f.includes('/services/') || f.includes('/queues/') || f.includes('/webhooks/')
  )
  const touchedProvider = editedFiles.some(f => f.includes('email-providers'))
  const touchedSchema = editedFiles.some(f => f.includes('schema.prisma'))

  if (touchedServices) {
    reminders.push('⚠️  Services modified — did you add AuditLog entries for AI actions?')
  }
  if (touchedProvider) {
    reminders.push('⚠️  Email provider modified — does it still satisfy the EmailProvider interface?')
  }
  if (touchedSchema) {
    reminders.push('⚠️  Schema modified — did you run `prisma generate` and create a migration?')
  }

  if (reminders.length > 0) {
    console.log('\n--- Gabify Checklist ---')
    reminders.forEach(r => console.log(r))
    console.log('------------------------\n')
  }
}
