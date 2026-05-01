'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useProfile } from '@/hooks/useProfile'
import { PageHeader } from '@/components/layout/PageHeader'
import { PageTransition } from '@/components/motion/PageTransition'
import { EmptyState } from '@/components/shared/EmptyState'
import { KpiGoalCard } from '@/components/shared/KpiGoalCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import { Plus, ChevronLeft, ChevronRight, Download, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { GOALS } from '@/lib/goals'
import { getCurrentWeekRange } from '@/lib/dateUtils'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 10

// ─── Types ───────────────────────────────────────────────────────────────────

type Preset = 'week' | '7d' | '30d' | '90d' | 'todo' | 'custom'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

// ─── Helpers ─────────────────────────────────────────────────────────────────

function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getDateRange(preset: Preset) {
  const today = new Date()
  const to = localDateStr(today)
  const daysAgo = (n: number) => {
    const d = new Date()
    d.setDate(d.getDate() - n)
    return localDateStr(d)
  }
  if (preset === 'week') {
    const w = getCurrentWeekRange()
    return { from: w.start, to: w.end }
  }
  if (preset === '7d')  return { from: daysAgo(6),  to }
  if (preset === '30d') return { from: daysAgo(29), to }
  if (preset === '90d') return { from: daysAgo(89), to }
  return { from: '2020-01-01', to }
}

function safeDiv(num: number, den: number) {
  return den > 0 ? num / den : NaN
}

function fmtPct(v: number, dec = 1) {
  return isNaN(v) ? '—' : `${v.toFixed(dec)}%`
}

