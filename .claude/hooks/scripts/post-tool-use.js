#!/usr/bin/env node
/**
 * PostToolUse Hook — Gabify
 * Runs after every tool use. Currently handles:
 * - Auto-format after file edits (TypeScript/TSX files)
 */

const input = JSON.parse(process.argv[2] || '{}')
const { tool_name, tool_input } = input

// Auto-format TypeScript files after edits
if (tool_name === 'Edit' || tool_name === 'Write') {
  const filePath = tool_input?.file_path || ''
  if (filePath.match(/\.(ts|tsx)$/)) {
    const { execSync } = require('child_process')
    try {
      execSync(`npx prettier --write "${filePath}" 2>/dev/null`, {
        cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
        stdio: 'ignore'
      })
    } catch {
      // prettier not available or file not found — silently skip
    }
  }
}
