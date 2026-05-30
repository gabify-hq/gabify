import { describe, it, expect } from 'vitest'
import {
  MOCK_CLIENTS,
  MOCK_EMAILS,
  MOCK_EMAIL_ACTIONS,
  MOCK_DOCUMENTS,
  getClientById,
  getEmailById,
  getActionByEmailId,
  getDocumentsByClientId,
  getPendingActions,
  formatRelativeTime,
  formatDate,
  DOCUMENT_TYPE_LABELS,
} from './mock-data'

describe('mock data integrity', () => {
  it('all email actions reference existing emails', () => {
    const emailIds = new Set(MOCK_EMAILS.map((e) => e.id))
    for (const action of MOCK_EMAIL_ACTIONS) {
      expect(emailIds.has(action.emailId), `action ${action.id} references missing email ${action.emailId}`).toBe(true)
    }
  })

  it('all emails with hasAction reference existing actions', () => {
    const actionEmailIds = new Set(MOCK_EMAIL_ACTIONS.map((a) => a.emailId))
    for (const email of MOCK_EMAILS.filter((e) => e.hasAction)) {
      expect(actionEmailIds.has(email.id), `email ${email.id} has hasAction=true but no action`).toBe(true)
    }
  })

  it('all documents reference existing clients', () => {
    const clientIds = new Set(MOCK_CLIENTS.map((c) => c.id))
    for (const doc of MOCK_DOCUMENTS) {
      if (doc.clientId) {
        expect(clientIds.has(doc.clientId), `doc ${doc.id} references missing client ${doc.clientId}`).toBe(true)
      }
    }
  })

  it('all clients have valid completion percentages', () => {
    for (const client of MOCK_CLIENTS) {
      expect(client.completionPct).toBeGreaterThanOrEqual(0)
      expect(client.completionPct).toBeLessThanOrEqual(100)
    }
  })

  it('complete clients have no missing documents', () => {
    for (const client of MOCK_CLIENTS.filter((c) => c.status === 'complete')) {
      expect(client.missingDocuments).toHaveLength(0)
      expect(client.completionPct).toBe(100)
    }
  })

  it('missing clients have missing documents', () => {
    for (const client of MOCK_CLIENTS.filter((c) => c.status === 'missing')) {
      expect(client.missingDocuments.length).toBeGreaterThan(0)
    }
  })

  it('all document types have labels', () => {
    for (const doc of MOCK_DOCUMENTS) {
      expect(DOCUMENT_TYPE_LABELS[doc.type]).toBeDefined()
    }
  })
})

describe('getClientById', () => {
  it('returns client when found', () => {
    const client = getClientById('client-001')
    expect(client).toBeDefined()
    expect(client?.name).toBe('Construtora Alves & Filhos, Lda')
  })

  it('returns undefined for unknown id', () => {
    expect(getClientById('unknown')).toBeUndefined()
  })
})

describe('getEmailById', () => {
  it('returns email when found', () => {
    const email = getEmailById('email-001')
    expect(email).toBeDefined()
    expect(email?.clientId).toBe('client-002')
  })

  it('returns undefined for unknown id', () => {
    expect(getEmailById('unknown')).toBeUndefined()
  })
})

describe('getActionByEmailId', () => {
  it('returns action for email with pending draft', () => {
    const action = getActionByEmailId('email-001')
    expect(action).toBeDefined()
    expect(action?.status).toBe('PENDING_REVIEW')
  })

  it('returns undefined for email with no action', () => {
    expect(getActionByEmailId('email-005')).toBeUndefined()
  })
})

describe('getDocumentsByClientId', () => {
  it('returns documents for a client', () => {
    const docs = getDocumentsByClientId('client-002')
    expect(docs.length).toBeGreaterThan(0)
    expect(docs.every((d) => d.clientId === 'client-002')).toBe(true)
  })

  it('returns empty array for client with no documents', () => {
    expect(getDocumentsByClientId('client-999')).toHaveLength(0)
  })
})

describe('getPendingActions', () => {
  it('returns only PENDING_REVIEW actions', () => {
    const pending = getPendingActions()
    expect(pending.length).toBeGreaterThan(0)
    expect(pending.every((a) => a.status === 'PENDING_REVIEW')).toBe(true)
  })
})

describe('formatDate', () => {
  it('formats date in DD/MM/YYYY', () => {
    const result = formatDate(new Date('2025-04-30T12:00:00'))
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/)
  })
})
