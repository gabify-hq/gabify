/**
 * Maps a Moloni documents/getOne response to the provider-neutral
 * SourceDocument DTO. All floats are converted to cents here, at the
 * boundary (see money.ts); sums are integer-only.
 */
import type { SourceDocument } from '../types'
import type { MoloniDocumentDetail } from './schemas'

export function mapMoloniDocument(detail: MoloniDocumentDetail): SourceDocument {
  void detail
  throw new Error('Not implemented (RED)')
}
