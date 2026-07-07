'use client'

import { useState } from 'react'
import { BankAccounts } from '@/components/dashboard/bank-accounts'
import { BankQueue } from '@/components/dashboard/bank-queue'

interface BankPageClientProps {
  clients: Array<{ id: string; name: string }>
  canManage: boolean
  initialStatus?: string
  initialAccountId?: string
}

/** /bank — accounts per client on top, reconciliation queue below (mobile-first). */
export function BankPageClient({ clients, canManage, initialStatus, initialAccountId }: BankPageClientProps) {
  // Clicking an account's pending counter narrows the queue to that account
  const [queueKey, setQueueKey] = useState(0)
  const [accountFilter, setAccountFilter] = useState(initialAccountId)

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <BankAccounts
        clients={clients}
        canManage={canManage}
        onFilterAccount={(accountId) => {
          setAccountFilter(accountId)
          setQueueKey((n) => n + 1) // remount the queue with the new filter
        }}
      />
      <div>
        <h2 className="mb-3 text-[12px] font-bold uppercase tracking-wider text-gray-400">
          Conciliação
        </h2>
        <BankQueue key={queueKey} initialStatus={initialStatus} initialAccountId={accountFilter} />
      </div>
    </div>
  )
}
