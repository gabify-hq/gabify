/**
 * Combined TOConline worker entry (`npm run worker:toconline`): hosts the
 * push queue, the pull queue and registers the repeatable pull scan
 * (TOCONLINE_PULL_INTERVAL_MS, default 30 min).
 *
 * NOT deployed to Railway yet — the integration is doc-driven and has never
 * been tested against the real API (INTEGRATION_NOTES.md).
 */
import './toconline-push.worker'
import { registerToconlinePullScan } from './toconline-pull.worker'

registerToconlinePullScan().catch((error) => {
  console.error('[toconline-pull] failed to register the repeatable scan:', error)
})
