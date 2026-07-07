/**
 * Fetch seam for the TOConline integration.
 *
 * Every outbound TOConline request resolves its fetch through here so tests
 * can substitute the doc-derived mock (this integration is doc-driven and has
 * NEVER been run against the real API — see INTEGRATION_NOTES.md). Production
 * code never calls setToconlineFetchForTests.
 */

let testFetch: typeof fetch | null = null

export function setToconlineFetchForTests(impl: typeof fetch | null): void {
  testFetch = impl
}

export function getToconlineFetch(): typeof fetch {
  return testFetch ?? fetch
}
