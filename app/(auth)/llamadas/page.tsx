'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useProfile } from '@/hooks/useProfile'
import { PageHeader } from '@/components/layout/PageHeader'
import { PageTransition } from '@/components/motion/PageTransition'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Call } from '@/types'
import { CallDetailModal } from '@/components/llamadas/CallDetailModal'
import { UpcomingCallCard } from '@/components/llamadas/UpcomingCallCard'
import {
  Calendar, CheckCircle, XCircle, UserX, RefreshCw,
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  Eye, ExternalLink, Search, Loader2, Check, Pencil, Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { US_TIMEZONES, formatDateTimeInTimezone } from '@/lib/timezones'
import { useUserTimezone } from '@/hooks/useUserTimezone'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

// ─── Types ───────────────────────────────────────────────────────────────────

type Preset = '7d' | '30d' | '90d' | 'todo'
type SortKey = 'start_date' | 'full_name' | 'status' | 'closer_name'
type StatusFilter = 'all' | 'scheduled_future' | 'Showed Up' | 'Cancelled' | 'No show' | 'Rescheduled'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  'Scheduled':   'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Showed Up':   'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  'Cancelled':   'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'No show':     'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'Rescheduled': 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
}

const CALL_TYPE_STYLES: Record<string, string> = {
  'Qualified':    'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Disqualified': 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'Onboarding':   'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  'Interview':    'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
}

const PIE_COLORS: Record<string, string> = {
  'Showed Up':   '#3B6D11',
  'Cancelled':   '#A32D2D',
  'No show':     '#BA7517',
  'Rescheduled': '#534AB7',
  'Scheduled':   '#185FA5',
}

const STATUS_OPTIONS = ['Scheduled', 'Showed Up', 'Rescheduled', 'Cancelled', 'No show'] as const

const CLOSERS = [
  'Marcela HIC Parenting',
  'Cali Luna',
]

const SETTERS = [
  'Valentina Llano',
  'Marcela Collier',
]

