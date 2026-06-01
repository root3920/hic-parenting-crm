'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { KPICard } from '@/components/shared/KPICard'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { PipelineContact } from '@/types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Search, X, GripVertical, ShoppingBag, BookOpen, PhoneCall,
  Crown, GraduationCap, LayoutGrid, List, Clock, RefreshCw, Loader2,
} from 'lucide-react'
import { PageTransition } from '@/components/motion/PageTransition'
import { KPICardGrid } from '@/components/motion/KPICardGrid'
import { AnimatedTableRow } from '@/components/motion/AnimatedTableRow'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useProfile } from '@/hooks/useProfile'
import { useTeamMembers } from '@/hooks/useTeamMembers'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export const dynamic = 'force-dynamic'

// ── Stage config ─────────────────────────────────────────────────────────

const STAGES = [1, 2, 3, 4, 5] as const
type Stage = (typeof STAGES)[number]

const STAGE_CONFIG: Record<Stage, {
  name: string
  color: string
  border: string
  bg: string
  badge: string
  icon: React.ReactNode
}> = {
  1: {
    name: 'Low Ticket',
    color: 'text-zinc-600 dark:text-zinc-400',
    border: 'border-zinc-400',
    bg: 'bg-zinc-50 dark:bg-zinc-900/50',
    badge: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700',
    icon: <ShoppingBag className="h-4 w-4" />,
  },
  2: {
    name: 'Raising Secure Children',
    color: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-400',
    bg: 'bg-blue-50/50 dark:bg-blue-950/20',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800',
    icon: <BookOpen className="h-4 w-4" />,
  },
  3: {
    name: 'Call Booked',
    color: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-400',
    bg: 'bg-amber-50/50 dark:bg-amber-950/20',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
    icon: <PhoneCall className="h-4 w-4" />,
  },
  4: {
    name: 'SPC Member',
    color: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-400',
    bg: 'bg-purple-50/50 dark:bg-purple-950/20',
    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800',
    icon: <Crown className="h-4 w-4" />,
  },
  5: {
    name: 'Graduated PWU',
    color: 'text-green-600 dark:text-green-400',
    border: 'border-green-400',
    bg: 'bg-green-50/50 dark:bg-green-950/20',
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border border-green-200 dark:border-green-800',
    icon: <GraduationCap className="h-4 w-4" />,
  },
}

const PRODUCT_OPTIONS = [
  'Raising Secure Children',
  'Call Booking',
  'SPC Membership',
  'PWU Program',
]

