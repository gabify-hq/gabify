/**
 * Moloni worker entry (`npm run worker:moloni`): hosts the moloni-pull queue
 * and registers the repeatable pull scan (MOLONI_PULL_INTERVAL_MS, default
 * 30 min).
 *
 * NOT deployed to Railway yet — the connector is doc-driven and has never been
 * tested against the real Moloni API (INTEGRATION_NOTES_MOLONI.md).
 */
import { registerMoloniPullScan } from './moloni-pull.worker'

registerMoloniPullScan().catch((error) => {
  console.error('[moloni-pull] failed to register the repeatable scan:', error)
})