function sumField(rows: Row[], key: string): number {
  return rows.reduce((acc: number, r: Row) => acc + (r[key] ?? 0), 0)
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function VolumeCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      {sub && <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function SourceBadge({ source }: { source: string }) {
  if (source === 'Formulario') {
    return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">Formulario</span>
  }
  return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">CSV</span>
}

function ReportDetail({ report, onClose }: { report: Row; onClose: () => void }) {
  void onClose
  const convRate = safeDiv(report.qualified_calls, report.total_convos) * 100
  const pitchRate = safeDiv(report.call_proposed, report.total_convos) * 100

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
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <div className="flex items-center gap-2">
          <DialogTitle className="text-base">{report.setter_name} · {formatDate(report.date)}</DialogTitle>
          <SourceBadge source={report.source} />
        </div>
      </DialogHeader>
      <div className="space-y-5 mt-2">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'Pitch Rate', value: fmtPct(pitchRate) },
            { label: 'Booking Rate', value: fmtPct(safeDiv(report.qualified_calls, report.call_proposed) * 100) },
            { label: 'Conv General', value: fmtPct(convRate) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-2">
              <p className="text-xs text-zinc-400">{label}</p>
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
            </div>
          ))}
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-blue-600 mb-2">Conversations</p>
          <Row label="Total convos" value={report.total_convos} />
          <Row label="Proposed calls" value={report.call_proposed} />
          <Row label="Scheduled calls" value={report.qualified_calls} />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-amber-600 mb-2">Self-evaluation</p>
          <Row label="Performance" value={`${report.performance_score}/10`} />
          {report.highs && <Row label="Strengths" value={report.highs} />}
          {report.lows && <Row label="To improve" value={report.lows} />}
        </div>
        {report.notes && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">Notes</p>
            <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg px-3 py-2.5">
              <p className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">{report.notes}</p>
            </div>
          </div>
        )}
      </div>
    </DialogContent>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SetterDashboardPage() {
  const { profile } = useProfile()
  const isSetter = profile?.role === 'setter'
  const [allRows, setAllRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState<Preset>('week')
  const [customFrom, setCustomFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return localDateStr(d) })
  const [customTo, setCustomTo] = useState(() => localDateStr(new Date()))
  const [selectedSetter, setSelectedSetter] = useState('All')
  const [page, setPage] = useState(0)
  const [detailReport, setDetailReport] = useState<Row | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const supabase = createClient()
    const table = deleteTarget.source === 'CSV' ? 'setter_reports' : 'setter_daily_reports'
    const { error } = await supabase.from(table).delete().eq('id', deleteTarget.id)
    setDeleting(false)
    if (error) {
      toast.error(`Error deleting: ${error.message}`)
    } else {
      setAllRows((prev) => prev.filter((r) => !(r.id === deleteTarget.id && r.source === deleteTarget.source)))
      toast.success('Record deleted')
      setDeleteTarget(null)
    }
  }

  // Fetch once — no date filter in the query, filter client-side
  useEffect(() => {
    async function fetchAll() {
      setLoading(true)
      const supabase = createClient()

      const [{ data: legacy }, { data: daily }] = await Promise.all([
        supabase.from('setter_reports').select('*').order('date', { ascending: false }),
        supabase.from('setter_daily_reports').select('*').order('date', { ascending: false }),
      ])

      const combined: Row[] = [
        ...(legacy ?? []).map((r: Row) => ({
          id:                r.id,
          date:              r.date?.slice(0, 10) ?? '',
          setter_name:       (r.setter_name ?? '').replace('@', '').trim(),
          total_convos:      r.total_convos ?? 0,
          followups:         r.followups ?? 0,
          call_proposed:     r.call_proposed ?? 0,
          qualified_calls:   r.qualified_calls ?? 0,
          performance_score: r.performance_score ?? 0,
          notes:             r.notes ?? '',
          highs:             r.highs ?? '',
          lows:              r.lows ?? '',
          source:            'CSV' as const,
        })),
        ...(daily ?? []).map((r: Row) => ({
          id:                r.id,
          date:              r.date?.slice(0, 10) ?? '',
          setter_name:       (r.setter_name ?? '').replace('@', '').trim(),
          total_convos:      r.total_convos ?? 0,
          followups:         r.followups ?? 0,
          call_proposed:     r.calls_proposed ?? 0,
          qualified_calls:   r.calls_booked ?? 0,
          performance_score: r.performance_score ?? 0,
          notes:             r.notas ?? '',
          highs:             Array.isArray(r.highs) ? r.highs.join(', ') : (r.highs ?? ''),
          lows:              Array.isArray(r.lows)  ? r.lows.join(', ')  : (r.lows  ?? ''),
          source:            'Formulario' as const,
        })),
      ].sort((a, b) => b.date.localeCompare(a.date))

      setAllRows(combined)
      setLoading(false)
    }
    fetchAll()
  }, [])

  const { from: fromDate, to: toDate } = useMemo(() => {
    if (preset === 'custom') return { from: customFrom, to: customTo }
    return getDateRange(preset)
  }, [preset, customFrom, customTo])

  // Client-side filter: date range + setter
  const filtered = useMemo(() => {
    const setterQuery = selectedSetter === 'All' ? '' : selectedSetter.toLowerCase().replace('@', '').trim()
    return allRows.filter((r: Row) => {
      const matchesSetter = !setterQuery || r.setter_name.toLowerCase().includes(setterQuery)
      const matchesDate   = r.date >= fromDate && r.date <= toDate
      return matchesSetter && matchesDate
    })
  }, [allRows, selectedSetter, fromDate, toDate])

  // Setter names for dropdown
  const setterNames = useMemo(() => {
    const names = Array.from(new Set(allRows.map((r: Row) => r.setter_name as string))).sort()
    return ['All', ...names]
  }, [allRows])

  // Reset page when filters change
  useEffect(() => { setPage(0) }, [preset, selectedSetter, customFrom, customTo])

  // ── KPI aggregates ──
  const kpis = useMemo(() => {
    const totalConvos   = sumField(filtered, 'total_convos')
    const totalProposed = sumField(filtered, 'call_proposed')
    const totalBooked   = sumField(filtered, 'qualified_calls')
    return {
      pitchRate:   safeDiv(totalProposed, totalConvos)  * 100,
      bookingRate: safeDiv(totalBooked,   totalProposed) * 100,
      convGeneral: safeDiv(totalBooked,   totalConvos)  * 100,
    }
  }, [filtered])

  // ── Volume stats ──
  const volume = useMemo(() => {
    const totalConvos   = sumField(filtered, 'total_convos')
    const totalFollowups = sumField(filtered, 'followups')
    const totalProposed = sumField(filtered, 'call_proposed')
    const totalBooked   = sumField(filtered, 'qualified_calls')
    const avgPerf = filtered.length > 0
      ? filtered.reduce((acc: number, r: Row) => acc + r.performance_score, 0) / filtered.length
      : NaN
    return {
      totalConvos,
      totalFollowups,
      totalProposed,
      totalBooked,
      avgPerf,
      bookingPct: fmtPct(safeDiv(totalBooked, totalProposed) * 100),
    }
  }, [filtered])

  const weekRange = useMemo(() => getCurrentWeekRange(), [])

  // ── Chart data ──
  const chartData = useMemo(() => {
    const byDate: Record<string, { date: string; call_proposed: number; qualified_calls: number }> = {}
    for (const r of [...filtered].reverse()) {
      if (!byDate[r.date]) {
        byDate[r.date] = { date: formatDate(r.date), call_proposed: 0, qualified_calls: 0 }
      }
      byDate[r.date].call_proposed   += r.call_proposed
      byDate[r.date].qualified_calls += r.qualified_calls
    }
    return Object.values(byDate)
  }, [filtered])

  // ── Performance sparkline ──
  const perfData = useMemo(() => {
    if (filtered.length === 0) return { avg: NaN, sparkline: [] }
    const avg = filtered.reduce((acc: number, r: Row) => acc + r.performance_score, 0) / filtered.length
    const sparkline = [...filtered].reverse().map((r: Row) => ({ date: formatDate(r.date), score: r.performance_score }))
    return { avg, sparkline }
  }, [filtered])

  // ── Pagination ──
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageRows   = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function perfColor(v: number) {
    if (isNaN(v) || v === 0) return 'text-zinc-400'
    if (v >= 8) return 'text-green-600 dark:text-green-400'
    if (v >= 6) return 'text-amber-600 dark:text-amber-400'
    return 'text-red-600 dark:text-red-400'
  }

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto">
        {/* Setter role: prominent daily report CTA */}
        {isSetter && (
          <div className="mb-6 flex items-center justify-between bg-[#185FA5] rounded-xl px-5 py-4 text-white">
            <div>
              <p className="text-sm font-semibold">Hey{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}!</p>
              <p className="text-xs opacity-80 mt-0.5">Did you file today's report?</p>
            </div>
            <Link
              href="/equipo/setter/nuevo"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-[#185FA5] text-xs font-bold hover:bg-blue-50 transition-colors shrink-0"
            >
              File today's report →
            </Link>
          </div>
        )}
        <PageHeader title="Setting Team" description={preset === 'week' ? `Current week: ${weekRange.label} (Fri → Thu)` : 'Daily setter team performance'}>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Preset buttons */}
            <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden">
              {(['week', '7d', '30d', '90d', 'todo', 'custom'] as Preset[]).map((p) => (
                <button
                  key={p}
                  onClick={() => { setPreset(p); setPage(0) }}
                  className={cn(
                    'px-2.5 py-1.5 text-xs font-medium transition-colors',
                    preset === p
                      ? p === 'week' ? 'bg-indigo-600 text-white' : 'bg-[#185FA5] text-white'
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
              value={selectedSetter}
              onChange={(e) => { setSelectedSetter(e.target.value); setPage(0) }}
              className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            >
              {setterNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {!loading && (
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                {filtered.length} days of data
              </span>
            )}
            <Link
              href="/equipo/setter/nuevo"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#185FA5' }}
            >
              <Plus className="h-3.5 w-3.5" />
              New Report
            </Link>
            <button
              onClick={() => { const t = document.title; document.title = `Setting Team — ${fromDate} to ${toDate}`; window.print(); document.title = t }}
              className="no-print inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Export PDF
            </button>
          </div>
        </PageHeader>

        <div className="print-header">
          <img src="/logo.png" width="120" alt="HIC Parenting" />
          <h1 style={{ fontSize: '18px', marginTop: '8px', fontWeight: 600 }}>Setting Team — Performance Report</h1>
          <p style={{ fontSize: '12px', color: '#666' }}>Period: {fromDate} — {toDate}</p>
          <p style={{ fontSize: '12px', color: '#666' }}>Generated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-28 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-xl" />)}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-20 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-xl" />)}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No reports in this period"
            description="Create the first setter report to see metrics here."
            icon={<Plus className="h-10 w-10" />}
          />
        ) : (
          <>
            {/* ── Section 1: KPI Goal Cards ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <KpiGoalCard
                label={GOALS.setting.pitchRate.label}
                description={GOALS.setting.pitchRate.description}
                value={kpis.pitchRate}
                unit="%"
                goal={GOALS.setting.pitchRate}
              />
              <KpiGoalCard
                label={GOALS.setting.bookingRate.label}
                description={GOALS.setting.bookingRate.description}
                value={kpis.bookingRate}
                unit="%"
                goal={GOALS.setting.bookingRate}
              />
              <KpiGoalCard
                label={GOALS.setting.conversionGeneral.label}
                description={GOALS.setting.conversionGeneral.description}
                value={kpis.convGeneral}
                unit="%"
                goal={GOALS.setting.conversionGeneral}
              />
            </div>

            {/* ── Section 2: Volume Stats ── */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              <VolumeCard label="Total Convos" value={volume.totalConvos} sub="Meta: 80–90/week" />
              <VolumeCard
                label="Follow-ups"
                value={volume.totalFollowups}
                sub={volume.totalFollowups >= 30 ? 'On Target' : volume.totalFollowups >= 20 ? 'Needs Improvement' : 'Alert'}
              />
              <VolumeCard label="Proposed Calls" value={volume.totalProposed} />
              <VolumeCard
                label="Scheduled Calls"
                value={volume.totalBooked}
                sub={`${volume.bookingPct} booking rate`}
              />
              <VolumeCard
                label="Avg Performance"
                value={isNaN(volume.avgPerf) ? '—' : `${volume.avgPerf.toFixed(1)}/10`}
                sub="/10 self-evaluation"
              />
            </div>

            {/* ── Section 3: Charts ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Call pipeline (daily)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                      <Legend formatter={(v) => <span className="text-xs">{v === 'call_proposed' ? 'Proposed' : 'Scheduled'}</span>} />
                      <Bar dataKey="call_proposed"   fill="#71717a" maxBarSize={32} />
                      <Bar dataKey="qualified_calls" fill="#185FA5" radius={[3, 3, 0, 0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Performance trend</CardTitle>
                </CardHeader>
                <CardContent>
                  {perfData.sparkline.length > 1 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={perfData.sparkline} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="score" stroke="#EF9F27" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[220px] flex items-center justify-center">
                      <p className="text-xs text-zinc-400">Not enough data</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ── Section 4: Historial ── */}
            <Card className="mb-8">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">Full History</CardTitle>
                <span className="text-xs text-zinc-400">{filtered.length} days of data</span>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800">
                        {['Date', 'Setter', 'Convos', 'Proposed', 'Scheduled', 'Conv%', 'Perf', 'Source', ''].map((h) => (
                          <th key={h} className="text-left py-2.5 px-3 font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r: Row, i: number) => {
                        const convPct = safeDiv(r.qualified_calls, r.total_convos) * 100
                        return (
                          <tr key={`${r.date}_${r.setter_name}_${r.source}_${i}`} className="group border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                            <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">{formatDate(r.date)}</td>
                            <td className="py-2.5 px-3 font-medium text-zinc-800 dark:text-zinc-200">{r.setter_name}</td>
                            <td className="py-2.5 px-3 text-zinc-700 dark:text-zinc-300">{r.total_convos}</td>
                            <td className="py-2.5 px-3 text-zinc-700 dark:text-zinc-300">{r.call_proposed}</td>
                            <td className="py-2.5 px-3 text-zinc-700 dark:text-zinc-300">{r.qualified_calls}</td>
                            <td className="py-2.5 px-3 text-zinc-700 dark:text-zinc-300">{fmtPct(convPct, 0)}</td>
                            <td className="py-2.5 px-3">
                              <span className={cn('font-semibold', perfColor(r.performance_score))}>
                                {r.performance_score}/10
                              </span>
                            </td>
                            <td className="py-2.5 px-3"><SourceBadge source={r.source} /></td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setDetailReport(r)}
                                  className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                                >
                                  View
                                </button>
                                <button
                                  onClick={() => setDeleteTarget(r)}
                                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                                  title="Delete record"
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

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Delete this record?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            This action cannot be undone.
            {deleteTarget && (
              <span className="block mt-1 font-medium text-zinc-700 dark:text-zinc-300">
                {formatDate(deleteTarget.date)} · {deleteTarget.setter_name} · {deleteTarget.source}
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
