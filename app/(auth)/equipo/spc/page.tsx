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
import { Plus, ChevronLeft, ChevronRight, Check, X } from 'lucide-react'
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
  if (preset === '7d') { const f = new Date(today); f.setDate(today.getDate() - 6); return { from: fmt(f), to: fmt(today) } }
  if (preset === '30d') { const f = new Date(today); f.setDate(today.getDate() - 29); return { from: fmt(f), to: fmt(today) } }
  if (preset === '90d') { const f = new Date(today); f.setDate(today.getDate() - 89); return { from: fmt(f), to: fmt(today) } }
  return { from: customFrom ?? fmt(today), to: customTo ?? fmt(today) }
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
      <span className={cn('text-sm font-semibold', highlight ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-800 dark:text-zinc-200')}>
        {value}
      </span>
    </div>
  )
}

function BoolBadge({ value }: { value: boolean }) {
  return value
    ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"><Check className="h-3 w-3" />Yes</span>
    : <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"><X className="h-3 w-3" />No</span>
}

function ReportDetail({ report, onClose }: { report: SpcReport; onClose: () => void }) {
  function Row({ label, value }: { label: string; value: string | number | null | boolean }) {
    if (value === null || value === undefined || value === '') return null
    const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)
    return (
      <div className="flex items-start gap-2 py-1">
        <span className="text-xs text-zinc-400 w-44 shrink-0">{label}</span>
        <span className="text-xs text-zinc-700 dark:text-zinc-300 font-medium">{display}</span>
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
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">Basic Info</p>
          <Row label="Hours worked" value={report.hours_worked} />
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-teal-600 mb-2">Community Metrics</p>
          <div className="grid grid-cols-2 gap-x-6">
            <Row label="Community size" value={report.community_size} />
            <Row label="New members" value={report.new_members} />
            <Row label="Members welcomed" value={report.members_welcomed} />
            <Row label="Members introduced" value={report.members_introduced} />
            <Row label="Questions answered" value={report.questions_answered} />
            <Row label="Wins shared" value={report.wins_shared} />
          </div>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-blue-600 mb-2">Content & Activity</p>
          <Row label="Published post" value={report.published_post} />
          {report.published_post && <Row label="Post type" value={report.post_type} />}
          <Row label="Sent class reminder" value={report.sent_class_reminder} />
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-red-600 mb-2">Retention</p>
          <Row label="Inactive identified" value={report.inactive_identified} />
          <Row label="Check-in messages sent" value={report.checkin_messages_sent} />
          <Row label="Parent frustration" value={report.parent_frustration} />
          {report.parent_frustration && report.parent_frustration_notes && (
            <div className="mt-1 ml-44 text-xs text-zinc-500 italic">{report.parent_frustration_notes}</div>
          )}
          <Row label="Referral mentioned" value={report.referral_mentioned} />
          {report.referral_mentioned && <Row label="Referrals count" value={report.referrals_count} />}
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-green-600 mb-2">End of Day</p>
          {report.highs && (
            <div className="mb-2">
              <p className="text-xs text-zinc-400 mb-0.5">Highs</p>
              <p className="text-xs text-zinc-700 dark:text-zinc-300">{report.highs}</p>
            </div>
          )}
          {report.lows && (
            <div className="mb-2">
              <p className="text-xs text-zinc-400 mb-0.5">Lows</p>
              <p className="text-xs text-zinc-700 dark:text-zinc-300">{report.lows}</p>
            </div>
          )}
          <Row label="Performance" value={`${report.performance}/10`} />
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
      .from('spc_csm_reports')
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
    const latestSize = reports.length > 0 ? reports[0].community_size : 0
    const totalNew = reports.reduce((s, r) => s + r.new_members, 0)
    const totalWelcomed = reports.reduce((s, r) => s + r.members_welcomed, 0)
    const totalQA = reports.reduce((s, r) => s + r.questions_answered, 0)
    const totalWins = reports.reduce((s, r) => s + r.wins_shared, 0)
    const totalReferrals = reports.reduce((s, r) => s + r.referrals_count, 0)
    const postsPublished = reports.filter((r) => r.published_post).length
    const avgPerf = reports.length > 0
      ? reports.reduce((s, r) => s + r.performance, 0) / reports.length
      : NaN
    const frustrationCount = reports.filter((r) => r.parent_frustration).length
    const totalCheckins = reports.reduce((s, r) => s + r.checkin_messages_sent, 0)
    return {
      latestSize, totalNew, totalWelcomed, totalQA, totalWins,
      totalReferrals, postsPublished, frustrationCount, totalCheckins,
      avgPerf: isNaN(avgPerf) ? '—' : avgPerf.toFixed(1),
    }
  }, [reports])

  const chartData = useMemo(() => {
    const byDate: Record<string, {
      date: string; community_size: number
      new_members: number; welcomed: number; qa: number
      performance: number; count: number
    }> = {}
    for (const r of [...reports].reverse()) {
      if (!byDate[r.date]) byDate[r.date] = { date: formatDate(r.date), community_size: 0, new_members: 0, welcomed: 0, qa: 0, performance: 0, count: 0 }
      const d = byDate[r.date]
      d.community_size = r.community_size
      d.new_members += r.new_members
      d.welcomed += r.members_welcomed
      d.qa += r.questions_answered
      d.performance += r.performance
      d.count += 1
    }
    return Object.values(byDate).map((d) => ({
      ...d,
      performance: d.count > 0 ? parseFloat((d.performance / d.count).toFixed(1)) : 0,
    }))
  }, [reports])

  function perfColor(v: number) {
    if (v >= 8) return 'text-green-600 dark:text-green-400'
    if (v >= 6) return 'text-amber-600 dark:text-amber-400'
    return 'text-red-600 dark:text-red-400'
  }

  const totalPages = Math.ceil(reports.length / PAGE_SIZE)
  const pageReports = reports.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto">
        <PageHeader title="Client Success — SPC" description="Daily SPC community management">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden">
              {(['7d', '30d', '90d', 'custom'] as Preset[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPreset(p)}
                  className={cn(
                    'px-2.5 py-1.5 text-xs font-medium transition-colors',
                    preset === p ? 'bg-[#185FA5] text-white' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
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
                label="Community Size"
                value={String(kpis.latestSize)}
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
                label="Members Welcomed"
                value={String(kpis.totalWelcomed)}
                sub="onboarding touchpoints"
              />
              <KpiMiniCard
                label="Questions Answered"
                value={String(kpis.totalQA)}
                sub="community support"
                color="text-blue-600 dark:text-blue-400"
              />
              <KpiMiniCard
                label="Wins Shared"
                value={String(kpis.totalWins)}
                sub="member highlights"
                color="text-purple-600 dark:text-purple-400"
              />
              <KpiMiniCard
                label="Posts Published"
                value={String(kpis.postsPublished)}
                sub={`of ${reports.length} days`}
                color="text-blue-600 dark:text-blue-400"
              />
              <KpiMiniCard
                label="Referrals"
                value={String(kpis.totalReferrals)}
                sub="mentioned in period"
                color="text-indigo-600 dark:text-indigo-400"
              />
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
                      <Line type="monotone" dataKey="community_size" name="Community Size" stroke="#0d9488" strokeWidth={2} dot={false} />
                    </LineChart>
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
                        formatter={(value, name) => [String(value), name === 'welcomed' ? 'Welcomed' : 'Q&A']}
                        contentStyle={{ fontSize: 11 }}
                      />
                      <Legend formatter={(v) => <span className="text-xs">{v === 'welcomed' ? 'Welcomed' : 'Q&A'}</span>} />
                      <Bar dataKey="welcomed" name="welcomed" fill="#185FA5" radius={[3, 3, 0, 0]} maxBarSize={32} />
                      <Bar dataKey="qa" name="qa" fill="#7C3AED" radius={[3, 3, 0, 0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Performance Score</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <YAxis domain={[1, 10]} tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v) => [`${v}/10`, 'Performance']} contentStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="performance" name="Performance" stroke="#1D9E75" strokeWidth={2} dot={{ r: 3, fill: '#1D9E75' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Summary card */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Community health summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <MetricRow label="Members introduced" value={reports.reduce((s, r) => s + r.members_introduced, 0)} />
                  <MetricRow label="Check-in messages sent" value={kpis.totalCheckins} />
                  <MetricRow label="Inactive members identified" value={reports.reduce((s, r) => s + r.inactive_identified, 0)} />
                  <MetricRow label="Parent frustration reports" value={kpis.frustrationCount} highlight={kpis.frustrationCount > 0} />
                  <MetricRow label="Class reminders sent" value={reports.filter((r) => r.sent_class_reminder).length} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Content activity</CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const postTypes: Record<string, number> = {}
                    reports.filter((r) => r.published_post && r.post_type).forEach((r) => {
                      postTypes[r.post_type!] = (postTypes[r.post_type!] ?? 0) + 1
                    })
                    const entries = Object.entries(postTypes).sort((a, b) => b[1] - a[1])
                    if (entries.length === 0) return (
                      <p className="text-xs text-zinc-400 py-4 text-center">No posts published in this period</p>
                    )
                    return entries.map(([label, count]) => (
                      <MetricRow key={label} label={label} value={count} />
                    ))
                  })()}
                </CardContent>
              </Card>
            </div>

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
                        {['Date', 'Rep', 'Comm. Size', 'New', 'Welcomed', 'Q&A', 'Post', 'Frustration', 'Perf', ''].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {pageReports.map((r) => (
                        <motion.tr
                          key={r.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                        >
                          <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">{formatDate(r.date)}</td>
                          <td className="px-4 py-3 text-sm font-medium text-zinc-800 dark:text-zinc-200 whitespace-nowrap">{r.rep_name}</td>
                          <td className="px-4 py-3 text-sm text-teal-600 dark:text-teal-400 font-semibold">{r.community_size}</td>
                          <td className="px-4 py-3 text-sm text-green-600 dark:text-green-400 font-semibold">{r.new_members > 0 ? `+${r.new_members}` : '0'}</td>
                          <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">{r.members_welcomed}</td>
                          <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">{r.questions_answered}</td>
                          <td className="px-4 py-3"><BoolBadge value={r.published_post} /></td>
                          <td className="px-4 py-3"><BoolBadge value={r.parent_frustration} /></td>
                          <td className={cn('px-4 py-3 text-sm font-semibold', perfColor(r.performance))}>{r.performance}/10</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setDetailReport(r)}
                              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              View
                            </button>
                          </td>
                        </motion.tr>
                      ))}
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
