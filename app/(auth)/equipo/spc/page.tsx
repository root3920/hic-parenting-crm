'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/PageHeader'
import { PageTransition } from '@/components/motion/PageTransition'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import { SpcReport } from '@/types'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { motion } from 'framer-motion'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 10

type Preset = '7d' | '30d' | '90d' | 'custom'

function getDateRange(preset: Preset, customFrom?: string, customTo?: string) {
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  if (preset === '7d') {
    const from = new Date(today); from.setDate(today.getDate() - 6)
    return { from: fmt(from), to: fmt(today) }
  }
  if (preset === '30d') {
    const from = new Date(today); from.setDate(today.getDate() - 29)
    return { from: fmt(from), to: fmt(today) }
  }
  if (preset === '90d') {
    const from = new Date(today); from.setDate(today.getDate() - 89)
    return { from: fmt(from), to: fmt(today) }
  }
  return { from: customFrom ?? fmt(today), to: customTo ?? fmt(today) }
}

function pct(num: number, den: number) {
  return den > 0 ? (num / den) * 100 : NaN
}
function fmtPct(v: number) {
  return isNaN(v) ? '—' : `${v.toFixed(0)}%`
}
function countFreq(arrays: (string[] | null)[]): [string, number][] {
  const freq: Record<string, number> = {}
  for (const arr of arrays) {
    if (!arr) continue
    for (const item of arr) freq[item] = (freq[item] ?? 0) + 1
  }
  return Object.entries(freq).sort((a, b) => b[1] - a[1])
}

function KpiMiniCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">{label}</p>
      <p className={cn('text-2xl font-bold', color ?? 'text-zinc-900 dark:text-zinc-100')}>{value}</p>
      {sub && <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function MetricRow({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className={cn('text-sm font-semibold', highlight ? 'text-red-600 dark:text-red-400' : 'text-zinc-800 dark:text-zinc-200')}>
        {value}
      </span>
    </div>
  )
}

function ReportDetail({ report, onClose }: { report: SpcReport; onClose: () => void }) {
  function Row({ label, value }: { label: string; value: string | number | null }) {
    if (!value && value !== 0) return null
    return (
      <div className="flex items-start gap-2 py-1">
        <span className="text-xs text-zinc-400 w-36 shrink-0">{label}</span>
        <span className="text-xs text-zinc-700 dark:text-zinc-300 font-medium">{String(value)}</span>
      </div>
    )
  }
  function Chips({ arr }: { arr: string[] | null }) {
    if (!arr?.length) return <span className="text-xs text-zinc-400">—</span>
    return (
      <div className="flex flex-wrap gap-1.5 mt-1">
        {arr.map((v) => (
          <span key={v} className="inline-flex px-2 py-0.5 rounded-full text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
            {v}
          </span>
        ))}
      </div>
    )
  }

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="text-base">
          SPC Report — {report.rep_name} · {formatDate(report.date)}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-5 mt-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-teal-600 mb-2">Community</p>
          <div className="grid grid-cols-2 gap-x-6">
            <Row label="Active members" value={report.c_active_members} />
            <Row label="New members" value={report.c_new_members} />
            <Row label="Reactivated" value={report.c_reactivated} />
            <Row label="At risk" value={report.c_at_risk} />
            <Row label="Churned" value={report.c_churn} />
          </div>
          {report.c_notas && <p className="text-xs text-zinc-500 italic mt-1">{report.c_notas}</p>}
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-blue-600 mb-2">Content & Activity</p>
          <div className="grid grid-cols-2 gap-x-6">
            <Row label="Posts published" value={report.a_posts} />
            <Row label="Comments / reactions" value={report.a_comments} />
            <Row label="Lives / calls" value={report.a_lives} />
            <Row label="Engagement" value={report.a_engagement} />
          </div>
          {report.a_notas && <p className="text-xs text-zinc-500 italic mt-1">{report.a_notas}</p>}
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-red-600 mb-2">Retention</p>
          <div className="grid grid-cols-2 gap-x-6">
            <Row label="Requests" value={report.r_requests} />
            <Row label="Saved" value={report.r_saved} />
            <Row label="Churn" value={report.r_churn} />
          </div>
          <div className="mt-1"><span className="text-xs text-zinc-400">Reasons:</span><Chips arr={report.r_cancel_reasons} /></div>
          {report.r_notas && <p className="text-xs text-zinc-500 italic mt-1">{report.r_notas}</p>}
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-green-600 mb-2">Daily Closeout</p>
          {report.e_wins && (
            <div className="mb-2">
              <p className="text-xs text-zinc-400 mb-0.5">What went well?</p>
              <p className="text-xs text-zinc-700 dark:text-zinc-300">{report.e_wins}</p>
            </div>
          )}
          {report.e_risks && (
            <div className="mb-2">
              <p className="text-xs text-zinc-400 mb-0.5">Risks</p>
              <p className="text-xs text-zinc-700 dark:text-zinc-300">{report.e_risks}</p>
            </div>
          )}
          {(report.e_action1 || report.e_action2 || report.e_action3) && (
            <div className="mb-2">
              <p className="text-xs text-zinc-400 mb-1">Actions for tomorrow</p>
              <ol className="space-y-0.5 list-decimal list-inside">
                {[report.e_action1, report.e_action2, report.e_action3].filter(Boolean).map((a, i) => (
                  <li key={i} className="text-xs text-zinc-700 dark:text-zinc-300">{a}</li>
                ))}
              </ol>
            </div>
          )}
          <Row label="Performance" value={`${report.e_performance}/10`} />
        </div>
      </div>
    </DialogContent>
  )
}

