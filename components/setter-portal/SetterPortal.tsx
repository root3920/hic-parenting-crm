'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, RefreshCw, Inbox, User, PhoneOff } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useProfile } from '@/hooks/useProfile'
import { PipelineContactModal } from '@/components/contacts/PipelineContactModal'
import { STAGE_LABELS, STAGE_COLORS, type PipelineTier } from '@/lib/pipeline-tiers'

// ── Types ─────────────────────────────────────────────────────────────────────

interface QueueItem {
  id: string
  contact_email: string
  setter_name: string
  assigned_date: string
  status: string
  status_updated_at: string
  created_at: string
  contact_name: string | null
  current_stage: number | null
  lead_status: string | null
  cancelled_at: string | null
  is_carryover: boolean
}

interface QueueData {
  items: QueueItem[]
  counts: Record<string, number>
  total: number
  date?: string
}

// ── Status column config ──────────────────────────────────────────────────────

const STATUS_COLUMNS = [
  { key: 'not_contacted', label: 'Not Contacted', color: '#6B7280', bg: 'bg-zinc-100 dark:bg-zinc-800', text: 'text-zinc-600 dark:text-zinc-400', ring: 'ring-zinc-300 dark:ring-zinc-600' },
  { key: 'contacted', label: 'Contacted', color: '#3B82F6', bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-600 dark:text-blue-400', ring: 'ring-blue-300 dark:ring-blue-600' },
  { key: 'following_up', label: 'Following Up', color: '#EAB308', bg: 'bg-yellow-50 dark:bg-yellow-900/20', text: 'text-yellow-600 dark:text-yellow-400', ring: 'ring-yellow-300 dark:ring-yellow-600' },
  { key: 'call_proposed', label: 'Call Proposed', color: '#F97316', bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-600 dark:text-orange-400', ring: 'ring-orange-300 dark:ring-orange-600' },
  { key: 'call_scheduled', label: 'Call Scheduled', color: '#22C55E', bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-600 dark:text-green-400', ring: 'ring-green-300 dark:ring-green-600' },
] as const

const JUAN_DIEGO = 'Juan Diego'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(str: string): string {
  return str
    .split(/[\s@]/)
    .slice(0, 2)
    .map((w) => (w[0] || '').toUpperCase())
    .join('')
}

function getSetterInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => (w[0] || '').toUpperCase())
    .join('')
}

// ── Shared queue list renderer ────────────────────────────────────────────────

function QueueList({
  items,
  activeTab,
  isAdmin,
  isCancelledView,
  updatingId,
  onStatusChange,
  onSelectEmail,
}: {
  items: QueueItem[]
  activeTab: string
  isAdmin: boolean
  isCancelledView?: boolean
  updatingId: string | null
  onStatusChange: (item: QueueItem, newStatus: string) => void
  onSelectEmail: (email: string) => void
}) {
  const activeColumn = STATUS_COLUMNS.find((c) => c.key === activeTab)!
  const filteredItems = items.filter((i) => i.status === activeTab)

  if (filteredItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
        <Inbox className="h-10 w-10 mb-3" />
        <p className="text-sm font-medium">No contacts in &ldquo;{activeColumn.label}&rdquo;</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {filteredItems.map((item) => (
        <div
          key={item.id}
          className={cn(
            'flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors cursor-pointer',
            'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800',
            'hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-sm',
          )}
        >
          {/* Avatar + info — clicking opens modal */}
          <div
            className="flex items-center gap-3 flex-1 min-w-0"
            onClick={() => onSelectEmail(item.contact_email)}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
              style={{ backgroundColor: item.current_stage ? STAGE_COLORS[item.current_stage as PipelineTier] : '#6B7280' }}
            >
              {getInitials(item.contact_name || item.contact_email)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                  {item.contact_name || item.contact_email}
                </p>
                {item.is_carryover && (
                  <span className="shrink-0 inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                    Carryover
                  </span>
                )}
                {isCancelledView && item.cancelled_at && (
                  <span className="shrink-0 inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                    Cancelled {new Date(item.cancelled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
                {item.current_stage && (
                  <span
                    className="shrink-0 inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{
                      backgroundColor: `${STAGE_COLORS[item.current_stage as PipelineTier]}15`,
                      color: STAGE_COLORS[item.current_stage as PipelineTier],
                    }}
                  >
                    S{item.current_stage}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 truncate mt-0.5">
                {item.contact_email}
              </p>
            </div>
          </div>

          {/* Setter tag (admin view) */}
          {isAdmin && (
            <div className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs font-medium text-zinc-600 dark:text-zinc-400">
              <User className="h-3 w-3" />
              {item.setter_name}
            </div>
          )}

          {/* Status quick-change dropdown */}
          <select
            value={item.status}
            onChange={(e) => onStatusChange(item, e.target.value)}
            disabled={updatingId === item.id}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'shrink-0 text-xs font-semibold rounded-lg px-2.5 py-1.5 border-0 cursor-pointer focus:outline-none focus:ring-2 transition-colors',
              'focus:ring-[#ffbd59]/30',
              activeColumn.bg,
              activeColumn.text,
              updatingId === item.id && 'opacity-50',
            )}
          >
            {STATUS_COLUMNS.map((col) => (
              <option key={col.key} value={col.key}>
                {col.label}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

type PortalView = 'daily' | 'cancelled'

export function SetterPortal() {
  const { profile } = useProfile()
  const isAdmin = profile?.role === 'admin'
  const setterIdentity = profile?.setter_name || profile?.full_name || ''
  const isJuanDiego = setterIdentity === JUAN_DIEGO
  const showCancelledTab = isAdmin || isJuanDiego

  const [view, setView] = useState<PortalView>('daily')
  const [data, setData] = useState<QueueData | null>(null)
  const [cancelledData, setCancelledData] = useState<QueueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelledLoading, setCancelledLoading] = useState(true)
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>('not_contacted')
  const [cancelledActiveTab, setCancelledActiveTab] = useState<string>('not_contacted')

  const fetchQueue = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/setter-portal/queue')
      const json = await res.json()
      if (json.error) {
        toast.error(json.error)
      } else {
        setData(json)
      }
    } catch {
      toast.error('Failed to load queue')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchCancelledQueue = useCallback(async () => {
    setCancelledLoading(true)
    try {
      const res = await fetch('/api/setter-portal/cancelled-queue')
      const json = await res.json()
      if (json.error) {
        // Don't toast for 403 — just means user doesn't have access
        if (json.error !== 'Forbidden') toast.error(json.error)
      } else {
        setCancelledData(json)
      }
    } catch {
      toast.error('Failed to load cancelled queue')
    } finally {
      setCancelledLoading(false)
    }
  }, [])

  useEffect(() => { fetchQueue() }, [fetchQueue])
  useEffect(() => {
    if (showCancelledTab) fetchCancelledQueue()
  }, [showCancelledTab, fetchCancelledQueue])

  function updateLocalCounts(items: QueueItem[]): Record<string, number> {
    const counts = { not_contacted: 0, contacted: 0, following_up: 0, call_proposed: 0, call_scheduled: 0 }
    for (const i of items) {
      if (i.status in counts) counts[i.status as keyof typeof counts]++
    }
    return counts
  }

  async function handleStatusChange(item: QueueItem, newStatus: string) {
    setUpdatingId(item.id)
    try {
      const res = await fetch('/api/setter-portal/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, status: newStatus }),
      })
      const json = await res.json()
      if (json.error) {
        toast.error(json.error)
      } else {
        // Update whichever dataset this item belongs to
        if (view === 'cancelled') {
          setCancelledData((prev) => {
            if (!prev) return prev
            const updated = prev.items.map((i) =>
              i.id === item.id ? { ...i, status: newStatus, status_updated_at: new Date().toISOString() } : i,
            )
            return { ...prev, items: updated, counts: updateLocalCounts(updated) }
          })
        } else {
          setData((prev) => {
            if (!prev) return prev
            const updated = prev.items.map((i) =>
              i.id === item.id ? { ...i, status: newStatus, status_updated_at: new Date().toISOString() } : i,
            )
            return { ...prev, items: updated, counts: updateLocalCounts(updated) }
          })
        }
        toast.success('Status updated')
      }
    } catch {
      toast.error('Update failed')
    } finally {
      setUpdatingId(null)
    }
  }

  const currentData = view === 'cancelled' ? cancelledData : data
  const currentLoading = view === 'cancelled' ? cancelledLoading : loading
  const currentActiveTab = view === 'cancelled' ? cancelledActiveTab : activeTab
  const setCurrentActiveTab = view === 'cancelled' ? setCancelledActiveTab : setActiveTab
  const currentRefresh = view === 'cancelled' ? fetchCancelledQueue : fetchQueue

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {isAdmin ? 'Setter Portal — All Queues' : 'My Queue'}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {view === 'daily' ? (
              <>
                {data ? `${data.total} contacts assigned` : 'Loading…'}
                {data?.date && ` · ${new Date(data.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`}
              </>
            ) : (
              <>
                {cancelledData ? `${cancelledData.total} cancelled contacts` : 'Loading…'}
                {' · Fixed list — no daily rotation'}
              </>
            )}
          </p>
        </div>
        <button
          onClick={currentRefresh}
          disabled={currentLoading}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('h-4 w-4', currentLoading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* View switcher — only shown to Juan Diego or admins */}
      {showCancelledTab && (
        <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setView('daily')}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              view === 'daily'
                ? 'border-[#ffbd59] text-[#ffbd59]'
                : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:border-zinc-300',
            )}
          >
            Daily Queue
            {data && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                {data.total}
              </span>
            )}
          </button>
          <button
            onClick={() => setView('cancelled')}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              view === 'cancelled'
                ? 'border-red-400 text-red-500 dark:text-red-400'
                : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:border-zinc-300',
            )}
          >
            <PhoneOff className="h-3.5 w-3.5" />
            Cancelled - No Rebook
            {cancelledData && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400">
                {cancelledData.total}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Status tabs */}
      <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl overflow-x-auto">
        {STATUS_COLUMNS.map((col) => {
          const count = currentData?.counts[col.key] ?? 0
          const isActive = currentActiveTab === col.key
          return (
            <button
              key={col.key}
              onClick={() => setCurrentActiveTab(col.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all',
                isActive
                  ? 'bg-white dark:bg-zinc-900 shadow-sm ' + col.text
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300',
              )}
            >
              {col.label}
              <span
                className={cn(
                  'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold',
                  isActive
                    ? col.bg + ' ' + col.text
                    : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400',
                )}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Content */}
      {currentLoading && !currentData ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      ) : (
        <QueueList
          items={currentData?.items ?? []}
          activeTab={currentActiveTab}
          isAdmin={isAdmin}
          isCancelledView={view === 'cancelled'}
          updatingId={updatingId}
          onStatusChange={handleStatusChange}
          onSelectEmail={setSelectedEmail}
        />
      )}

      {/* Contact detail modal (reused from Pipeline) */}
      {selectedEmail && (
        <PipelineContactModal
          email={selectedEmail}
          onClose={() => setSelectedEmail(null)}
          onUpdated={view === 'cancelled' ? fetchCancelledQueue : fetchQueue}
        />
      )}
    </div>
  )
}
