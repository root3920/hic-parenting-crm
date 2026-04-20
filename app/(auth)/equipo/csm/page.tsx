'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/PageHeader'
import { PageTransition } from '@/components/motion/PageTransition'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import { Plus, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { motion, AnimatePresence } from 'framer-motion'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 10

type Preset = '7d' | '30d' | 'all'

interface HtReport {
  id: string
  date: string
  rep_name: string
  total_active_graduates: number
  graduates_contacted: number
  graduates_responded: number
  real_conversations: number
  ascension_invitations: number
  calls_scheduled: number
  calls_showed: number
  enrollments_closed: number
  total_calls_week: number
  objection_1: string | null
  objection_2: string | null
  objection_3: string | null
  graduate_patterns: string | null
  leads_lost: number
  lost_reason: string | null
  learning_1: string | null
  learning_2: string | null
  learning_3: string | null
  performance_score: number
  improvement_notes: string | null
  created_at: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pct(num: number, den: number): number {
  return den > 0 ? (num / den) * 100 : NaN
}

function fmtPct(v: number): string {
  return isNaN(v) ? '—' : `${v.toFixed(0)}%`
}

function avg(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((s, n) => s + n, 0) / arr.length : NaN
}

function getDateRange(preset: Preset): { from: string; to: string } | null {
  if (preset === 'all') return null
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  const from = new Date(today)
  from.setDate(today.getDate() - (preset === '7d' ? 6 : 29))
  return { from: fmt(from), to: fmt(today) }
}

// status: 'good' | 'warn' | 'alert'
function rateStatus(v: number, goal: number, alert: number): 'good' | 'warn' | 'alert' {
  if (isNaN(v)) return 'alert'
  if (v >= goal) return 'good'
  if (v >= alert) return 'warn'
  return 'alert'
}

function callsStatus(v: number): 'good' | 'warn' | 'alert' {
  if (isNaN(v)) return 'alert'
  if (v >= 4) return 'good'
  if (v >= 3) return 'warn'
  return 'alert'
}

const STATUS_DOT: Record<'good' | 'warn' | 'alert', string> = {
  good:  'bg-green-500',
  warn:  'bg-amber-400',
  alert: 'bg-red-500',
}

const RATE_COLORS: Record<'good' | 'warn' | 'alert', string> = {
  good:  'text-green-600 dark:text-green-400',
  warn:  'text-amber-600 dark:text-amber-400',
  alert: 'text-red-600 dark:text-red-400',
}

const CELL_BG: Record<'good' | 'warn' | 'alert', string> = {
  good:  'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300',
  warn:  'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
  alert: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300',
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, status,
}: {
  label: string
  value: string
  sub?: string
  status: 'good' | 'warn' | 'alert'
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={cn('w-2 h-2 rounded-full shrink-0', STATUS_DOT[status])} />
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 leading-none">{label}</p>
      </div>
      <p className={cn('text-2xl font-bold', RATE_COLORS[status])}>{value}</p>
      {sub && <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Objection frequency ───────────────────────────────────────────────────────

function collectObjections(reports: HtReport[]): [string, number][] {
  const freq: Record<string, number> = {}
  for (const r of reports) {
    for (const obj of [r.objection_1, r.objection_2, r.objection_3]) {
      const s = obj?.trim()
      if (!s) continue
      const key = s.toLowerCase()
      freq[key] = (freq[key] ?? 0) + 1
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => [k.charAt(0).toUpperCase() + k.slice(1), n])
}

// ── Row detail expand ─────────────────────────────────────────────────────────

function ReportDetail({ report }: { report: HtReport }) {
  const rowCls = 'flex items-start gap-3 py-1.5 border-b border-zinc-100 dark:border-zinc-800 last:border-0'
  const labelCls = 'text-xs text-zinc-400 w-40 shrink-0'
  const valCls = 'text-xs text-zinc-700 dark:text-zinc-300 font-medium'

  function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
    if (value === null || value === undefined || value === '') return null
    return (
      <div className={rowCls}>
        <span className={labelCls}>{label}</span>
        <span className={valCls}>{String(value)}</span>
      </div>
    )
  }

  return (
    <div className="px-4 pb-4 pt-2 bg-zinc-50 dark:bg-zinc-800/40 border-t border-zinc-100 dark:border-zinc-800">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-0">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5 mt-2">Objections</p>
          <Row label="Objection 1" value={report.objection_1} />
          <Row label="Objection 2" value={report.objection_2} />
          <Row label="Objection 3" value={report.objection_3} />
          <Row label="Graduate patterns" value={report.graduate_patterns} />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5 mt-2">Lost</p>
          <Row label="Leads lost" value={report.leads_lost} />
          <Row label="Primary reason" value={report.lost_reason} />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5 mt-2">Key Learnings</p>
          <Row label="Learning 1" value={report.learning_1} />
          <Row label="Learning 2" value={report.learning_2} />
          <Row label="Learning 3" value={report.learning_3} />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5 mt-2">Self-Assessment</p>
          <Row label="Performance score" value={`${report.performance_score} / 10`} />
          <Row label="Improvement notes" value={report.improvement_notes} />
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HtCsmDashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const [reports, setReports] = useState<HtReport[]>([])
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState<Preset>('30d')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  const fetchReports = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('ht_csm_reports')
      .select('*')
      .order('date', { ascending: false })

    const range = getDateRange(preset)
    if (range) {
      q = q.gte('date', range.from).lte('date', range.to)
    }

    const { data } = await q
    setReports(data ?? [])
    setPage(0)
    setLoading(false)
  }, [supabase, preset])

  useEffect(() => { fetchReports() }, [fetchReports])

  // ── Aggregated KPIs ──
  const kpis = useMemo(() => {
    if (reports.length === 0) return null

    const totContacted   = reports.reduce((s, r) => s + r.graduates_contacted, 0)
    const totGraduates   = reports.reduce((s, r) => s + r.total_active_graduates, 0)
    const totConversations = reports.reduce((s, r) => s + r.real_conversations, 0)
    const totInvitations = reports.reduce((s, r) => s + r.ascension_invitations, 0)
    const totScheduled   = reports.reduce((s, r) => s + r.calls_scheduled, 0)
    const totShowed      = reports.reduce((s, r) => s + r.calls_showed, 0)
    const totClosed      = reports.reduce((s, r) => s + r.enrollments_closed, 0)
    const avgCalls       = avg(reports.map((r) => r.total_calls_week))
    const avgScore       = avg(reports.map((r) => r.performance_score))

    return {
      outreachRate:  pct(totContacted, totGraduates),
      responseRate:  pct(totConversations, totContacted),
      pitchRate:     pct(totInvitations, totConversations),
      showRate:      pct(totShowed, totScheduled),
      closeRate:     pct(totClosed, totShowed),
      avgCalls,
      avgScore,
      totalClosed: totClosed,
    }
  }, [reports])

  // ── Chart data (ascending) ──
  const chartData = useMemo(() => {
    const byDate: Record<string, {
      date: string
      outreach: number; response: number; pitch: number; show: number; close: number
      calls: number
      contacted: number; graduates: number
      conversations: number; invitations: number
      scheduled: number; showed: number; closed: number
    }> = {}

    for (const r of [...reports].reverse()) {
      if (!byDate[r.date]) {
        byDate[r.date] = {
          date: formatDate(r.date),
          outreach: 0, response: 0, pitch: 0, show: 0, close: 0,
          calls: 0,
          contacted: 0, graduates: 0, conversations: 0, invitations: 0,
          scheduled: 0, showed: 0, closed: 0,
        }
      }
      const d = byDate[r.date]
      d.contacted    += r.graduates_contacted
      d.graduates    += r.total_active_graduates
      d.conversations += r.real_conversations
      d.invitations  += r.ascension_invitations
      d.scheduled    += r.calls_scheduled
      d.showed       += r.calls_showed
      d.closed       += r.enrollments_closed
      d.calls        += r.total_calls_week
    }

    // Compute derived rates per day
    return Object.values(byDate).map((d) => ({
      ...d,
      outreach: Math.round(pct(d.contacted, d.graduates)) || 0,
      response: Math.round(pct(d.conversations, d.contacted)) || 0,
      pitch:    Math.round(pct(d.invitations, d.conversations)) || 0,
      show:     Math.round(pct(d.showed, d.scheduled)) || 0,
      close:    Math.round(pct(d.closed, d.showed)) || 0,
    }))
  }, [reports])

  // ── Objections ──
  const objections = useMemo(() => collectObjections(reports), [reports])

  // ── Pagination ──
  const totalPages = Math.ceil(reports.length / PAGE_SIZE)
  const pageReports = reports.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto">
        <PageHeader title="Client Success — High Ticket" description="Weekly HT CSM performance">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Date preset */}
            <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden">
              {(['7d', '30d', 'all'] as Preset[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPreset(p)}
                  className={cn(
                    'px-2.5 py-1.5 text-xs font-medium transition-colors',
                    preset === p
                      ? 'bg-[#185FA5] text-white'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                  )}
                >
                  {p === 'all' ? 'All' : p}
                </button>
              ))}
            </div>
            <Link
              href="/equipo/csm/nuevo"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#1D9E75' }}
            >
              <Plus className="h-3.5 w-3.5" />
              New Report
            </Link>
          </div>
        </PageHeader>

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-24 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-xl" />
              ))}
            </div>
          </div>
        ) : reports.length === 0 ? (
          <EmptyState
            title="No reports in this period"
            description="Create the first HT CSM report to see metrics here."
            icon={<Plus className="h-10 w-10" />}
          />
        ) : kpis && (
          <>
            {/* ── KPI Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <KpiCard
                label="Outreach Rate"
                value={fmtPct(kpis.outreachRate)}
                sub="contacted / total graduates"
                status={rateStatus(kpis.outreachRate, 50, 40)}
              />
              <KpiCard
                label="Response Rate"
                value={fmtPct(kpis.responseRate)}
                sub="conversations / contacted"
                status={rateStatus(kpis.responseRate, 35, 25)}
              />
              <KpiCard
                label="Pitch Rate"
                value={fmtPct(kpis.pitchRate)}
                sub="invitations / conversations"
                status={rateStatus(kpis.pitchRate, 45, 30)}
              />
              <KpiCard
                label="Show Rate"
                value={fmtPct(kpis.showRate)}
                sub="showed / scheduled"
                status={rateStatus(kpis.showRate, 65, 50)}
              />
              <KpiCard
                label="Close Rate"
                value={fmtPct(kpis.closeRate)}
                sub="closed / showed"
                status={rateStatus(kpis.closeRate, 30, 25)}
              />
              <KpiCard
                label="Calls / Week"
                value={isNaN(kpis.avgCalls) ? '—' : kpis.avgCalls.toFixed(1)}
                sub="avg ascension calls"
                status={callsStatus(kpis.avgCalls)}
              />
              <KpiCard
                label="Avg Score"
                value={isNaN(kpis.avgScore) ? '—' : `${kpis.avgScore.toFixed(1)} / 10`}
                sub="self-assessment"
                status={rateStatus(kpis.avgScore * 10, 70, 50)}
              />
              <KpiCard
                label="Total Enrollments"
                value={String(kpis.totalClosed)}
                sub="closed in period"
                status={kpis.totalClosed > 0 ? 'good' : 'warn'}
              />
            </div>

            {/* ── Charts ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* Funnel rates trend */}
              <Card className="md:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Conversion Funnel — Rate Trends</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} unit="%" />
                      <Tooltip
                        formatter={(v) => [`${v}%`]}
                        contentStyle={{ fontSize: 11 }}
                      />
                      <Legend formatter={(v) => <span className="text-xs capitalize">{v}</span>} />
                      <Line type="monotone" dataKey="outreach" stroke="#185FA5" strokeWidth={2} dot={false} name="Outreach" />
                      <Line type="monotone" dataKey="response" stroke="#1D9E75" strokeWidth={2} dot={false} name="Response" />
                      <Line type="monotone" dataKey="pitch"    stroke="#8B5CF6" strokeWidth={2} dot={false} name="Pitch" />
                      <Line type="monotone" dataKey="show"     stroke="#F59E0B" strokeWidth={2} dot={false} name="Show" />
                      <Line type="monotone" dataKey="close"    stroke="#EF4444" strokeWidth={2} dot={false} name="Close" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Weekly call volume */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Weekly Call Volume</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                      <Bar dataKey="calls" name="Calls" fill="#185FA5" radius={[3, 3, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Close Rate vs Show Rate */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Close Rate vs Show Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} unit="%" />
                      <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ fontSize: 11 }} />
                      <Legend formatter={(v) => <span className="text-xs capitalize">{v}</span>} />
                      <Bar dataKey="show"  name="Show"  fill="#F59E0B" radius={[3, 3, 0, 0]} maxBarSize={24} />
                      <Bar dataKey="close" name="Close" fill="#1D9E75" radius={[3, 3, 0, 0]} maxBarSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* ── Objections ── */}
            {objections.length > 0 && (
              <Card className="mb-6">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Most Frequent Objections</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2.5">
                    {objections.slice(0, 10).map(([label, count]) => {
                      const p = objections[0][1] > 0 ? (count / objections[0][1]) * 100 : 0
                      return (
                        <div key={label}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
                            <span className="font-semibold text-zinc-700 dark:text-zinc-300">{count}×</span>
                          </div>
                          <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full">
                            <div className="h-full bg-red-400 rounded-full transition-all" style={{ width: `${p}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Reports Table ── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Report History</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800">
                        {['', 'Week', 'Rep', 'Outreach%', 'Response%', 'Pitch%', 'Show%', 'Close%', 'Calls', 'Score'].map((h, i) => (
                          <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {pageReports.map((r) => {
                        const outreach = pct(r.graduates_contacted, r.total_active_graduates)
                        const response = pct(r.real_conversations, r.graduates_contacted)
                        const pitch    = pct(r.ascension_invitations, r.real_conversations)
                        const show     = pct(r.calls_showed, r.calls_scheduled)
                        const close    = pct(r.enrollments_closed, r.calls_showed)
                        const isOpen   = expandedId === r.id

                        function Cell({ v, st }: { v: number; st: 'good' | 'warn' | 'alert' }) {
                          return (
                            <td className="px-4 py-3">
                              <span className={cn('inline-flex px-1.5 py-0.5 rounded text-xs font-semibold', CELL_BG[st])}>
                                {fmtPct(v)}
                              </span>
                            </td>
                          )
                        }

                        return (
                          <>
                            <motion.tr
                              key={r.id}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className={cn(
                                'hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer',
                                isOpen && 'bg-zinc-50 dark:bg-zinc-800/40'
                              )}
                              onClick={() => setExpandedId(isOpen ? null : r.id)}
                            >
                              <td className="px-4 py-3 text-zinc-400">
                                {isOpen
                                  ? <ChevronDown className="h-3.5 w-3.5" />
                                  : <ChevronRight className="h-3.5 w-3.5" />}
                              </td>
                              <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">{formatDate(r.date)}</td>
                              <td className="px-4 py-3 text-sm font-medium text-zinc-800 dark:text-zinc-200 whitespace-nowrap">{r.rep_name}</td>
                              <Cell v={outreach} st={rateStatus(outreach, 50, 40)} />
                              <Cell v={response} st={rateStatus(response, 35, 25)} />
                              <Cell v={pitch}    st={rateStatus(pitch, 45, 30)} />
                              <Cell v={show}     st={rateStatus(show, 65, 50)} />
                              <Cell v={close}    st={rateStatus(close, 30, 25)} />
                              <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400">{r.total_calls_week}</td>
                              <td className="px-4 py-3">
                                <span className={cn(
                                  'inline-flex px-1.5 py-0.5 rounded text-xs font-bold',
                                  r.performance_score >= 8
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                    : r.performance_score >= 5
                                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                )}>
                                  {r.performance_score}/10
                                </span>
                              </td>
                            </motion.tr>
                            <AnimatePresence>
                              {isOpen && (
                                <motion.tr
                                  key={`${r.id}-detail`}
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0.15 }}
                                >
                                  <td colSpan={10} className="p-0">
                                    <ReportDetail report={r} />
                                  </td>
                                </motion.tr>
                              )}
                            </AnimatePresence>
                          </>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100 dark:border-zinc-800">
                    <p className="text-xs text-zinc-400">
                      {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, reports.length)} of {reports.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="px-2.5 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 disabled:opacity-30 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                      >
                        Prev
                      </button>
                      <button
                        onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={page >= totalPages - 1}
                        className="px-2.5 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 disabled:opacity-30 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </PageTransition>
  )
}
