import { type NextRequest, NextResponse } from 'next/server'
import { guard } from '@/server/authz/guard'
import { getExportDownloadUrl } from '@/server/services/export-service'

/** Fresh 15-minute signed URL per download (S3.3). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const gate = await guard('document:read')
  if (!gate.ok) return gate.response

  const { batchId } = await params
  const url = await getExportDownloadUrl({ batchId, officeId: gate.user.officeId })
  if (!url) {
    return NextResponse.json({ error: 'Exportação não encontrada' }, { status: 404 })
  }
  return NextResponse.json({ success: true, data: { url } })
}