const STATUS_DOT: Record<string, string> = {
  'Scheduled':   'bg-blue-500',
  'Showed Up':   'bg-green-500',
  'Rescheduled': 'bg-purple-500',
  'Cancelled':   'bg-red-500',
  'No show':     'bg-amber-500',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDateRange(preset: Preset) {
  const now = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  const add = (days: number) => { const d = new Date(now); d.setDate(now.getDate() + days); return d }
  if (preset === '7d')  return { from: fmt(add(-7)),  to: fmt(add(7)) }
  if (preset === '30d') return { from: fmt(add(-30)), to: fmt(add(30)) }
  if (preset === '90d') return { from: fmt(add(-90)), to: fmt(add(90)) }
  return { from: '2020-01-01', to: fmt(add(400)) }
}

function formatDateShort(dateStr: string, timezone: string) {
  return formatDateTimeInTimezone(dateStr, timezone)
}

function weekStart(dateStr: string): string {
  const d = new Date(dateStr)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(d)
  mon.setDate(d.getDate() + diff)
  return mon.toISOString().split('T')[0]
}

function weekLabel(wk: string): string {
  // wk is YYYY-MM-DD — parse in local time to avoid UTC midnight day shift
  const [y, m, d] = wk.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${date.getDate()} ${months[date.getMonth()]}`
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(n => n[0]?.toUpperCase() ?? '').join('')
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', STATUS_STYLES[status] ?? 'bg-zinc-100 text-zinc-600')}>
      {status}
    </span>
  )
}

function CallTypePill({ type }: { type: string | null }) {
  if (!type) return null
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', CALL_TYPE_STYLES[type] ?? 'bg-zinc-100 text-zinc-600')}>
      {type}
    </span>
  )
}

interface KpiCardDef {
  key: StatusFilter
  label: string
  icon: React.ElementType
  iconColor: string
  borderActive: string
  borderIdle: string
}

const KPI_CARDS: KpiCardDef[] = [
  { key: 'scheduled_future', label: 'Upcoming',    icon: Calendar,   iconColor: 'text-blue-500',   borderActive: 'border-blue-500',   borderIdle: 'border-zinc-200 dark:border-zinc-800' },
  { key: 'Showed Up',        label: 'Showed Up',  icon: CheckCircle, iconColor: 'text-green-500', borderActive: 'border-green-500',  borderIdle: 'border-zinc-200 dark:border-zinc-800' },
  { key: 'Cancelled',        label: 'Cancelled',  icon: XCircle,     iconColor: 'text-red-500',   borderActive: 'border-red-500',    borderIdle: 'border-zinc-200 dark:border-zinc-800' },
  { key: 'No show',          label: 'No Show',    icon: UserX,       iconColor: 'text-amber-500', borderActive: 'border-amber-500',  borderIdle: 'border-zinc-200 dark:border-zinc-800' },
  { key: 'Rescheduled',      label: 'Rescheduled',icon: RefreshCw,   iconColor: 'text-purple-500',borderActive: 'border-purple-500', borderIdle: 'border-zinc-200 dark:border-zinc-800' },
]

function SortHeader({ label, sortKey: sk, current, dir, onSort }: {
  label: string; sortKey: SortKey; current: SortKey; dir: 'asc' | 'desc'; onSort: (k: SortKey) => void
}) {
  const active = current === sk
  return (
    <th
      className="text-left py-2.5 px-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400 cursor-pointer select-none whitespace-nowrap hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
      onClick={() => onSort(sk)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronDown className="h-3 w-3 opacity-30" />}
      </span>
    </th>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LlamadasPage() {
  const supabase = useMemo(() => createClient(), [])
  const { timezone } = useUserTimezone()
  const { profile } = useProfile()
  const isCloser = profile?.role === 'closer'
  const tzAbbr = US_TIMEZONES.find(t => t.value === timezone)?.abbr ?? 'EST'

  // State
  const [calls, setCalls] = useState<Call[]>([])
  const [upcomingCalls, setUpcomingCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState<Preset>('30d')
  const [selectedCloser, setSelectedCloser] = useState('all')
  const [selectedSetter, setSelectedSetter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('start_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(0)
  const [detailCall, setDetailCall] = useState<Call | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null)
  const [editingCell, setEditingCell] = useState<{
    callId: string
    field: 'closer_name' | 'setter_name'
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Call | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Date range
  const { from: fromDate, to: toDate } = useMemo(() => getDateRange(preset), [preset])

  // Main fetch
  const fetchCalls = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('calls')
      .select('*')
      .gte('start_date', fromDate)
      .lte('start_date', toDate)
      .order('start_date', { ascending: false })
    if (selectedCloser !== 'all') q = q.eq('closer_name', selectedCloser)
    if (selectedSetter !== 'all') q = q.eq('setter_name', selectedSetter)
    const { data } = await q
    setCalls(data ?? [])
    setLoading(false)
  }, [supabase, fromDate, toDate, selectedCloser, selectedSetter])

  // Upcoming fetch (always next 7 days)
  const fetchUpcoming = useCallback(async () => {
    const now = new Date()
    const plus7 = new Date(now); plus7.setDate(now.getDate() + 7)
    let q = supabase
      .from('calls')
      .select('*')
      .gte('start_date', now.toISOString())
      .lte('start_date', plus7.toISOString())
      .in('status', ['Scheduled', 'Rescheduled'])
      .order('start_date', { ascending: true })
    if (selectedCloser !== 'all') q = q.eq('closer_name', selectedCloser)
    if (selectedSetter !== 'all') q = q.eq('setter_name', selectedSetter)
    const { data } = await q
    setUpcomingCalls(data ?? [])
  }, [supabase, selectedCloser, selectedSetter])

  useEffect(() => { fetchCalls() }, [fetchCalls])
  useEffect(() => { fetchUpcoming() }, [fetchUpcoming])

  // Reset page on filter change
  useEffect(() => { setPage(0) }, [preset, selectedCloser, selectedSetter, statusFilter, debouncedSearch, sortKey, sortDir])

  // ── Derived filter options ──
  const closerNames = useMemo(() => {
    const names = Array.from(new Set(calls.map(c => c.closer_name).filter(Boolean))) as string[]
    return names.sort()
  }, [calls])
  const setterNames = useMemo(() => {
    const names = Array.from(new Set(calls.map(c => c.setter_name).filter(Boolean))) as string[]
    return names.sort()
  }, [calls])

  // ── KPI counts (from all loaded calls, no status filter) ──
  const kpiCounts = useMemo(() => {
    const now = new Date()
    return {
      scheduled_future: calls.filter(c => c.status === 'Scheduled' && new Date(c.start_date) > now).length,
      'Showed Up':  calls.filter(c => c.status === 'Showed Up').length,
      'Cancelled':  calls.filter(c => c.status === 'Cancelled').length,
      'No show':    calls.filter(c => c.status === 'No show').length,
      'Rescheduled':calls.filter(c => c.status === 'Rescheduled').length,
    }
  }, [calls])

  // ── Filtered + sorted table data ──
  const tableData = useMemo(() => {
    const now = new Date()
    let data = calls

    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'scheduled_future') {
        data = data.filter(c => c.status === 'Scheduled' && new Date(c.start_date) > now)
      } else {
        data = data.filter(c => c.status === statusFilter)
      }
    }

    // Search
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      data = data.filter(c =>
        c.full_name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q)
      )
    }

    // Sort
    return [...data].sort((a, b) => {
      const av = (a[sortKey] ?? '') as string
      const bv = (b[sortKey] ?? '') as string
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }, [calls, statusFilter, debouncedSearch, sortKey, sortDir])

  const totalPages = Math.ceil(tableData.length / PAGE_SIZE)
  const pageRows = tableData.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // ── Sort handler ──
  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  function handleStatusCardClick(key: StatusFilter) {
    setStatusFilter(prev => prev === key ? 'all' : key)
  }

  type CallStatus = 'Showed Up' | 'Cancelled' | 'Rescheduled' | 'No show' | 'Scheduled'

  async function updateCallStatus(callId: string, newStatus: CallStatus) {
    setUpdatingId(callId)
    const { error } = await supabase.from('calls').update({ status: newStatus }).eq('id', callId)
    setUpdatingId(null)
    if (error) {
      toast.error('Error updating status')
      return
    }
    setCalls(prev => prev.map(c => c.id === callId ? { ...c, status: newStatus } : c))
    setDetailCall(prev => prev?.id === callId ? { ...prev, status: newStatus } : prev)
    toast.success(`Status updated to ${newStatus}`)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteLoading(true)
    const { error } = await supabase.from('calls').delete().eq('id', deleteTarget.id)
    setDeleteLoading(false)
    if (error) {
      toast.error('Failed to delete call')
      return
    }
    setCalls(prev => prev.filter(c => c.id !== deleteTarget.id))
    setUpcomingCalls(prev => prev.filter(c => c.id !== deleteTarget.id))
    setDeleteTarget(null)
    toast.success('Call deleted')
  }

  // ── Analytics: donut data ──
  const donutData = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const c of calls) {
      if (c.status === 'Scheduled') continue // skip future scheduled for the analytics
      counts[c.status] = (counts[c.status] ?? 0) + 1
    }
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }))
  }, [calls])

  // ── Analytics: weekly bar data (last 30 days only) ──
  const weeklyData = useMemo(() => {
    const thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate() - 30)
    const recent = calls.filter(c => new Date(c.start_date) >= thirtyAgo)
    interface WeekData {
      wk: string
      [key: string]: string | number
    }
    const weeks: Record<string, WeekData> = {}
    for (const c of recent) {
      const wk = weekStart(c.start_date)
      if (!weeks[wk]) weeks[wk] = { wk }
      weeks[wk][c.status] = ((weeks[wk][c.status] as number) ?? 0) + 1
    }
    return Object.values(weeks)
      .sort((a, b) => a.wk.localeCompare(b.wk))
      .map(w => ({ ...w, label: weekLabel(w.wk) }))
  }, [calls])

  const totalCalls = tableData.length

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto">
        {/* Closer role: prominent daily report CTA */}
        {isCloser && (
          <div className="mb-6 flex items-center justify-between bg-[#185FA5] rounded-xl px-5 py-4 text-white">
            <div>
              <p className="text-sm font-semibold">Hey{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}!</p>
              <p className="text-xs opacity-80 mt-0.5">Did you file today's report?</p>
            </div>
            <Link
              href="/equipo/closer/nuevo"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-[#185FA5] text-xs font-bold hover:bg-blue-50 transition-colors shrink-0"
            >
              File today's report →
            </Link>
          </div>
        )}
        <PageHeader title="Calls" description="Call pipeline and follow-up">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Preset buttons */}
            <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden">
              {(['7d', '30d', '90d', 'todo'] as Preset[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPreset(p)}
                  className={cn(
                    'px-2.5 py-1.5 text-xs font-medium transition-colors',
                    preset === p ? 'bg-[#185FA5] text-white' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                  )}
                >
                  {p === 'todo' ? 'All' : p}
                </button>
              ))}
            </div>

            {/* Closer filter */}
            <select
              value={selectedCloser}
              onChange={(e) => setSelectedCloser(e.target.value)}
              className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            >
              <option value="all">All closers</option>
              {closerNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>

            {/* Setter filter */}
            <select
              value={selectedSetter}
              onChange={(e) => setSelectedSetter(e.target.value)}
              className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            >
              <option value="all">All setters</option>
              {setterNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            >
              <option value="all">All statuses</option>
              <option value="scheduled_future">Upcoming</option>
              <option value="Showed Up">Showed Up</option>
              <option value="Cancelled">Cancelled</option>
              <option value="No show">No Show</option>
              <option value="Rescheduled">Rescheduled</option>
            </select>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or email..."
                className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md pl-7 pr-3 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 w-48"
              />
            </div>

            {/* New report button */}
            <Link
              href="/equipo/closer/nuevo"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#185FA5' }}
            >
              + New Report
            </Link>
          </div>
        </PageHeader>

        {/* Timezone indicator */}
        <div className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500 mb-4">
          <span>Showing times in <strong className="text-zinc-600 dark:text-zinc-400">{tzAbbr}</strong></span>
          <span>·</span>
          <Link href="/settings" className="text-blue-500 hover:underline">Change</Link>
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-5 gap-3">
              {[...Array(5)].map((_, i) => <div key={i} className="h-20 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-xl" />)}
            </div>
            <div className="h-64 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-xl" />
          </div>
        ) : (
          <>
            {/* ── Section 1: Status KPI Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              {KPI_CARDS.map(({ key, label, icon: Icon, iconColor, borderActive, borderIdle }) => {
                const count = kpiCounts[key as keyof typeof kpiCounts] ?? 0
                const active = statusFilter === key
                return (
                  <button
                    key={key}
                    onClick={() => handleStatusCardClick(key)}
                    className={cn(
                      'bg-white dark:bg-zinc-900 rounded-xl border-2 p-4 text-left transition-all hover:shadow-md',
                      active ? borderActive : borderIdle
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Icon className={cn('h-4 w-4', iconColor)} />
                      {active && <span className="text-xs text-zinc-400">✓ filter active</span>}
                    </div>
                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{count}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{label}</p>
                  </button>
                )
              })}
            </div>

            {/* ── Section 2: Upcoming Calls ── */}
            {upcomingCalls.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                  </span>
                  <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    Upcoming Calls
                    <span className="ml-2 text-xs font-normal text-zinc-400">— next 7 days</span>
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {upcomingCalls.map((call) => (
                    <UpcomingCallCard
                      key={call.id}
                      call={call}
                      onDetailClick={() => setDetailCall(call)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Section 3: Calls Table ── */}
            <Card className="mb-6">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">Call History</CardTitle>
                <span className="text-xs text-zinc-400">{totalCalls} calls found</span>
              </CardHeader>
              <CardContent>
                {tableData.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-sm text-zinc-400 dark:text-zinc-500">No calls found with these filters</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-zinc-200 dark:border-zinc-800">
                            <SortHeader label="Date/Time" sortKey="start_date" current={sortKey} dir={sortDir} onSort={handleSort} />
                            <SortHeader label="Name" sortKey="full_name" current={sortKey} dir={sortDir} onSort={handleSort} />
                            <th className="text-left py-2.5 px-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Type</th>
                            <SortHeader label="Status" sortKey="status" current={sortKey} dir={sortDir} onSort={handleSort} />
                            <SortHeader label="Closer" sortKey="closer_name" current={sortKey} dir={sortDir} onSort={handleSort} />
                            <th className="text-left py-2.5 px-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Setter</th>
                            <th className="text-left py-2.5 px-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Report</th>
                            <th className="text-left py-2.5 px-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pageRows.map((call) => {
                            const isUpcoming = new Date(call.start_date) > new Date()
                            const isActive = call.status === 'Scheduled' || call.status === 'Rescheduled'
                            const showBlue = isUpcoming && isActive
                            return (
                              <tr
                                key={call.id}
                                className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                              >
                                {/* Fecha */}
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <span className={cn('font-medium', showBlue ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-500 dark:text-zinc-400')}>
                                    {formatDateShort(call.start_date, timezone)} {tzAbbr}
                                  </span>
                                </td>
                                {/* Nombre */}
                                <td className="py-2.5 px-3">
                                  <button
                                    onClick={() => setDetailCall(call)}
                                    className="text-left hover:underline"
                                  >
                                    <p className="font-medium text-zinc-800 dark:text-zinc-200 whitespace-nowrap">{call.full_name}</p>
                                    {call.email && <p className="text-zinc-400 dark:text-zinc-500 truncate max-w-[160px]">{call.email}</p>}
                                  </button>
                                </td>
                                {/* Tipo */}
                                <td className="py-2.5 px-3">
                                  <CallTypePill type={call.call_type} />
                                </td>
                                {/* Estado */}
                                <td className="py-2.5 px-3">
                                  <div className="relative inline-block">
                                    <button
                                      disabled={updatingId === call.id}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setOpenPopoverId(prev => prev === call.id ? null : call.id)
                                      }}
                                      className="flex items-center gap-1 hover:opacity-70 transition-opacity disabled:opacity-40"
                                    >
                                      {updatingId === call.id
                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
                                        : <StatusPill status={call.status} />
                                      }
                                    </button>
                                    {openPopoverId === call.id && (
                                      <>
                                        <div className="fixed inset-0 z-10" onClick={() => setOpenPopoverId(null)} />
                                        <div className="absolute top-full left-0 mt-1 z-20 w-40 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg py-1">
                                          {STATUS_OPTIONS.map((s) => (
                                            <button
                                              key={s}
                                              onClick={async () => {
                                                setOpenPopoverId(null)
                                                await updateCallStatus(call.id, s as CallStatus)
                                              }}
                                              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                                            >
                                              <span className={cn('h-2 w-2 rounded-full flex-shrink-0', STATUS_DOT[s])} />
                                              {s}
                                              {s === call.status && <Check className="h-3 w-3 ml-auto text-zinc-400" />}
                                            </button>
                                          ))}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </td>
                                {/* Closer */}
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  {editingCell?.callId === call.id && editingCell?.field === 'closer_name' ? (
                                    <select
                                      autoFocus
                                      defaultValue={call.closer_name ?? ''}
                                      onChange={async (e) => {
                                        const val = e.target.value || null
                                        await supabase.from('calls').update({ closer_name: val }).eq('id', call.id)
                                        setCalls(prev => prev.map(c => c.id === call.id ? { ...c, closer_name: val } : c))
                                        setEditingCell(null)
                                        toast.success('Closer updated')
                                      }}
                                      onBlur={() => setEditingCell(null)}
                                      onKeyDown={(e) => e.key === 'Escape' && setEditingCell(null)}
                                      className="text-xs border rounded px-2 py-1 bg-white dark:bg-zinc-800 shadow-sm focus:outline-none"
                                    >
                                      <option value="">— No closer</option>
                                      {CLOSERS.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                  ) : (
                                    <span
                                      onClick={() => setEditingCell({ callId: call.id, field: 'closer_name' })}
                                      className="group flex items-center gap-1 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded px-1 py-0.5 transition-colors text-zinc-600 dark:text-zinc-400"
                                      title="Click to edit"
                                    >
                                      {call.closer_name ?? <span className="text-zinc-400">—</span>}
                                      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity flex-shrink-0" />
                                    </span>
                                  )}
                                </td>
                                {/* Setter */}
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  {editingCell?.callId === call.id && editingCell?.field === 'setter_name' ? (
                                    <select
                                      autoFocus
                                      defaultValue={call.setter_name ?? ''}
                                      onChange={async (e) => {
                                        const val = e.target.value || null
                                        await supabase.from('calls').update({ setter_name: val }).eq('id', call.id)
                                        setCalls(prev => prev.map(c => c.id === call.id ? { ...c, setter_name: val } : c))
                                        setEditingCell(null)
                                        toast.success('Setter updated')
                                      }}
                                      onBlur={() => setEditingCell(null)}
                                      onKeyDown={(e) => e.key === 'Escape' && setEditingCell(null)}
                                      className="text-xs border rounded px-2 py-1 bg-white dark:bg-zinc-800 shadow-sm focus:outline-none"
                                    >
                                      <option value="">— No setter</option>
                                      {SETTERS.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                  ) : (
                                    <span
                                      onClick={() => setEditingCell({ callId: call.id, field: 'setter_name' })}
                                      className="group flex items-center gap-1 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded px-1 py-0.5 transition-colors text-zinc-600 dark:text-zinc-400"
                                      title="Click to edit"
                                    >
                                      {call.setter_name ?? <span className="text-zinc-400">—</span>}
                                      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity flex-shrink-0" />
                                    </span>
                                  )}
                                </td>
                                {/* Reporte */}
                                <td className="py-2.5 px-3">
                                  {call.call_status ? (
                                    <span
                                      title={`Reportado por ${call.reported_by ?? ''}${call.reported_at ? ' el ' + new Date(call.reported_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : ''}`}
                                      className="inline-flex items-center gap-1 text-xs"
                                    >
                                      <span className={cn('h-2 w-2 rounded-full', call.call_status === 'Showed Up' ? 'bg-green-500' : 'bg-red-500')} />
                                    </span>
                                  ) : (
                                    <span className="h-2 w-2 rounded-full bg-zinc-300 dark:bg-zinc-600 inline-block" title="No report" />
                                  )}
                                </td>
                                {/* Acciones */}
                                <td className="py-2.5 px-3">
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => setDetailCall(call)}
                                      className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                                      title="View details"
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                    </button>
                                    {call.meeting_url ? (
                                      <a
                                        href={call.meeting_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-1.5 rounded-md hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 dark:text-green-400 transition-colors"
                                        title="Join call"
                                      >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                      </a>
                                    ) : (
                                      <span className="p-1.5 text-zinc-300 dark:text-zinc-700 cursor-not-allowed">
                                        <ExternalLink className="h-3.5 w-3.5" />
                                      </span>
                                    )}
                                    <button
                                      onClick={() => setDeleteTarget(call)}
                                      className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                      title="Delete call"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                        <span className="text-xs text-zinc-400">
                          Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, tableData.length)} of {tableData.length}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={page === 0}
                            className="p-1 rounded disabled:opacity-30 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <span className="text-xs text-zinc-500 px-1">{page + 1} / {totalPages}</span>
                          <button
                            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                            disabled={page >= totalPages - 1}
                            className="p-1 rounded disabled:opacity-30 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* ── Section 5: Analytics Charts ── */}
            {calls.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                {/* Donut */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">Calls by status — selected period</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {donutData.length === 0 ? (
                      <div className="h-48 flex items-center justify-center">
                        <p className="text-xs text-zinc-400">No status data</p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie
                            data={donutData}
                            cx="50%"
                            cy="50%"
                            innerRadius={48}
                            outerRadius={76}
                            dataKey="value"
                            paddingAngle={2}
                          >
                            {donutData.map((entry, i) => (
                              <Cell key={i} fill={PIE_COLORS[entry.name] ?? '#94a3b8'} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(v, name) => [`${v} calls`, name]}
                            contentStyle={{ fontSize: 11 }}
                          />
                          <Legend
                            formatter={(v) => <span className="text-xs">{v}</span>}
                            iconType="circle"
                            iconSize={8}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                {/* Weekly bar */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">Call volume by week — last 30 days</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {weeklyData.length === 0 ? (
                      <div className="h-48 flex items-center justify-center">
                        <p className="text-xs text-zinc-400">No recent data</p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={weeklyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ fontSize: 11 }} />
                          <Legend formatter={(v) => <span className="text-xs">{v}</span>} />
                          <Bar dataKey="Showed Up" stackId="a" fill="#3B6D11" maxBarSize={36} />
                          <Bar dataKey="Cancelled" stackId="a" fill="#A32D2D" maxBarSize={36} />
                          <Bar dataKey="No show" stackId="a" fill="#BA7517" maxBarSize={36} />
                          <Bar dataKey="Rescheduled" stackId="a" fill="#534AB7" maxBarSize={36} />
                          <Bar dataKey="Scheduled" stackId="a" fill="#185FA5" radius={[3, 3, 0, 0]} maxBarSize={36} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-6 w-full max-w-sm animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Delete this call?</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5">
              Are you sure you want to delete the call with{' '}
              <strong className="text-zinc-700 dark:text-zinc-300">{deleteTarget.full_name}</strong>?
              {' '}This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="px-3 py-1.5 text-xs rounded-md font-medium bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-60"
              >
                {deleteLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      <CallDetailModal
        call={detailCall}
        onClose={() => setDetailCall(null)}
        onStatusChange={(callId, newStatus) => {
          setCalls(prev => prev.map(c => c.id === callId ? { ...c, status: newStatus as CallStatus } : c))
        }}
      />
    </PageTransition>
  )
}