export default function SpcDashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const [reports, setReports] = useState<SpcReport[]>([])
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState<Preset>('7d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [selectedRep, setSelectedRep] = useState('All')
  const [page, setPage] = useState(0)
  const [detailReport, setDetailReport] = useState<SpcReport | null>(null)

  const { from: fromDate, to: toDate } = useMemo(
    () => getDateRange(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  )

  const fetchReports = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('spc_reports')
      .select('*')
      .gte('date', fromDate)
      .lte('date', toDate)
      .order('date', { ascending: false })
    if (selectedRep !== 'All') q = q.eq('rep_name', selectedRep)
    const { data } = await q
    setReports(data ?? [])
    setLoading(false)
  }, [supabase, fromDate, toDate, selectedRep])

  useEffect(() => { fetchReports() }, [fetchReports])

  const repNames = useMemo(() => {
    const names = Array.from(new Set(reports.map((r) => r.rep_name)))
    return ['All', ...names]
  }, [reports])

  const kpis = useMemo(() => {
    const latestMembers = reports.length > 0 ? reports[0].c_active_members : 0
    const totalNew = reports.reduce((s, r) => s + r.c_new_members, 0)
    const totalChurn = reports.reduce((s, r) => s + r.c_churn + r.r_churn, 0)
    const totalRequests = reports.reduce((s, r) => s + r.r_requests, 0)
    const totalSaved = reports.reduce((s, r) => s + r.r_saved, 0)
    const totalPosts = reports.reduce((s, r) => s + r.a_posts, 0)
    const totalLives = reports.reduce((s, r) => s + r.a_lives, 0)
    const avgPerf = reports.length > 0
      ? reports.reduce((s, r) => s + r.e_performance, 0) / reports.length
      : NaN

    const engFreq: Record<string, number> = {}
    reports.forEach((r) => { engFreq[r.a_engagement] = (engFreq[r.a_engagement] ?? 0) + 1 })
    const engMode = Object.entries(engFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'

    return {
      latestMembers,
      totalNew,
      totalChurn,
      rescuePct: pct(totalSaved, totalRequests),
      rescueLabel: `${totalSaved} saved of ${totalRequests} requests`,
      engMode,
      totalPosts,
      totalLives,
      avgPerf: isNaN(avgPerf) ? '—' : avgPerf.toFixed(1),
    }
  }, [reports])

  const chartData = useMemo(() => {
    const byDate: Record<string, {
      date: string
      active: number
      new_members: number
      churn: number
      posts: number
      comments: number
      performance: number
      count: number
    }> = {}
    for (const r of [...reports].reverse()) {
      if (!byDate[r.date]) byDate[r.date] = { date: formatDate(r.date), active: 0, new_members: 0, churn: 0, posts: 0, comments: 0, performance: 0, count: 0 }
      const d = byDate[r.date]
      d.active = r.c_active_members
      d.new_members += r.c_new_members
      d.churn += r.c_churn + r.r_churn
      d.posts += r.a_posts
      d.comments += r.a_comments
      d.performance += r.e_performance
      d.count += 1
    }
    return Object.values(byDate).map((d) => ({
      ...d,
      performance: d.count > 0 ? parseFloat((d.performance / d.count).toFixed(1)) : 0,
    }))
  }, [reports])

  const cancelFreq = useMemo(() => countFreq(reports.map((r) => r.r_cancel_reasons)), [reports])
  const totalCancel = cancelFreq.reduce((s, [, c]) => s + c, 0)

  const totalPages = Math.ceil(reports.length / PAGE_SIZE)
  const pageReports = reports.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function engColor(v: string) {
    if (v === 'High') return 'text-teal-600 dark:text-teal-400'
    if (v === 'Medium') return 'text-amber-600 dark:text-amber-400'
    return 'text-red-600 dark:text-red-400'
  }
  function rescueColor(v: number) {
    if (isNaN(v)) return 'text-zinc-400'
    if (v >= 70) return 'text-green-600 dark:text-green-400'
    if (v >= 50) return 'text-amber-600 dark:text-amber-400'
    return 'text-red-600 dark:text-red-400'
  }
  function perfColor(v: number) {
    if (v >= 8) return 'text-green-600 dark:text-green-400'
    if (v >= 6) return 'text-amber-600 dark:text-amber-400'
    return 'text-red-600 dark:text-red-400'
  }

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto">
        <PageHeader title="Client Success — SPC" description="Daily SPC community management">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Preset buttons */}
            <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden">
              {(['7d', '30d', '90d', 'custom'] as Preset[]).map((p) => (
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
                  {p === 'custom' ? 'Custom' : p}
                </button>
              ))}
            </div>
            {preset === 'custom' && (
              <>
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                  className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100" />
                <span className="text-xs text-zinc-400">to</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                  className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100" />
              </>
            )}
            <select
              value={selectedRep}
              onChange={(e) => setSelectedRep(e.target.value)}
              className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            >
              {repNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <Link
              href="/equipo/spc/nuevo"
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-64 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-xl" />
              ))}
            </div>
          </div>
        ) : reports.length === 0 ? (
          <EmptyState
            title="No reports in this period"
            description="Create the first SPC report to see metrics here."
            icon={<Plus className="h-10 w-10" />}
          />
        ) : (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <KpiMiniCard
                label="Active Members"
                value={String(kpis.latestMembers)}
                sub="last report snapshot"
                color="text-teal-600 dark:text-teal-400"
              />
              <KpiMiniCard
                label="New Members"
                value={String(kpis.totalNew)}
                sub="joined in period"
                color="text-green-600 dark:text-green-400"
              />
              <KpiMiniCard
                label="Cumulative Churn"
                value={String(kpis.totalChurn)}
                sub="cancellations in period"
                color={kpis.totalChurn > 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-500'}
              />
              <KpiMiniCard
                label="Rescue Rate"
                value={fmtPct(kpis.rescuePct)}
                sub={kpis.rescueLabel}
                color={rescueColor(kpis.rescuePct)}
              />
              <KpiMiniCard
                label="Posts Published"
                value={String(kpis.totalPosts)}
                sub="content pieces"
                color="text-blue-600 dark:text-blue-400"
              />
              <KpiMiniCard
                label="Lives / Calls"
                value={String(kpis.totalLives)}
                sub="sessions hosted"
                color="text-purple-600 dark:text-purple-400"
              />
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">Engagement</p>
                <span className={cn(
                  'inline-flex px-2.5 py-1 rounded-full text-sm font-bold',
                  kpis.engMode === 'High' ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300' :
                  kpis.engMode === 'Medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                  'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                )}>
                  {kpis.engMode}
                </span>
              </div>
              <KpiMiniCard
                label="Avg Performance"
                value={`${kpis.avgPerf}/10`}
                sub="self-assessed score"
                color={typeof kpis.avgPerf === 'string' ? 'text-zinc-400' : perfColor(parseFloat(kpis.avgPerf))}
              />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Community Size</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="active" name="Active Members" stroke="#0d9488" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Retention — New vs Churn</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(value, name) => [String(value), name === 'new_members' ? 'New' : 'Churn']}
                        contentStyle={{ fontSize: 11 }}
                      />
                      <Legend formatter={(v) => <span className="text-xs">{v === 'new_members' ? 'New' : 'Churn'}</span>} />
                      <Bar dataKey="new_members" name="new_members" fill="#3B6D11" radius={[3, 3, 0, 0]} maxBarSize={32} />
                      <Bar dataKey="churn" name="churn" fill="#A32D2D" radius={[3, 3, 0, 0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Daily Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(value, name) => [String(value), name === 'posts' ? 'Posts' : 'Comments']}
                        contentStyle={{ fontSize: 11 }}
                      />
                      <Legend formatter={(v) => <span className="text-xs">{v === 'posts' ? 'Posts' : 'Comments'}</span>} />
                      <Bar dataKey="posts" name="posts" fill="#185FA5" radius={[3, 3, 0, 0]} maxBarSize={32} />
                      <Bar dataKey="comments" name="comments" fill="#7C3AED" radius={[3, 3, 0, 0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Cancellation reasons */}
            {cancelFreq.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">Cancellation reasons</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2.5">
                      {cancelFreq.map(([label, count]) => {
                        const p = totalCancel > 0 ? (count / totalCancel) * 100 : 0
                        return (
                          <div key={label}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
                              <span className="font-semibold text-red-600 dark:text-red-400">{count} ({p.toFixed(0)}%)</span>
                            </div>
                            <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full">
                              <div className="h-full bg-red-400 rounded-full" style={{ width: `${p}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">Community health summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <MetricRow label="Active members (latest)" value={kpis.latestMembers} />
                    <MetricRow label="Net new in period" value={kpis.totalNew - kpis.totalChurn} highlight={kpis.totalNew - kpis.totalChurn < 0} />
                    <MetricRow label="At-risk (total reports)" value={reports.reduce((s, r) => s + r.c_at_risk, 0)} highlight={reports.reduce((s, r) => s + r.c_at_risk, 0) > 0} />
                    <MetricRow label="Lives hosted" value={reports.reduce((s, r) => s + r.a_lives, 0)} />
                    <MetricRow label="Total comments / reactions" value={reports.reduce((s, r) => s + r.a_comments, 0)} />
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Reports table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Report History</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800">
                        {['Date', 'Rep', 'Active', 'New', 'Churn', 'Rescue%', 'Posts', 'Engagement', 'Perf', ''].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {pageReports.map((r) => {
                        const rescPct = pct(r.r_saved, r.r_requests)
                        return (
                          <motion.tr
                            key={r.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                          >
                            <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">{formatDate(r.date)}</td>
                            <td className="px-4 py-3 text-sm font-medium text-zinc-800 dark:text-zinc-200 whitespace-nowrap">{r.rep_name}</td>
                            <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">{r.c_active_members}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-green-600 dark:text-green-400">{r.c_new_members > 0 ? `+${r.c_new_members}` : '0'}</td>
                            <td className={cn('px-4 py-3 text-sm font-semibold', (r.c_churn + r.r_churn) > 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-500')}>{r.c_churn + r.r_churn}</td>
                            <td className={cn('px-4 py-3 text-sm font-semibold', rescueColor(rescPct))}>{fmtPct(rescPct)}</td>
                            <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">{r.a_posts}</td>
                            <td className="px-4 py-3">
                              <span className={cn(
                                'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                                r.a_engagement === 'High' ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300' :
                                r.a_engagement === 'Medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                                'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                              )}>
                                {r.a_engagement}
                              </span>
                            </td>
                            <td className={cn('px-4 py-3 text-sm font-semibold', perfColor(r.e_performance))}>{r.e_performance}/10</td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => setDetailReport(r)}
                                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                View
                              </button>
                            </td>
                          </motion.tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100 dark:border-zinc-800">
                    <p className="text-xs text-zinc-400">
                      {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, reports.length)} of {reports.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 disabled:opacity-30">
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 disabled:opacity-30">
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

      <Dialog open={!!detailReport} onOpenChange={() => setDetailReport(null)}>
        {detailReport && <ReportDetail report={detailReport} onClose={() => setDetailReport(null)} />}
      </Dialog>
    </PageTransition>
  )
}
