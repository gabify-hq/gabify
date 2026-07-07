/**
 * api_key redaction helpers.
 *
 * [INV CRITICAL] The InvoiceXpress API authenticates with `api_key` in the
 * QUERY STRING of every request (integrations/invoicexpress/docs/index.md,
 * Security section) — no documented header alternative exists. The key
 * therefore travels inside URLs, which leak into error messages and stack
 * traces of fetch failures. Every string that might contain a request URL MUST
 * pass through these helpers before being thrown, logged or stored.
 */

const REDACTED = '[REDACTED]'

/** Matches api_key=<value> in URLs or free text (value = anything up to a delimiter). */
const API_KEY_PARAM_PATTERN = /((?:^|[?&\s])api_key=)[^&\s"']+/gi

/**
 * Strips the api_key value from a URL (or any URL-ish string). Works even on
 * strings the URL parser rejects — the regex fallback covers free text.
 */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.searchParams.has('api_key')) {
      parsed.searchParams.set('api_key', REDACTED)
    }
    return parsed.toString()
  } catch {
    return url.replace(API_KEY_PARAM_PATTERN, `$1${REDACTED}`)
  }
}

/** Removes every literal occurrence of the key from arbitrary text. */
export function redactApiKey(text: string, apiKey: string): string {
  if (!apiKey) return text
  return text.split(apiKey).join(REDACTED).replace(API_KEY_PARAM_PATTERN, `$1${REDACTED}`)
}
