import { describe, it, expect } from 'vitest'
import { buildAttachmentKey } from './r2'

describe('buildAttachmentKey', () => {
  it('builds key with all segments', () => {
    const key = buildAttachmentKey('office-1', 'client-2', 'msg-3', 'att-4', 'pdf')
    expect(key).toBe('office-1/client-2/msg-3/att-4.pdf')
  })

  it('uses "unmatched" when clientId is null', () => {
    const key = buildAttachmentKey('office-1', null, 'msg-3', 'att-4', 'pdf')
    expect(key).toBe('office-1/unmatched/msg-3/att-4.pdf')
  })

  it('preserves extension as-is', () => {
    const key = buildAttachmentKey('o', 'c', 'm', 'a', 'docx')
    expect(key).toMatch(/\.docx$/)
  })
})
