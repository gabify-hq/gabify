'use client'

// Client-side store for dashboard action state.
// Persists to sessionStorage so state survives navigation within the session.
// In production this will be replaced by server state via API calls.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type ActionDecision = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'EDITED_SENT'

interface ActionState {
  status: ActionDecision
  editedContent?: string
  decidedAt?: string
}

interface DashboardStore {
  actions: Record<string, ActionState>
  getAction: (actionId: string) => ActionState | undefined
  approveAction: (actionId: string, content: string) => void
  rejectAction: (actionId: string) => void
  editAndSendAction: (actionId: string, editedContent: string) => void
}

const STORAGE_KEY = 'gabify_dashboard_actions'

const DashboardContext = createContext<DashboardStore | null>(null)

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<Record<string, ActionState>>({})

  // Rehydrate from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      if (stored) setActions(JSON.parse(stored))
    } catch {
      // sessionStorage unavailable — continue with empty state
    }
  }, [])

  // Persist to sessionStorage on every change
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(actions))
    } catch {
      // ignore
    }
  }, [actions])

  const updateAction = (actionId: string, state: ActionState) => {
    setActions((prev) => ({ ...prev, [actionId]: state }))
  }

  const store: DashboardStore = {
    actions,
    getAction: (id) => actions[id],
    approveAction: (id, content) =>
      updateAction(id, { status: 'APPROVED', editedContent: content, decidedAt: new Date().toISOString() }),
    rejectAction: (id) =>
      updateAction(id, { status: 'REJECTED', decidedAt: new Date().toISOString() }),
    editAndSendAction: (id, editedContent) =>
      updateAction(id, { status: 'EDITED_SENT', editedContent, decidedAt: new Date().toISOString() }),
  }

  return <DashboardContext.Provider value={store}>{children}</DashboardContext.Provider>
}

export function useDashboardStore(): DashboardStore {
  const ctx = useContext(DashboardContext)
  if (!ctx) throw new Error('useDashboardStore must be used inside DashboardProvider')
  return ctx
}
