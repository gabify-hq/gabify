import { UploadDocuments } from '@/components/dashboard/upload-documents'

/**
 * /portal/upload — end-client upload (fase P3): drag&drop + camera, multiple
 * files, per-file feedback. Reuses the proven upload component against the
 * portal endpoint; the client never chooses a target client — the server
 * forces their own.
 */
export default function PortalUploadPage() {
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-[15px] font-bold text-gray-900">Carregar documentos</h1>
        <p className="pt-0.5 text-[12px] text-gray-400">
          Envie faturas, recibos e outros documentos para o seu contabilista.
          No telemóvel pode fotografar diretamente.
        </p>
      </div>
      <UploadDocuments
        clients={[]}
        endpoint="/api/portal/documents/upload"
        showClientSelector={false}
      />
    </div>
  )
}
