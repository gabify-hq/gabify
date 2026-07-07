/**
 * InvoiceXpress worker entry (`npm run worker:invoicexpress`): hosts the
 * invoicexpress-pull queue and registers the repeatable pull scan
 * (INVOICEXPRESS_PULL_INTERVAL_MS, default 30 min).
 *
 * NOT deployed to Railway yet — the connector is doc-driven and has never been
 * tested against the real InvoiceXpress API (INTEGRATION_NOTES_IVX.md).
 */
import { registerInvoicexpressPullScan } from './invoicexpress-pull.worker'

registerInvoicexpressPullScan().catch((error) => {
  console.error('[invoicexpress-pull] failed to register the repeatable scan:', error)
})
