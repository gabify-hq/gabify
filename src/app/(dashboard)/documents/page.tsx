import { FileText } from 'lucide-react'
import { DocumentTable } from '@/components/dashboard/document-table'
import { MOCK_DOCUMENTS } from '@/lib/mock-data'

export default function DocumentsPage() {
  const needsReview = MOCK_DOCUMENTS.filter((d) => d.status === 'NEEDS_REVIEW').length

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <FileText className="h-4 w-4 stroke-[1.75] text-gray-400" />
          <h1 className="text-[13px] font-semibold text-gray-800">Documentos</h1>
          <span className="data rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-400">
            {MOCK_DOCUMENTS.length}
          </span>
        </div>
        {needsReview > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span className="text-[11px] font-medium text-amber-400">
              {needsReview} para rever
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <DocumentTable documents={MOCK_DOCUMENTS} />
      </div>
    </div>
  )
}
