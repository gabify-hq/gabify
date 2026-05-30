import { FileText } from 'lucide-react'
import { DocumentTable } from '@/components/dashboard/document-table'
import { MOCK_DOCUMENTS } from '@/lib/mock-data'

export default function DocumentsPage() {
  const needsReview = MOCK_DOCUMENTS.filter((d) => d.status === 'NEEDS_REVIEW').length

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-3.5">
        <div className="flex items-center gap-2.5">
          <FileText className="h-4 w-4 text-neutral-500" />
          <h1 className="text-[15px] font-semibold text-neutral-900">Documentos</h1>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[12px] font-medium text-neutral-600">
            {MOCK_DOCUMENTS.length}
          </span>
        </div>
        {needsReview > 0 && (
          <div className="flex items-center gap-1.5 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-1.5">
            <span className="text-[12px] font-medium text-yellow-700">
              {needsReview} documento{needsReview > 1 ? 's' : ''} para rever
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <DocumentTable documents={MOCK_DOCUMENTS} />
      </div>
    </div>
  )
}