function formatRelativeDate(d: string | null) {
  if (!d) return 'Never'
  const diff = Date.now() - new Date(d).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getInitials(name: string | null) {
  if (!name) return '?'
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

// ── Sortable Contact Card (Kanban) ──────────────────────────────────────

function SortableContactCard({
  contact,
  onClick,
}: {
  contact: PipelineContact
  onClick: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: contact.buyer_email })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const stage = (contact.display_stage ?? 1) as Stage
  const cfg = STAGE_CONFIG[stage] ?? STAGE_CONFIG[1]

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={cn(
        'bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800',
        'p-3 cursor-pointer hover:shadow-md transition-shadow',
        'border-l-4',
        cfg.border
      )}
    >
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400 cursor-grab active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-600 dark:text-zinc-400 shrink-0">
              {getInitials(contact.buyer_name)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                {contact.buyer_name || 'Unknown'}
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                {contact.buyer_email}
              </p>
            </div>
          </div>

          {contact.latest_purchase?.offer_title && (
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-1.5">
              {contact.latest_purchase.offer_title.length > 35
                ? contact.latest_purchase.offer_title.slice(0, 35) + '...'
                : contact.latest_purchase.offer_title}
            </p>
          )}

          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatRelativeDate(contact.last_contacted_at)}
            </span>
            {contact.setter_assigned && (
              <span className="text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full font-medium">
                {contact.setter_assigned}
              </span>
            )}
            {contact.product_proposed && (
              <span className="text-[10px] bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-medium">
                {contact.product_proposed}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Drag Overlay Card ───────────────────────────────────────────────────

function DragOverlayCard({ contact }: { contact: PipelineContact }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-blue-300 dark:border-blue-700 p-3 shadow-xl w-72">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-[10px] font-bold text-blue-600 dark:text-blue-400">
          {getInitials(contact.buyer_name)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
            {contact.buyer_name || 'Unknown'}
          </p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
            {contact.buyer_email}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Kanban Column (droppable) ───────────────────────────────────────────

function KanbanColumn({
  stage,
  contacts,
  onCardClick,
}: {
  stage: Stage
  contacts: PipelineContact[]
  onCardClick: (c: PipelineContact) => void
}) {
  const cfg = STAGE_CONFIG[stage]
  const safeContacts = contacts ?? []
  const emails = safeContacts.map((c) => c.buyer_email)

  return (
    <div className="flex flex-col min-w-[280px] w-[280px] shrink-0">
      <div className={cn('border-t-4 rounded-t-lg px-3 py-2.5', cfg.border, cfg.bg)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cfg.color}>{cfg.icon}</span>
            <h3 className={cn('text-sm font-semibold', cfg.color)}>{cfg.name}</h3>
          </div>
          <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', cfg.badge)}>
            {safeContacts.length}
          </span>
        </div>
      </div>
      <div
        className="flex-1 bg-zinc-50/50 dark:bg-zinc-950/30 border border-t-0 border-zinc-200 dark:border-zinc-800 rounded-b-lg p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-320px)] min-h-[200px]"
        data-stage={stage}
      >
        <SortableContext items={emails} strategy={verticalListSortingStrategy}>
          {safeContacts.map((contact) => (
            <SortableContactCard
              key={contact.buyer_email}
              contact={contact}
              onClick={() => onCardClick(contact)}
            />
          ))}
          {safeContacts.length === 0 && (
            <div className="text-center py-8 text-xs text-zinc-400">
              No contacts in this stage
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  )
}

// ── Activity Modal ──────────────────────────────────────────────────────

function ActivityModal({
  contact,
  setterNames,
  onClose,
  onSaveStage,
  onSaveActivity,
}: {
  contact: PipelineContact
  setterNames: string[]
  onClose: () => void
  onSaveStage: (email: string, stage: number) => void
  onSaveActivity: (email: string, data: {
    setter_assigned: string
    last_contacted_at: string
    product_proposed: string
    notes: string
  }) => void
}) {
  const [stageVal, setStageVal] = useState(contact.display_stage)
  const [setter, setSetter] = useState(contact.setter_assigned ?? '')
  const [lastContacted, setLastContacted] = useState(
    contact.last_contacted_at
      ? new Date(contact.last_contacted_at).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]
  )
  const [product, setProduct] = useState(contact.product_proposed ?? '')
  const [notes, setNotes] = useState(contact.notes ?? '')
  const [saving, setSaving] = useState(false)

  const stage = contact.display_stage as Stage

  async function handleSaveActivity() {
    setSaving(true)
    await onSaveActivity(contact.buyer_email, {
      setter_assigned: setter,
      last_contacted_at: lastContacted ? new Date(lastContacted).toISOString() : '',
      product_proposed: product,
      notes,
    })
    setSaving(false)
  }

  async function handleSaveStage() {
    if (stageVal !== contact.display_stage) {
      onSaveStage(contact.buyer_email, stageVal)
    }
  }

  const inputCls = 'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        {/* Header */}
        <div className="flex items-start gap-3 mb-5">
          <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-base font-bold text-zinc-600 dark:text-zinc-400 shrink-0">
            {getInitials(contact.buyer_name)}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              {contact.buyer_name || 'Unknown'}
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{contact.buyer_email}</p>
            {contact.buyer_phone && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{contact.buyer_phone}</p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="h-4 w-4 text-zinc-500" />
          </button>
        </div>

        {/* Latest purchase */}
        {contact?.latest_purchase?.offer_title && (
          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3 mb-4">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Latest Purchase</p>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {contact.latest_purchase.offer_title}
            </p>
            {contact.latest_purchase.date && (
              <p className="text-xs text-zinc-400">
                {new Date(contact.latest_purchase.date).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })}
              </p>
            )}
          </div>
        )}

        {/* Call info */}
        {contact?.call_info?.status && (
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 mb-4">
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-1">Call Info</p>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              {contact.call_info.status}
              {contact.call_info.start_date && (
                <> — {new Date(contact.call_info.start_date).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
                })}</>
              )}
            </p>
          </div>
        )}

        {/* Stage */}
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
            Stage
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
            Auto: Stage {contact.auto_stage ?? '?'} — {STAGE_CONFIG[(contact.auto_stage ?? 1) as Stage]?.name ?? 'Unknown'}
            {contact.manual_override && (
              <span className="ml-2 text-amber-600 dark:text-amber-400 font-medium">(manual override active)</span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <select
              className={inputCls}
              value={stageVal}
              onChange={(e) => setStageVal(Number(e.target.value))}
            >
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  Stage {s} — {STAGE_CONFIG[s].name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              onClick={handleSaveStage}
              disabled={stageVal === contact.display_stage}
              className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
            >
              Move
            </Button>
          </div>
        </div>

        {/* Setter Activity */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">
            Setter Activity
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">
                Setter Assigned
              </label>
              <select className={inputCls} value={setter} onChange={(e) => setSetter(e.target.value)}>
                <option value="">Unassigned</option>
                {(setterNames ?? []).map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">
                Last Contacted
              </label>
              <input type="date" className={inputCls} value={lastContacted} onChange={(e) => setLastContacted(e.target.value)} />
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">
                Product Proposed
              </label>
              <select className={inputCls} value={product} onChange={(e) => setProduct(e.target.value)}>
                <option value="">None</option>
                {PRODUCT_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">
                Notes
              </label>
              <textarea
                className={cn(inputCls, 'resize-none')}
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about this contact..."
              />
            </div>

            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                onClick={handleSaveActivity}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {saving ? 'Saving...' : 'Save Activity'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────

export default function ContactsPage() {
  const { profile } = useProfile()
  const isAdmin = profile?.role === 'admin'
  const { names: setterNames } = useTeamMembers('setter')
  const [contacts, setContacts] = useState<PipelineContact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  const [stageFilter, setStageFilter] = useState<Stage | 'all'>('all')
  const [setterFilter, setSetterFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'stage' | 'name' | 'last_contacted'>('stage')
  const [selectedContact, setSelectedContact] = useState<PipelineContact | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [counts, setCounts] = useState<Record<number, number>>({})
  const [backfillDone, setBackfillDone] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const runBackfill = useCallback(async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/pipeline/backfill', { method: 'POST' })
      if (!res.ok) throw new Error('Backfill failed')
      const json = await res.json()
      toast.success(`Synced ${json.total} contacts (${json.processed} updated) in ${(json.duration_ms / 1000).toFixed(1)}s`)
      return true
    } catch {
      toast.error('Failed to sync pipeline contacts')
      return false
    } finally {
      setSyncing(false)
    }
  }, [])

  /** Safely parse pipeline API response, always returning arrays. */
  function parsePipelineResponse(json: Record<string, unknown>) {
    return {
      data: (Array.isArray(json?.data) ? json.data : []) as PipelineContact[],
      counts: (json?.counts ?? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }) as Record<number, number>,
      total: (typeof json?.total === 'number' ? json.total : 0) as number,
      needs_backfill: json?.needs_backfill === true,
    }
  }

  const fetchContacts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/pipeline/contacts')
      const json = await res.json().catch(() => ({}))
      const parsed = parsePipelineResponse(json)
      setContacts(parsed.data)
      setCounts(parsed.counts)

      // Auto-backfill if fewer than 1000 records (initial population)
      if (!backfillDone && (parsed.needs_backfill || parsed.total < 1000)) {
        setBackfillDone(true)
        const success = await runBackfill()
        if (success) {
          // Re-fetch after backfill
          try {
            const res2 = await fetch('/api/pipeline/contacts')
            const json2 = await res2.json().catch(() => ({}))
            const parsed2 = parsePipelineResponse(json2)
            setContacts(parsed2.data)
            setCounts(parsed2.counts)
          } catch {
            // silently ignore re-fetch failure after backfill
          }
        }
      }
    } catch {
      setError('Failed to load pipeline contacts')
      toast.error('Failed to load pipeline contacts')
      setContacts([])
      setCounts({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 })
    }
    setLoading(false)
  }, [backfillDone, runBackfill])

  useEffect(() => {
    fetchContacts()
  }, [fetchContacts])

  async function handleSync() {
    const success = await runBackfill()
    if (success) {
      try {
        const res = await fetch('/api/pipeline/contacts')
        const json = await res.json().catch(() => ({}))
        const parsed = parsePipelineResponse(json)
        setContacts(parsed.data)
        setCounts(parsed.counts)
      } catch {
        // silently ignore, user already saw the sync toast
      }
    }
  }

  // Filter contacts
  const filtered = useMemo(() => {
    let result = contacts ?? []
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (c) =>
          (c.buyer_name ?? '').toLowerCase().includes(q) ||
          (c.buyer_email ?? '').toLowerCase().includes(q)
      )
    }
    if (stageFilter !== 'all') {
      result = result.filter((c) => c.display_stage === stageFilter)
    }
    if (setterFilter !== 'all') {
      result = result.filter((c) => c.setter_assigned === setterFilter)
    }
    return result
  }, [contacts, search, stageFilter, setterFilter])

  // Sort for list view
  const sorted = useMemo(() => {
    const arr = [...(filtered ?? [])]
    if (sortBy === 'name') {
      arr.sort((a, b) => (a.buyer_name ?? '').localeCompare(b.buyer_name ?? ''))
    } else if (sortBy === 'last_contacted') {
      arr.sort((a, b) => {
        if (!a.last_contacted_at && !b.last_contacted_at) return 0
        if (!a.last_contacted_at) return 1
        if (!b.last_contacted_at) return -1
        return new Date(b.last_contacted_at).getTime() - new Date(a.last_contacted_at).getTime()
      })
    } else {
      arr.sort((a, b) => a.display_stage - b.display_stage)
    }
    return arr
  }, [filtered, sortBy])

  // Group by stage for kanban
  const byStage = useMemo(() => {
    const map: Record<Stage, PipelineContact[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] }
    for (const c of (filtered ?? [])) {
      const s = c.display_stage as Stage
      if (map[s]) map[s].push(c)
    }
    return map
  }, [filtered])

  // Drag and drop handlers
  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return

    const email = active.id as string
    const contact = (contacts ?? []).find((c) => c.buyer_email === email)
    if (!contact) return

    // Determine target stage from the over element
    // over.id could be another card's email or a stage droppable
    let targetStage: number | null = null

    // Check if dropped over another card
    const overContact = (contacts ?? []).find((c) => c.buyer_email === over.id)
    if (overContact) {
      targetStage = overContact.display_stage
    }

    // If dropped on the column droppable area (data-stage attr)
    if (!targetStage && over.data?.current) {
      targetStage = over.data.current.stage
    }

    if (!targetStage || targetStage === contact.display_stage) return

    // Optimistic update
    setContacts((prev) =>
      (prev ?? []).map((c) =>
        c.buyer_email === email
          ? { ...c, display_stage: targetStage!, manual_override: true }
          : c
      )
    )
    setCounts((prev) => ({
      ...prev,
      [contact.display_stage]: (prev[contact.display_stage] || 1) - 1,
      [targetStage!]: (prev[targetStage!] || 0) + 1,
    }))

    try {
      const res = await fetch(
        `/api/pipeline/contacts/${encodeURIComponent(email)}/stage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: targetStage }),
        }
      )
      if (!res.ok) throw new Error()
      toast.success(`Moved to ${STAGE_CONFIG[targetStage as Stage].name}`)
    } catch {
      toast.error('Failed to update stage')
      fetchContacts()
    }
  }

  async function handleSaveStage(email: string, stage: number) {
    setContacts((prev) =>
      (prev ?? []).map((c) =>
        c.buyer_email === email
          ? { ...c, display_stage: stage, manual_override: true }
          : c
      )
    )
    try {
      const res = await fetch(
        `/api/pipeline/contacts/${encodeURIComponent(email)}/stage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage }),
        }
      )
      if (!res.ok) throw new Error()
      toast.success(`Moved to ${STAGE_CONFIG[stage as Stage].name}`)
      setSelectedContact((prev) =>
        prev?.buyer_email === email
          ? { ...prev, display_stage: stage, manual_override: true }
          : prev
      )
    } catch {
      toast.error('Failed to update stage')
      fetchContacts()
    }
  }

  async function handleSaveActivity(
    email: string,
    data: { setter_assigned: string; last_contacted_at: string; product_proposed: string; notes: string }
  ) {
    try {
      const res = await fetch(
        `/api/pipeline/contacts/${encodeURIComponent(email)}/activity`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      )
      if (!res.ok) throw new Error()
      toast.success('Activity saved')
      setContacts((prev) =>
        (prev ?? []).map((c) =>
          c.buyer_email === email ? { ...c, ...data } : c
        )
      )
      setSelectedContact((prev) =>
        prev?.buyer_email === email ? { ...prev, ...data } : prev
      )
    } catch {
      toast.error('Failed to save activity')
    }
  }

  const draggedContact = activeId ? (contacts ?? []).find((c) => c.buyer_email === activeId) ?? null : null

  // Unique setters for filter
  const uniqueSetters = useMemo(() => {
    const s = new Set<string>()
    ;(contacts ?? []).forEach((c) => {
      if (c.setter_assigned) s.add(c.setter_assigned)
    })
    return Array.from(s).sort()
  }, [contacts])

  return (
    <PageTransition>
      <PageHeader title="Value Ladder Pipeline" description="Escalera de valor · Low Ticket → PWU">
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
              className="gap-1.5 text-xs"
            >
              {syncing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {syncing ? 'Syncing...' : 'Sync'}
            </Button>
          )}
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
            <button
              onClick={() => setView('kanban')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                view === 'kanban'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Kanban
            </button>
            <button
              onClick={() => setView('list')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                view === 'list'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
              )}
            >
              <List className="h-3.5 w-3.5" />
              List
            </button>
          </div>
        </div>
      </PageHeader>

      {/* KPI Cards */}
      <KPICardGrid className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {STAGES.map((s) => {
          const cfg = STAGE_CONFIG[s]
          return (
            <KPICard
              key={s}
              title={cfg.name}
              value={counts[s] ?? 0}
              loading={loading}
              icon={cfg.icon}
              className={cn('ring-1', {
                'ring-zinc-200 dark:ring-zinc-700': s === 1,
                'ring-blue-200 dark:ring-blue-800': s === 2,
                'ring-amber-200 dark:ring-amber-800': s === 3,
                'ring-purple-200 dark:ring-purple-800': s === 4,
                'ring-green-200 dark:ring-green-800': s === 5,
              })}
            />
          )
        })}
      </KPICardGrid>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Search name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Stage filter pills */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setStageFilter('all')}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
              stageFilter === 'all'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
            )}
          >
            All
          </button>
          {STAGES.map((s) => (
            <button
              key={s}
              onClick={() => setStageFilter(s)}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                stageFilter === s
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
              )}
            >
              {STAGE_CONFIG[s].name}
            </button>
          ))}
        </div>

        {/* Setter filter */}
        <select
          value={setterFilter}
          onChange={(e) => setSetterFilter(e.target.value)}
          className="text-xs rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          <option value="all">All Setters</option>
          {(uniqueSetters ?? []).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Sort (list view) */}
        {view === 'list' && (
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="text-xs rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30 ml-auto"
          >
            <option value="stage">Sort by Stage</option>
            <option value="name">Sort by Name</option>
            <option value="last_contacted">Sort by Last Contacted</option>
          </select>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          title="Error loading pipeline"
          description={error}
        />
      ) : (contacts ?? []).length === 0 ? (
        <EmptyState
          title="No pipeline contacts"
          description="Contacts will appear here automatically from completed transactions."
        />
      ) : view === 'kanban' ? (
        /* ── KANBAN VIEW ── */
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STAGES.map((stage) => (
              <KanbanColumn
                key={stage}
                stage={stage}
                contacts={byStage[stage] ?? []}
                onCardClick={setSelectedContact}
              />
            ))}
          </div>
          <DragOverlay>
            {draggedContact ? <DragOverlayCard contact={draggedContact} /> : null}
          </DragOverlay>
        </DndContext>
      ) : (
        /* ── LIST VIEW ── */
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <Table>
            <TableHeader>
              <tr className="bg-zinc-50 dark:bg-zinc-900/50">
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Latest Purchase</TableHead>
                <TableHead>Call</TableHead>
                <TableHead>Setter</TableHead>
                <TableHead>Last Contacted</TableHead>
                <TableHead>Product Proposed</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {(sorted ?? []).map((contact, idx) => {
                const stage = (contact.display_stage ?? 1) as Stage
                const cfg = STAGE_CONFIG[stage] ?? STAGE_CONFIG[1]
                return (
                  <AnimatedTableRow
                    key={contact.buyer_email}
                    custom={idx}
                    variants={{
                      hidden: { opacity: 0, x: -8 },
                      visible: (i: number) => ({
                        opacity: 1,
                        x: 0,
                        transition: { delay: i * 0.03, duration: 0.2, ease: 'easeOut' as const },
                      }),
                    }}
                    initial="hidden"
                    animate="visible"
                    className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                    onClick={() => setSelectedContact(contact)}
                  >
                    <TableCell className="font-medium text-zinc-900 dark:text-zinc-100">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-600 dark:text-zinc-400 shrink-0">
                          {getInitials(contact.buyer_name)}
                        </div>
                        {contact.buyer_name || 'Unknown'}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">
                      {contact.buyer_email}
                    </TableCell>
                    <TableCell>
                      <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', cfg.badge)}>
                        {cfg.name}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-zinc-600 dark:text-zinc-400 max-w-[200px] truncate">
                      {contact.latest_purchase?.offer_title ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {contact.call_info ? (
                        <span className="text-amber-600 dark:text-amber-400 text-xs font-medium">
                          {contact.call_info.status}
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {contact.setter_assigned ? (
                        <span className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">
                          {contact.setter_assigned}
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-zinc-500 dark:text-zinc-400">
                      {formatRelativeDate(contact.last_contacted_at)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {contact.product_proposed ? (
                        <span className="text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
                          {contact.product_proposed}
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()} className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7 px-2"
                        onClick={() => setSelectedContact(contact)}
                      >
                        Log Activity
                      </Button>
                    </TableCell>
                  </AnimatedTableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Activity Modal */}
      {selectedContact && (
        <ActivityModal
          contact={selectedContact}
          setterNames={setterNames ?? []}
          onClose={() => setSelectedContact(null)}
          onSaveStage={handleSaveStage}
          onSaveActivity={handleSaveActivity}
        />
      )}
    </PageTransition>
  )
}
