'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/PageHeader'
import { PageTransition } from '@/components/motion/PageTransition'
import { EmptyState } from '@/components/shared/EmptyState'
import { KpiGoalCard } from '@/components/shared/KpiGoalCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import { CloserDailyReport } from '@/types'
import { Plus, ChevronLeft, ChevronRight, Download } from 'lucide-react'
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
  status: string
  call_status: string | null
  call_type: string | null
  start_date: string
  closer_name: string
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
          <p className="text-xs font-bold uppercase tracking-wide text-blue-600 mb-2">Meetings</p>
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CloserDashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const [reports, setReports] = useState<CloserDailyReport[]>([])
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState<Preset>('week')
  const [customFrom, setCustomFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().split('T')[0] })
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().split('T')[0])
  const [selectedCloser, setSelectedCloser] = useState('All')
  const [page, setPage] = useState(0)
  const [detailReport, setDetailReport] = useState<CloserDailyReport | null>(null)
  const [callsData, setCallsData] = useState<CallSummary[]>([])

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
    const [reportsRes, callsRes] = await Promise.all([
      supabase
        .from('closer_daily_reports')
        .select('*')
        .gte('date', fromDate)
        .lte('date', toDate)
        .order('date', { ascending: false }),
      supabase
        .from('calls')
        .select('id, status, call_status, call_type, start_date, closer_name')
        .gte('start_date', fromDate)
        .lte('start_date', toDate + 'T23:59:59'),
    ])
    setReports(reportsRes.data ?? [])
    setCallsData((callsRes.data ?? []) as CallSummary[])
    setLoading(false)
  }, [supabase, fromDate, toDate])

  useEffect(() => { fetchData() }, [fetchData])

  const closerNames = useMemo(() => {
    const names = Array.from(new Set(reports.map((r) => r.closer_name))).sort()
    return ['All', ...names]
  }, [reports])

  const filtered = useMemo(
    () => selectedCloser === 'All' ? reports : reports.filter((r) => r.closer_name === selectedCloser),
    [reports, selectedCloser]
  )

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

  // ── KPIs from closer_daily_reports (ALL metrics) ──
  const reportKPIs = useMemo(() => {
    const totalMeetings = s(filtered, 'total_meetings')
    const showedMeetings = s(filtered, 'showed_meetings')
    const cancelledMeetings = s(filtered, 'cancelled_meetings')
    const noShowMeetings = s(filtered, 'no_show_meetings')
    const rescheduledMeetings = s(filtered, 'rescheduled_meetings')
    const offersProposed = s(filtered, 'offers_proposed')
    const wonDeals = s(filtered, 'won_deals')
    const cashCollected = s(filtered, 'cash_collected')
    const recurrentCash = s(filtered, 'recurrent_cash')

    const showRate = Math.min(safeDiv(showedMeetings, totalMeetings) * 100, 100)
    const cancelRate = safeDiv(cancelledMeetings, totalMeetings) * 100
    const noShowRate = safeDiv(noShowMeetings, totalMeetings) * 100
    const offerRate = Math.min(safeDiv(offersProposed, showedMeetings) * 100, 100)
    const closeRate = offersProposed > 0
      ? Math.min((wonDeals / offersProposed) * 100, 100)
      : 0
    const valuePerMeeting = safeDiv(cashCollected, totalMeetings)

    return { totalMeetings, showedMeetings, cancelledMeetings, noShowMeetings, rescheduledMeetings, offersProposed, wonDeals, cashCollected, recurrentCash, showRate, cancelRate, noShowRate, offerRate, closeRate, valuePerMeeting }
  }, [filtered])

  // ── Revenue ──
  const revenue = useMemo(() => {
    const cash = s(filtered, 'cash_collected')
    const recurrent = s(filtered, 'recurrent_cash')
    const won = s(filtered, 'won_deals')
    const totalMeetings = s(filtered, 'total_meetings')
    return { cash, recurrent, perMeeting: safeDiv(cash, totalMeetings), won }
  }, [filtered])

  // ── Volume ──
  const volume = useMemo(() => ({
    meetings: s(filtered, 'total_meetings'),
    showed: s(filtered, 'showed_meetings'),
    won: s(filtered, 'won_deals'),
    noShows: s(filtered, 'no_show_meetings'),
  }), [filtered])

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
              style={{ backgroundColor: '#185FA5' }}
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
            {/* ── Section 1a: KPI Goal Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-1">
              <KpiGoalCard
                label={GOALS.closing.showRate.label}
                description={GOALS.closing.showRate.description}
                value={reportKPIs.showRate}
                unit="%"
                goal={GOALS.closing.showRate}
              />
              <VolumeCard label="No Shows" value={reportKPIs.noShowMeetings} sub={`${fmtPct(reportKPIs.noShowRate)} of ${reportKPIs.totalMeetings} scheduled`} />
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">Cancelled</p>
                <p className={cn('text-2xl font-bold', reportKPIs.cancelRate < 20 ? 'text-green-600 dark:text-green-400' : reportKPIs.cancelRate <= 35 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400')}>
                  {fmtPct(reportKPIs.cancelRate)}
                </p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{reportKPIs.cancelledMeetings} of {reportKPIs.totalMeetings} scheduled</p>
              </div>
              <KpiGoalCard
                label="Showed Calls"
                description='Total "Showed Up" calls in selected period'
                value={reportKPIs.showedMeetings}
                unit=""
                goal={showedCallsGoal}
                decimals={0}
              />
              <VolumeCard label="Rescheduled" value={reportKPIs.rescheduledMeetings} sub={`of ${reportKPIs.totalMeetings} scheduled`} />
            </div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 text-right mb-5">Based on closer reports</p>

            {/* ── Section 1b: KPI Goal Cards — from closer reports ── */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-1">
              <VolumeCard label="Offers Made" value={reportKPIs.offersProposed} sub="from closer reports" />
              <KpiGoalCard
                label={GOALS.closing.offerRate.label}
                description={GOALS.closing.offerRate.description}
                value={reportKPIs.offerRate}
                unit="%"
                goal={GOALS.closing.offerRate}
              />
              <KpiGoalCard
                label={GOALS.closing.closeRate.label}
                description={GOALS.closing.closeRate.description}
                value={reportKPIs.closeRate}
                unit="%"
                goal={GOALS.closing.closeRate}
              />
              <VolumeCard label="Won Deals" value={reportKPIs.wonDeals} sub={`${reportKPIs.wonDeals} of ${reportKPIs.offersProposed} offers closed`} />
              <VolumeCard label="Cash Collected" value={fmtCash(reportKPIs.cashCollected)} sub="revenue this period" />
            </div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 text-right mb-6">Based on closer reports</p>

            {/* ── Section 2: Revenue Cards ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <RevenueCard
                label="Cash Collected"
                value={fmtCash(revenue.cash)}
                sub={`${revenue.won} closed deals`}
                color="bg-blue-600 text-white border-blue-700"
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
                label="Total Meetings"
                value={reportKPIs.totalMeetings}
                sub={`${fmtPct(reportKPIs.showRate)} show rate`}
              />
              <VolumeCard
                label="Showed"
                value={reportKPIs.showedMeetings}
                sub={`${fmtPct(reportKPIs.offerRate)} offer rate`}
              />
              <VolumeCard
                label="Won Deals"
                value={reportKPIs.wonDeals}
                sub={`${fmtPct(reportKPIs.closeRate)} of offers closed`}
              />
              <VolumeCard
                label="No-Shows"
                value={reportKPIs.noShowMeetings}
                sub={`${fmtPct(reportKPIs.noShowRate)} of total`}
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
                          const fill = ratio >= 0.7 ? '#185FA5' : ratio >= 0.3 ? '#3B82F6' : '#93C5FD'
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
                      <Line type="monotone" dataKey="showed_meetings" stroke="#185FA5" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="offers_proposed" stroke="#EF9F27" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="won_deals" stroke="#22C55E" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

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
                          <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
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
                              <button
                                onClick={() => setDetailReport(r)}
                                className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                              >
                                Ver
                              </button>
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
    </PageTransition>
  )
}
