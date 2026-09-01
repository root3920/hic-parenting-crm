'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useProfile } from '@/hooks/useProfile'
import { PageHeader } from '@/components/layout/PageHeader'
import { PageTransition } from '@/components/motion/PageTransition'
import { EmptyState } from '@/components/shared/EmptyState'
import { KpiGoalCard } from '@/components/shared/KpiGoalCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import { CloserDailyReport, CallSaleMatch } from '@/types'
import { Plus, ChevronLeft, ChevronRight, Download, Pencil, Trash2, Link2, Unlink } from 'lucide-react'
import { LinkSaleModal } from '@/components/closer/LinkSaleModal'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { GOALS, GoalConfig } from '@/lib/goals'
import { getCurrentWeekRange } from '@/lib/dateUtils'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 10

type Preset = 'week' | '7d' | '30d' | '90d' | 'todo' | 'custom'

interface CallSummary {
  id: string
  full_name: string
  email: string | null
  status: string
  call_status: string | null
  call_type: string | null
  start_date: string
  closer_name: string
}

interface MatchWithCost {
  call_id: string
  transaction_id: string
  tx_cost: number
}

/** Normalize email or fall back to name for grouping by unique prospect */
function prospectKey(call: CallSummary): string {
  if (call.email) return call.email.trim().toLowerCase()
  return call.full_name.trim().toLowerCase()
}

function getDateRange(preset: Exclude<Preset, 'custom'>) {
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  if (preset === 'week') {
    const w = getCurrentWeekRange()
    return { from: w.start, to: w.end, days: 7 }
  }
  if (preset === '7d') {
    const from = new Date(today); from.setDate(today.getDate() - 6)
    return { from: fmt(from), to: fmt(today), days: 7 }
  }
  if (preset === '30d') {
    const from = new Date(today); from.setDate(today.getDate() - 29)
    return { from: fmt(from), to: fmt(today), days: 30 }
  }
  if (preset === '90d') {
    const from = new Date(today); from.setDate(today.getDate() - 89)
    return { from: fmt(from), to: fmt(today), days: 90 }
  }
  return { from: '2020-01-01', to: fmt(today), days: 365 * 5 }
}

function s(arr: CloserDailyReport[], key: keyof CloserDailyReport) {
  return arr.reduce((acc, r) => acc + ((r[key] as number) ?? 0), 0)
}

function safeDiv(num: number, den: number) { return den > 0 ? num / den : NaN }

function fmtPct(v: number, dec = 1) { return isNaN(v) ? '0%' : `${v.toFixed(dec)}%` }

function fmtCash(v: number) {
  return isNaN(v) || v === 0 ? '$0' : `$${Math.round(v).toLocaleString()}`
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function RevenueCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className={cn('rounded-xl border p-5', color)}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-2">{label}</p>
      <p className="text-3xl font-bold mb-1">{value}</p>
      {sub && <p className="text-xs opacity-60">{sub}</p>}
    </div>
  )
}

function VolumeCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      {sub && <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function closeRateColor(v: number) {
  if (isNaN(v)) return 'text-zinc-400'
  if (v >= 30 && v <= 40) return 'text-green-600 dark:text-green-400'
  if (v >= 25) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function showRateColor(v: number) {
  if (isNaN(v)) return 'text-zinc-400'
  if (v >= 65) return 'text-green-600 dark:text-green-400'
  if (v >= 50) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function ReportDetail({ report, onClose }: { report: CloserDailyReport; onClose: () => void }) {
  // Show rate = showed / total, Offer rate = offers / showed, Close rate = won / showed
  const showR = safeDiv(report.showed_meetings, report.total_meetings) * 100
  const offerR = safeDiv(report.offers_proposed, report.showed_meetings) * 100
  const closeR = safeDiv(report.won_deals, report.showed_meetings) * 100

  function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
    if (value === null || value === undefined || value === '') return null
    return (
      <div className="flex items-start gap-2 py-1 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
        <span className="text-xs text-zinc-400 w-40 shrink-0">{label}</span>
        <span className="text-xs text-zinc-700 dark:text-zinc-300 font-medium">{String(value)}</span>
      </div>
    )
  }

  return (
    <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="text-base">{report.closer_name} · {formatDate(report.date)}</DialogTitle>
      </DialogHeader>
      <div className="space-y-5 mt-2">
        {/* KPI summary */}
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'Show Rate', value: fmtPct(showR) },
            { label: 'Offer Rate', value: fmtPct(offerR) },
            { label: 'Close Rate', value: fmtPct(closeR) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-2">
              <p className="text-xs text-zinc-400">{label}</p>
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
            </div>
          ))}
        </div>
        {/* Meetings */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#ffbd59] mb-2">Meetings</p>
          <Row label="Total meetings" value={report.total_meetings} />
          <Row label="Showed" value={report.showed_meetings} />
          <Row label="Follow-up" value={report.followup_meetings} />
          <Row label="Cancelled" value={report.cancelled_meetings} />
          <Row label="No-show" value={report.no_show_meetings} />
          <Row label="Rescheduled" value={report.rescheduled_meetings} />
        </div>
        {/* Pipeline */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-green-600 mb-2">Offers & Closes</p>
          <Row label="Total offers" value={report.total_offers} />
          <Row label="Proposed offers" value={report.offers_proposed} />
          <Row label="Won deals" value={report.won_deals} />
          <Row label="Lost deals" value={report.lost_deals} />
        </div>
        {/* Cash */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-amber-600 mb-2">Revenue</p>
          <Row label="Cash collected" value={fmtCash(report.cash_collected)} />
          <Row label="Recurring / pipeline" value={fmtCash(report.recurrent_cash)} />
        </div>
        {/* Feedback */}
        {report.feedback && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">Feedback / Notes</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap">{report.feedback}</p>
          </div>
        )}
      </div>
    </DialogContent>
  )
}

// ─── Edit Modal ──────────────────────────────────────────────────────────────

function EditCloserReportModal({ report, onClose, onSaved }: { report: CloserDailyReport; onClose: () => void; onSaved: (updated: CloserDailyReport) => void }) {
  const [form, setForm] = useState({
    date: report.date || '',
    closer_name: report.closer_name || '',
    showed_meetings: String(report.showed_meetings ?? ''),
    cancelled_meetings: String(report.cancelled_meetings ?? ''),
    no_show_meetings: String(report.no_show_meetings ?? ''),
    rescheduled_meetings: String(report.rescheduled_meetings ?? ''),
    total_meetings: String(report.total_meetings ?? ''),
    offers_proposed: String(report.offers_proposed ?? ''),
    won_deals: String(report.won_deals ?? ''),
    cash_collected: String(report.cash_collected ?? ''),
    recurrent_cash: String(report.recurrent_cash ?? ''),
    feedback: report.feedback ?? '',
  })
  const [saving, setSaving] = useState(false)

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }
  function n(v: string) { return parseInt(v) || 0 }
  function nf(v: string) { return parseFloat(v) || 0 }

  async function handleSave() {
    if (!form.date || !form.closer_name) {
      toast.error('Date and closer name are required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/team/closer/reports/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: form.date,
          closer_name: form.closer_name,
          showed_meetings: n(form.showed_meetings),
          cancelled_meetings: n(form.cancelled_meetings),
          no_show_meetings: n(form.no_show_meetings),
          rescheduled_meetings: n(form.rescheduled_meetings),
          total_meetings: n(form.total_meetings),
          offers_proposed: n(form.offers_proposed),
          won_deals: n(form.won_deals),
          cash_collected: nf(form.cash_collected),
          recurrent_cash: nf(form.recurrent_cash),
          feedback: form.feedback || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || 'Error updating report')
        return
      }
      const updated = await res.json()
      toast.success('Report updated successfully')
      onSaved(updated)
    } catch {
      toast.error('Error updating report')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30 focus:border-[#ffbd59]'

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="text-base">Edit Report</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 mt-2">
        {/* Meta */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Date</label>
            <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Closer</label>
            <input type="text" value={form.closer_name} onChange={(e) => set('closer_name', e.target.value)} className={inputCls} />
          </div>
        </div>

        {/* Meetings */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#ffbd59] mb-2">Meetings</p>
          <div className="grid grid-cols-3 gap-3 mb-2">
            <div><label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Total Meetings</label><input type="number" min={0} value={form.total_meetings} onChange={(e) => set('total_meetings', e.target.value)} className={inputCls} /></div>
            <div><label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Showed</label><input type="number" min={0} value={form.showed_meetings} onChange={(e) => set('showed_meetings', e.target.value)} className={inputCls} /></div>
            <div><label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Cancelled</label><input type="number" min={0} value={form.cancelled_meetings} onChange={(e) => set('cancelled_meetings', e.target.value)} className={inputCls} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">No Show</label><input type="number" min={0} value={form.no_show_meetings} onChange={(e) => set('no_show_meetings', e.target.value)} className={inputCls} /></div>
            <div><label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Rescheduled</label><input type="number" min={0} value={form.rescheduled_meetings} onChange={(e) => set('rescheduled_meetings', e.target.value)} className={inputCls} /></div>
          </div>
        </div>

        {/* Offers & Revenue */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-green-600 mb-2">Offers & Revenue</p>
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div><label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Offers Proposed</label><input type="number" min={0} value={form.offers_proposed} onChange={(e) => set('offers_proposed', e.target.value)} className={inputCls} /></div>
            <div><label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Won Deals</label><input type="number" min={0} value={form.won_deals} onChange={(e) => set('won_deals', e.target.value)} className={inputCls} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Cash Collected ($)</label><input type="number" min={0} step="0.01" value={form.cash_collected} onChange={(e) => set('cash_collected', e.target.value)} className={inputCls} /></div>
            <div><label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Recurrent Pipeline ($)</label><input type="number" min={0} step="0.01" value={form.recurrent_cash} onChange={(e) => set('recurrent_cash', e.target.value)} className={inputCls} /></div>
          </div>
        </div>

        {/* Feedback */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">Feedback</p>
          <textarea
            value={form.feedback}
            onChange={(e) => set('feedback', e.target.value)}
            rows={3}
            className={inputCls}
            placeholder="Notes or feedback..."
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-xs rounded-lg bg-[#ffbd59] hover:bg-[#e5a94f] text-[#1a1a2e] font-semibold transition-colors disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>
    </DialogContent>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CloserDashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const { profile } = useProfile()
  const isAdmin = profile?.role === 'admin'
  const [reports, setReports] = useState<CloserDailyReport[]>([])
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState<Preset>('week')
  const [customFrom, setCustomFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().split('T')[0] })
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().split('T')[0])
  const [selectedCloser, setSelectedCloser] = useState('All')
  const [page, setPage] = useState(0)
  const [detailReport, setDetailReport] = useState<CloserDailyReport | null>(null)
  const [editTarget, setEditTarget] = useState<CloserDailyReport | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CloserDailyReport | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [callsData, setCallsData] = useState<CallSummary[]>([])
  const [matchesData, setMatchesData] = useState<MatchWithCost[]>([])
  const [linkCall, setLinkCall] = useState<CallSummary | null>(null)
  const [callsPage, setCallsPage] = useState(0)

  const weekRange = useMemo(() => getCurrentWeekRange(), [])

  const { from: fromDate, to: toDate, days: rangeDays } = useMemo(() => {
    if (preset === 'custom') {
      const diffMs = new Date(customTo).getTime() - new Date(customFrom).getTime()
      const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1)
      return { from: customFrom, to: customTo, days }
    }
    return getDateRange(preset)
  }, [preset, customFrom, customTo])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [reportsRes, callsRes, matchesRes] = await Promise.all([
      supabase
        .from('closer_daily_reports')
        .select('*')
        .gte('date', fromDate)
        .lte('date', toDate)
        .order('date', { ascending: false }),
      supabase
        .from('calls')
        .select('id, full_name, email, status, call_status, call_type, start_date, closer_name')
        .gte('start_date', fromDate)
        .lte('start_date', toDate + 'T23:59:59'),
      supabase
        .from('call_sale_matches')
        .select('call_id, transaction_id, transactions(cost)')
    ])
    setReports(reportsRes.data ?? [])
    setCallsData((callsRes.data ?? []) as CallSummary[])
    // Flatten matches with transaction cost
    // Supabase returns the joined row as an object (1-to-1 FK) or array
    const rawMatches = matchesRes.data ?? []
    setMatchesData(rawMatches.map((m: any) => ({
      call_id: m.call_id as string,
      transaction_id: m.transaction_id as string,
      tx_cost: (Array.isArray(m.transactions) ? m.transactions[0]?.cost : m.transactions?.cost) ?? 0,
    })))
    setLoading(false)
  }, [supabase, fromDate, toDate])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/team/closer/reports/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || 'Error deleting report')
        return
      }
      setReports((prev) => prev.filter((r) => r.id !== deleteTarget.id))
      toast.success('Report deleted')
      setDeleteTarget(null)
    } catch {
      toast.error('Error deleting report')
    } finally {
      setDeleting(false)
    }
  }

  // Derive matchedCallIds set from matchesData
  const matchedCallIds = useMemo(
    () => new Set(matchesData.map((m) => m.call_id)),
    [matchesData]
  )

  const closerNames = useMemo(() => {
    const fromReports = reports.map((r) => r.closer_name)
    const fromCalls = callsData.map((c) => c.closer_name).filter(Boolean)
    const names = Array.from(new Set([...fromReports, ...fromCalls])).sort()
    return ['All', ...names]
  }, [reports, callsData])

  const filtered = useMemo(
    () => selectedCloser === 'All' ? reports : reports.filter((r) => r.closer_name === selectedCloser),
    [reports, selectedCloser]
  )

  // ── Filtered calls for the selected closer ──
  const filteredCalls = useMemo(() => {
    if (selectedCloser === 'All') return callsData
    return callsData.filter((c) => c.closer_name === selectedCloser)
  }, [callsData, selectedCloser])

  // ── Dynamic goal for showed calls ──
  const showedCallsGoal = useMemo((): GoalConfig => {
    const weeks = Math.max(1, rangeDays / 7)
    return {
      target: Math.round(weeks * 6),
      targetMax: Math.round(weeks * 10),
      alert: Math.round(weeks * 3),
      unit: '',
      label: 'Showed Calls',
      description: 'Total "Showed Up" calls in selected period',
    }
  }, [rangeDays])

  // ── KPIs from UNIQUE PROSPECTS (calls grouped by email) ──
  const prospectKPIs = useMemo(() => {
    // Group calls by unique prospect key
    const byProspect: Record<string, CallSummary[]> = {}
    for (const c of filteredCalls) {
      const key = prospectKey(c)
      if (!byProspect[key]) byProspect[key] = []
      byProspect[key].push(c)
    }

    const totalUniqueProspects = Object.keys(byProspect).length

    // Count unique prospects that had at least one call with each status
    let showedProspects = 0
    let noShowProspects = 0
    let cancelledProspects = 0
    let rescheduledProspects = 0

    for (const calls of Object.values(byProspect)) {
      const statuses = new Set(calls.map((c) => c.status))
      if (statuses.has('Showed Up')) showedProspects++
      if (statuses.has('No show')) noShowProspects++
      if (statuses.has('Cancelled')) cancelledProspects++
      if (statuses.has('Rescheduled')) rescheduledProspects++
    }

    // Showed calls count (total individual calls with Showed Up, for the goal card)
    const showedCallsCount = filteredCalls.filter((c) => c.status === 'Showed Up').length

    const showRate = Math.min(safeDiv(showedProspects, totalUniqueProspects) * 100, 100)
    const noShowRate = safeDiv(noShowProspects, totalUniqueProspects) * 100
    const cancelRate = safeDiv(cancelledProspects, totalUniqueProspects) * 100

    // ── Won Deals / Cash / Close Rate from call_sale_matches ──
    // Filter matches to only calls in the current filteredCalls
    const filteredCallIds = new Set(filteredCalls.map((c) => c.id))
    const periodMatches = matchesData.filter((m) => filteredCallIds.has(m.call_id))

    // Build a map of call_id -> prospect key for reverse lookup
    const callIdToProspect: Record<string, string> = {}
    for (const c of filteredCalls) {
      callIdToProspect[c.id] = prospectKey(c)
    }

    // Won Deals = unique prospects with at least one match
    const wonProspectKeys = new Set<string>()
    let cashCollected = 0
    for (const m of periodMatches) {
      const pk = callIdToProspect[m.call_id]
      if (pk) wonProspectKeys.add(pk)
      cashCollected += m.tx_cost
    }
    const wonDeals = wonProspectKeys.size

    const closeRate = Math.min(safeDiv(wonDeals, totalUniqueProspects) * 100, 100)
    const valuePerMeeting = safeDiv(cashCollected, totalUniqueProspects)

    // ── Offers from closer_daily_reports (kept as-is) ──
    const offersProposed = s(filtered, 'offers_proposed')
    const offerRate = Math.min(safeDiv(offersProposed, showedProspects) * 100, 100)

    // ── Recurring cash from closer_daily_reports ──
    const recurrentCash = s(filtered, 'recurrent_cash')

    return {
      totalUniqueProspects,
      showedProspects,
      noShowProspects,
      cancelledProspects,
      rescheduledProspects,
      showedCallsCount,
      showRate,
      noShowRate,
      cancelRate,
      offersProposed,
      offerRate,
      wonDeals,
      cashCollected,
      recurrentCash,
      closeRate,
      valuePerMeeting,
    }
  }, [filteredCalls, matchesData, filtered])

  // ── Avg calls before closing ──
  const avgCallsBeforeClose = useMemo(() => {
    // For each won prospect, count how many calls they had before (and including) the matched call
    const filteredCallIds = new Set(filteredCalls.map((c) => c.id))
    const periodMatches = matchesData.filter((m) => filteredCallIds.has(m.call_id))

    if (periodMatches.length === 0) return NaN

    // Group all calls by prospect key (not just filtered — include all calls ever)
    // But we only have filteredCalls in memory. For now, compute from filteredCalls.
    const byProspect: Record<string, CallSummary[]> = {}
    for (const c of filteredCalls) {
      const key = prospectKey(c)
      if (!byProspect[key]) byProspect[key] = []
      byProspect[key].push(c)
    }

    // For each matched call, find the prospect and count calls <= that call's date
    const callIdToCall: Record<string, CallSummary> = {}
    for (const c of filteredCalls) callIdToCall[c.id] = c

    const prospectCounts: number[] = []
    const countedProspects = new Set<string>()

    for (const m of periodMatches) {
      const matchedCall = callIdToCall[m.call_id]
      if (!matchedCall) continue
      const pk = prospectKey(matchedCall)
      if (countedProspects.has(pk)) continue
      countedProspects.add(pk)

      const prospectCalls = byProspect[pk] ?? []
      const matchDate = new Date(matchedCall.start_date)
      const callsBeforeOrAt = prospectCalls.filter((c) => new Date(c.start_date) <= matchDate).length
      prospectCounts.push(Math.max(1, callsBeforeOrAt))
    }

    if (prospectCounts.length === 0) return NaN
    return prospectCounts.reduce((a, b) => a + b, 0) / prospectCounts.length
  }, [filteredCalls, matchesData])

  // ── Revenue (uses prospect-based KPIs) ──
  const revenue = useMemo(() => ({
    cash: prospectKPIs.cashCollected,
    recurrent: prospectKPIs.recurrentCash,
    perMeeting: prospectKPIs.valuePerMeeting,
    won: prospectKPIs.wonDeals,
  }), [prospectKPIs])

  // ── Chart data ──
  const cashChartData = useMemo(() => {
    const byDate: Record<string, { date: string; cash_collected: number }> = {}
    for (const r of [...filtered].reverse()) {
      if (!byDate[r.date]) byDate[r.date] = { date: formatDate(r.date), cash_collected: 0 }
      byDate[r.date].cash_collected += r.cash_collected
    }
    return Object.values(byDate)
  }, [filtered])

  const maxCash = useMemo(() => Math.max(...cashChartData.map((d) => d.cash_collected), 1), [cashChartData])

  const funnelChartData = useMemo(() => {
    const byDate: Record<string, {
      date: string
      total_meetings: number
      showed_meetings: number
      offers_proposed: number
      won_deals: number
    }> = {}
    for (const r of [...filtered].reverse()) {
      if (!byDate[r.date]) byDate[r.date] = { date: formatDate(r.date), total_meetings: 0, showed_meetings: 0, offers_proposed: 0, won_deals: 0 }
      byDate[r.date].total_meetings += r.total_meetings
      byDate[r.date].showed_meetings += r.showed_meetings
      byDate[r.date].offers_proposed += r.offers_proposed
      byDate[r.date].won_deals += r.won_deals
    }
    return Object.values(byDate)
  }, [filtered])

  // ── Closer comparison (only when "Todos") ──
  const closerComparison = useMemo(() => {
    if (selectedCloser !== 'All') return []
    const byCloser: Record<string, { meetings: number; showed: number; offers: number; won: number; cash: number }> = {}
    for (const r of reports) {
      if (!byCloser[r.closer_name]) byCloser[r.closer_name] = { meetings: 0, showed: 0, offers: 0, won: 0, cash: 0 }
      byCloser[r.closer_name].meetings += r.total_meetings
      byCloser[r.closer_name].showed   += r.showed_meetings
      byCloser[r.closer_name].offers   += r.offers_proposed
      byCloser[r.closer_name].won      += r.won_deals
      byCloser[r.closer_name].cash     += r.cash_collected
    }
    return Object.entries(byCloser).map(([name, d]) => ({
      closer_name: name, ...d,
    })).sort((a, b) => b.cash - a.cash)
  }, [reports, selectedCloser])

  const CALLS_PAGE_SIZE = 10
  const callsTotalPages = Math.ceil(filteredCalls.length / CALLS_PAGE_SIZE)
  const callsPageRows = filteredCalls.slice(callsPage * CALLS_PAGE_SIZE, (callsPage + 1) * CALLS_PAGE_SIZE)

  // ── Pagination ──
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto">
        <PageHeader title="Closing Team" description={preset === 'week' ? `Current week: ${weekRange.label} (Fri → Thu)` : 'Daily closer team performance'}>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden">
              {(['week', '7d', '30d', '90d', 'todo', 'custom'] as Preset[]).map((p) => (
                <button
                  key={p}
                  onClick={() => { setPreset(p); setPage(0) }}
                  className={cn(
                    'px-2.5 py-1.5 text-xs font-medium transition-colors',
                    preset === p
                      ? p === 'week' ? 'bg-[#89bcef] text-[#1a1a2e]' : 'bg-[#ffbd59] text-[#1a1a2e]'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                  )}
                >
                  {p === 'week' ? 'Week' : p === 'todo' ? 'All' : p === 'custom' ? 'Custom' : p}
                </button>
              ))}
            </div>
            {preset === 'custom' && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
                <span className="text-xs text-zinc-400">→</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>
            )}
            <select
              value={selectedCloser}
              onChange={(e) => { setSelectedCloser(e.target.value); setPage(0) }}
              className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            >
              {closerNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {!loading && (
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                {filtered.length} records
              </span>
            )}
            <Link
              href="/equipo/closer/nuevo"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#ffbd59' }}
            >
              <Plus className="h-3.5 w-3.5" />
              New Report
            </Link>
            <button
              onClick={() => { const t = document.title; document.title = `Closing Team — ${fromDate} to ${toDate}`; window.print(); document.title = t }}
              className="no-print inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Export PDF
            </button>
          </div>
        </PageHeader>

        <div className="print-header">
          <img src="/logo.png" width="120" alt="HIC Parenting" />
          <h1 style={{ fontSize: '18px', marginTop: '8px', fontWeight: 600 }}>Closing Team — Performance Report</h1>
          <p style={{ fontSize: '12px', color: '#666' }}>Period: {fromDate} — {toDate}</p>
          <p style={{ fontSize: '12px', color: '#666' }}>Generated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-28 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-xl" />)}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-20 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-xl" />)}
            </div>
          </div>
        ) : filtered.length === 0 && callsData.length === 0 ? (
          <EmptyState
            title="No reports in this period"
            description="Create the first closing report to see metrics here."
            icon={<Plus className="h-10 w-10" />}
          />
        ) : (
          <>
            {/* ── Section 1a: KPI Goal Cards — unique prospects ── */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-1">
              <KpiGoalCard
                label={GOALS.closing.showRate.label}
                description="Unique prospects that showed up at least once"
                value={prospectKPIs.showRate}
                unit="%"
                goal={GOALS.closing.showRate}
              />
              <VolumeCard label="No Shows" value={prospectKPIs.noShowProspects} sub={`${fmtPct(prospectKPIs.noShowRate)} of ${prospectKPIs.totalUniqueProspects} prospects`} />
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">Cancelled</p>
                <p className={cn('text-2xl font-bold', prospectKPIs.cancelRate < 20 ? 'text-green-600 dark:text-green-400' : prospectKPIs.cancelRate <= 35 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400')}>
                  {fmtPct(prospectKPIs.cancelRate)}
                </p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{prospectKPIs.cancelledProspects} of {prospectKPIs.totalUniqueProspects} prospects</p>
              </div>
              <KpiGoalCard
                label="Showed Calls"
                description='Total "Showed Up" calls in selected period'
                value={prospectKPIs.showedCallsCount}
                unit=""
                goal={showedCallsGoal}
                decimals={0}
              />
              <VolumeCard label="Rescheduled" value={prospectKPIs.rescheduledProspects} sub={`of ${prospectKPIs.totalUniqueProspects} prospects`} />
              {/* NEW KPI: Avg calls before closing */}
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">Avg Calls to Close</p>
                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  {isNaN(avgCallsBeforeClose) ? '—' : avgCallsBeforeClose.toFixed(1)}
                </p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">calls avg before closing</p>
              </div>
            </div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 text-right mb-5">Based on {prospectKPIs.totalUniqueProspects} unique prospects ({filteredCalls.length} calls)</p>

            {/* ── Section 1b: KPI Goal Cards — offers & sales ── */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-1">
              <VolumeCard label="Offers Made" value={prospectKPIs.offersProposed} sub="from closer reports" />
              <KpiGoalCard
                label={GOALS.closing.offerRate.label}
                description="Offers / showed prospects"
                value={prospectKPIs.offerRate}
                unit="%"
                goal={GOALS.closing.offerRate}
              />
              <KpiGoalCard
                label={GOALS.closing.closeRate.label}
                description="Won prospects / total unique prospects"
                value={prospectKPIs.closeRate}
                unit="%"
                goal={GOALS.closing.closeRate}
              />
              <VolumeCard label="Won Deals" value={prospectKPIs.wonDeals} sub={`${prospectKPIs.wonDeals} unique prospects closed`} />
              <VolumeCard label="Cash Collected" value={fmtCash(prospectKPIs.cashCollected)} sub="from linked transactions" />
            </div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 text-right mb-6">Won Deals &amp; Cash from call↔sale links · Offers from closer reports</p>

            {/* ── Section 2: Revenue Cards ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <RevenueCard
                label="Cash Collected"
                value={fmtCash(revenue.cash)}
                sub={`${revenue.won} closed deals`}
                color="bg-[#ffbd59] text-[#1a1a2e] border-blue-700"
              />
              <RevenueCard
                label="Recurring Pipeline"
                value={fmtCash(revenue.recurrent)}
                sub="recurring revenue / pipeline"
                color="bg-emerald-600 text-white border-emerald-700"
              />
              <RevenueCard
                label="Value per meeting"
                value={isNaN(revenue.perMeeting) ? '—' : fmtCash(revenue.perMeeting)}
                sub="per effective meeting"
                color="bg-purple-600 text-white border-purple-700"
              />
            </div>

            {/* ── Section 3: Volume Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <VolumeCard
                label="Unique Prospects"
                value={prospectKPIs.totalUniqueProspects}
                sub={`${fmtPct(prospectKPIs.showRate)} show rate`}
              />
              <VolumeCard
                label="Showed"
                value={prospectKPIs.showedProspects}
                sub={`${prospectKPIs.showedCallsCount} total calls showed`}
              />
              <VolumeCard
                label="Won Deals"
                value={prospectKPIs.wonDeals}
                sub={`${fmtPct(prospectKPIs.closeRate)} close rate`}
              />
              <VolumeCard
                label="No-Shows"
                value={prospectKPIs.noShowProspects}
                sub={`${fmtPct(prospectKPIs.noShowRate)} of prospects`}
              />
            </div>

            {/* ── Section 4: Charts ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Cash collected per day</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={cashChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false}
                        tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        formatter={(v) => [fmtCash(v as number), 'Cash']}
                        contentStyle={{ fontSize: 11 }}
                      />
                      <Bar dataKey="cash_collected" maxBarSize={36} radius={[3, 3, 0, 0]}>
                        {cashChartData.map((entry, i) => {
                          const ratio = entry.cash_collected / maxCash
                          const fill = ratio >= 0.7 ? '#ffbd59' : ratio >= 0.3 ? '#3B82F6' : '#93C5FD'
                          return <Cell key={i} fill={fill} />
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Closing funnel</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={funnelChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                      <Legend formatter={(v) => <span className="text-xs">{
                        v === 'total_meetings' ? 'Total' : v === 'showed_meetings' ? 'Showed' : v === 'offers_proposed' ? 'Offers' : 'Won'
                      }</span>} />
                      <Line type="monotone" dataKey="total_meetings" stroke="#71717a" strokeWidth={2} strokeDasharray="4 2" dot={false} />
                      <Line type="monotone" dataKey="showed_meetings" stroke="#ffbd59" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="offers_proposed" stroke="#EF9F27" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="won_deals" stroke="#22C55E" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* ── Section 5b: Calls & Sale Links ── */}
            {filteredCalls.length > 0 && (
              <Card className="mb-6">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-semibold">Calls & Sale Links</CardTitle>
                  <span className="text-xs text-zinc-400">
                    {filteredCalls.filter((c) => matchedCallIds.has(c.id)).length} / {filteredCalls.length} linked
                  </span>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-zinc-200 dark:border-zinc-800">
                          {['Date', 'Prospect', 'Email', 'Status', 'Closer', 'Sale Link', ''].map((h) => (
                            <th key={h} className="text-left py-2.5 px-3 font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {callsPageRows.map((c) => {
                          const isMatched = matchedCallIds.has(c.id)
                          return (
                            <tr key={c.id} className="group border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                              <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                                {formatDate(c.start_date)}
                              </td>
                              <td className="py-2.5 px-3 font-medium text-zinc-800 dark:text-zinc-200 whitespace-nowrap">
                                {c.full_name}
                              </td>
                              <td className="py-2.5 px-3 text-zinc-500 dark:text-zinc-400 truncate max-w-[160px]">
                                {c.email || '—'}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className={cn(
                                  'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
                                  c.status === 'Showed Up' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                  c.status === 'No show' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                  c.status === 'Cancelled' ? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' :
                                  c.status === 'Rescheduled' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                                  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                )}>
                                  {c.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                                {c.closer_name}
                              </td>
                              <td className="py-2.5 px-3">
                                {isMatched ? (
                                  <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 text-[10px] font-medium">
                                    <Link2 className="h-3 w-3" /> Linked
                                  </span>
                                ) : (
                                  <span className="text-zinc-400 text-[10px]">No match</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                {!isMatched && (
                                  <button
                                    onClick={() => setLinkCall(c)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-[#ffbd59]/10 text-[#e5a94f] hover:bg-[#ffbd59]/20 transition-colors"
                                  >
                                    <Link2 className="h-3 w-3" />
                                    Link Sale
                                  </button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {callsTotalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                      <span className="text-xs text-zinc-400">
                        Showing {callsPage * CALLS_PAGE_SIZE + 1}–{Math.min((callsPage + 1) * CALLS_PAGE_SIZE, filteredCalls.length)} of {filteredCalls.length}
                      </span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setCallsPage((p) => Math.max(0, p - 1))} disabled={callsPage === 0} className="p-1 rounded disabled:opacity-30 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="text-xs text-zinc-500 px-1">{callsPage + 1} / {callsTotalPages}</span>
                        <button onClick={() => setCallsPage((p) => Math.min(callsTotalPages - 1, p + 1))} disabled={callsPage >= callsTotalPages - 1} className="p-1 rounded disabled:opacity-30 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ── Section 6: Historial ── */}
            <Card className="mb-8">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">Full History</CardTitle>
                <span className="text-xs text-zinc-400">{filtered.length} records</span>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800">
                        {['Date', 'Closer', 'Meetings', 'Show%', 'Offer%', 'Close%', 'Cash', 'Won', ''].map((h) => (
                          <th key={h} className="text-left py-2.5 px-3 font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r) => {
                        const showR = safeDiv(r.showed_meetings, r.total_meetings) * 100
                        const offerR = safeDiv(r.offers_proposed, r.showed_meetings) * 100
                        const closeR = safeDiv(r.won_deals, r.offers_proposed) * 100
                        return (
                          <tr key={r.id} className="group border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                            <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">{formatDate(r.date)}</td>
                            <td className="py-2.5 px-3 font-medium text-zinc-800 dark:text-zinc-200 whitespace-nowrap">{r.closer_name}</td>
                            <td className="py-2.5 px-3 text-zinc-700 dark:text-zinc-300">{r.total_meetings}</td>
                            <td className={cn('py-2.5 px-3 font-semibold', showRateColor(showR))}>{fmtPct(showR, 0)}</td>
                            <td className="py-2.5 px-3 text-zinc-700 dark:text-zinc-300">{fmtPct(offerR, 0)}</td>
                            <td className={cn('py-2.5 px-3 font-semibold', closeRateColor(closeR))}>{fmtPct(closeR, 0)}</td>
                            <td className={cn('py-2.5 px-3 font-bold', r.cash_collected > 5000 ? 'text-green-600 dark:text-green-400' : 'text-zinc-700 dark:text-zinc-300')}>
                              {fmtCash(r.cash_collected)}
                            </td>
                            <td className="py-2.5 px-3 text-zinc-700 dark:text-zinc-300">{r.won_deals}</td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setDetailReport(r)}
                                  className="text-[#89bcef] dark:text-[#89bcef] hover:underline font-medium"
                                >
                                  Ver
                                </button>
                                {isAdmin && (
                                  <>
                                    <button
                                      onClick={async () => {
                                        const { data } = await supabase.from('closer_daily_reports').select('*').eq('id', r.id).single()
                                        if (data) setEditTarget(data)
                                        else toast.error('Could not load report for editing')
                                      }}
                                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:text-[#ffbd59] hover:bg-[#ffbd59]/10 dark:hover:bg-[#ffbd59]/20 transition-all"
                                      title="Edit report"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={() => setDeleteTarget(r)}
                                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                                      title="Delete report"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                    <span className="text-xs text-zinc-400">
                      Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="p-1 rounded disabled:opacity-30 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="text-xs text-zinc-500 px-1">{page + 1} / {totalPages}</span>
                      <button
                        onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={page >= totalPages - 1}
                        className="p-1 rounded disabled:opacity-30 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Dialog open={!!detailReport} onOpenChange={(open) => { if (!open) setDetailReport(null) }}>
        {detailReport && <ReportDetail report={detailReport} onClose={() => setDetailReport(null)} />}
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null) }}>
        {editTarget && (
          <EditCloserReportModal
            report={editTarget}
            onClose={() => setEditTarget(null)}
            onSaved={(updated) => {
              setReports((prev) => prev.map((r) => r.id === updated.id ? updated : r))
              setEditTarget(null)
            }}
          />
        )}
      </Dialog>

      {linkCall && (
        <LinkSaleModal
          open={!!linkCall}
          onOpenChange={(open) => { if (!open) setLinkCall(null) }}
          call={linkCall}
          closerName={profile?.full_name ?? selectedCloser}
          onLinked={() => {
            // Refresh data to get the new match with transaction cost
            fetchData()
            setLinkCall(null)
          }}
        />
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Delete this report?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Are you sure you want to delete this report? This action cannot be undone.
            {deleteTarget && (
              <span className="block mt-1 font-medium text-zinc-700 dark:text-zinc-300">
                {formatDate(deleteTarget.date)} · {deleteTarget.closer_name}
              </span>
            )}
          </p>
          <div className="flex items-center justify-end gap-2 mt-4">
            <button
              onClick={() => setDeleteTarget(null)}
              className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-3 py-1.5 text-xs rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors disabled:opacity-60"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </PageTransition>
  )
}
