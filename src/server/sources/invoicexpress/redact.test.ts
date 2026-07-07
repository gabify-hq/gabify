import { describe, it, expect } from 'vitest'
import { redactApiKey, redactUrl } from './redact'

const API_KEY = 'sk-live-SUPER-SECRET-0123456789abcdef'

describe('redactUrl', () => {
  it('strips the api_key query parameter value from a URL', () => {
    const url = `https://demo.app.invoicexpress.com/invoices.json?api_key=${API_KEY}&page=2`
    const redacted = redactUrl(url)
    expect(redacted).not.toContain(API_KEY)
    expect(redacted).toContain('api_key=%5BREDACTED%5D')
    expect(redacted).toContain('page=2')
  })

  it('leaves URLs without api_key untouched', () => {
    const url = 'https://demo.app.invoicexpress.com/invoices.json?page=2'
    expect(redactUrl(url)).toBe(url)
  })

  it('redacts even when the URL is not parseable (defensive)', () => {
    const broken = `not a url api_key=${API_KEY} trailing`
    expect(redactUrl(broken)).not.toContain(API_KEY)
  })
})

describe('redactApiKey', () => {
  it('removes every occurrence of the key from arbitrary text', () => {
    const text = `request to ?api_key=${API_KEY} failed; retrying with ${API_KEY}`
    const redacted = redactApiKey(text, API_KEY)
    expect(redacted).not.toContain(API_KEY)
    expect(redacted).toContain('[REDACTED]')
  })

  it('is a no-op when the key is empty', () => {
    expect(redactApiKey('some text', '')).toBe('some text')
  })
})
