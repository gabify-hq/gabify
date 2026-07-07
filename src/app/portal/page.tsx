import Link from 'next/link'
import { Search } from 'lucide-react'
import { auth } from '@/lib/auth'
import { listPortalDocuments } from '@/server/services/portal-service'
import { PortalDocumentTable } from '@/components/portal/portal-document-table'

interface PortalPageProps {
  searchParams: Promise<{ q?: string; cursor?: string }>
}

/**
 * /portal — end-client document list (fase P3): public statuses only,
 * simple filename search, cursor pagination. pt-PT, mobile-first.
 */
export default async function PortalPage({ searchParams }: PortalPageProps) {
  const session = await auth()
  // Layout already gates the role; this is data scoping only
  const officeId = session?.user?.officeId ?? ''
  const clientId = session?.user?.clientId ?? ''
  const { q, cursor } = await searchParams

  const page = await listPortalDocuments({
    officeId,
    clientId,
    q: q ?? null,
    cursor: cursor ?? null,
  })

  const nextHref = page.nextCursor
    ? `/portal?${new URLSearchParams({ ...(q ? { q } : {}), cursor: page.nextCursor }).toString()}`
    : null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[15px] font-bold text-gray-900">Os seus documentos</h1>
        <span className="data rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-400">
          {page.total}
        </span>
      </div>

      <form method="get" action="/portal" className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-300" />
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Procurar por nome do ficheiro"
          aria-label="Procurar documentos"
          className="h-10 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-[13px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-green-400"
        />
      </form>

      <PortalDocumentTable items={page.items} />

      {nextHref && (
        <div className="flex justify-center pt-1">
          <Link
            href={nextHref}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-[12px] font-semibold text-gray-600 transition-colors hover:border-gray-300"
          >
            Ver mais
          </Link>
        </div>
      )}
    </div>
  )
}
