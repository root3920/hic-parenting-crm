'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  Search, X, FileText, AlertTriangle, Brain, Wrench,
  TrendingUp, Heart, HeartHandshake, Eye, ChevronDown,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { KPICard } from '@/components/shared/KPICard'
import { KPICardGrid } from '@/components/motion/KPICardGrid'
import { PageTransition } from '@/components/motion/PageTransition'
import { PageHeader } from '@/components/layout/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AnimatedTableRow, rowVariants } from '@/components/motion/AnimatedTableRow'

export const dynamic = 'force-dynamic'

/* ─── Types ──────────────────────────────────────────────────── */

interface GrowthReport {
  id: string
  client_name: string
  coach_name: string
  session_number: string | null
  session_date: string
  coaching_type: string | null
  conn_self_score: number | null
  conn_self_note: string | null
  conn_child_score: number | null
  conn_child_note: string | null
  awareness_text: string | null
  awareness_score: number | null
  impl_tools: string | null
  impl_notes: string | null
  impl_score: number | null
  grow_where: string | null
  grow_signs: string | null
  grow_score: number | null
  concern_level: string | null
  client_signals: string[] | null
  coach_notes: string | null
  created_at: string
}

type Tab = 'dashboard' | 'new'
type DateRange = '7d' | '30d' | '90d' | 'all'

const CONCERN_COLORS: Record<string, string> = {
  Low: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  Medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  High: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
}

const SIGNAL_OPTIONS = [
  'Feeling discouraged',
  'Overwhelmed',
  'Highly motivated',
  'Consistently implementing',
  'Struggling with implementation',
  'Emotionally disconnected',
  'Experiencing breakthroughs',
  'At retention risk',
  'Good graduate candidate',
  'Needs additional support',
]

const LINE_COLORS: Record<string, string> = {
  awareness: '#6366f1',
  implementation: '#f59e0b',
  growth: '#10b981',
  conn_self: '#ec4899',
  conn_child: '#3b82f6',
}

/* ─── Main Page ──────────────────────────────────────────────── */

export default function GrowthPage() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [reports, setReports] = useState<GrowthReport[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<DateRange>('30d')
  const [coachFilter, setCoachFilter] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [selectedReport, setSelectedReport] = useState<GrowthReport | null>(null)

  const fetchReports = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (dateRange !== 'all') {
      const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90
      const from = new Date()
      from.setDate(from.getDate() - days)
      params.set('from', from.toISOString().split('T')[0])
    }
    if (coachFilter) params.set('coach', coachFilter)
    if (clientSearch) params.set('client', clientSearch)

    const res = await fetch(`/api/growth/reports?${params}`)
    if (res.ok) setReports(await res.json())
    setLoading(false)
  }, [dateRange, coachFilter, clientSearch])

  useEffect(() => { fetchReports() }, [fetchReports])

  const coaches = useMemo(() => {
    const set = new Set(reports.map(r => r.coach_name))
    return Array.from(set).sort()
  }, [reports])

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto">
        <PageHeader title="Growth" description="Track client coaching progress and growth metrics">
          <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl p-1">
            {([['dashboard', 'Dashboard'], ['new', '+ New Report']] as [Tab, string][]).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === value
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </PageHeader>

        {tab === 'dashboard' ? (
          <DashboardTab
            reports={reports}
            loading={loading}
            dateRange={dateRange}
            setDateRange={setDateRange}
            coachFilter={coachFilter}
            setCoachFilter={setCoachFilter}
            clientSearch={clientSearch}
            setClientSearch={setClientSearch}
            coaches={coaches}
            onViewReport={setSelectedReport}
          />
        ) : (
          <NewReportTab onSaved={() => { setTab('dashboard'); fetchReports() }} />
        )}

        <AnimatePresence>
          {selectedReport && (
            <ReportDetailModal report={selectedReport} onClose={() => setSelectedReport(null)} />
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  )
}

/* ─── Dashboard Tab ──────────────────────────────────────────── */

function DashboardTab({
  reports, loading, dateRange, setDateRange, coachFilter, setCoachFilter,
  clientSearch, setClientSearch, coaches, onViewReport,
}: {
  reports: GrowthReport[]
  loading: boolean
  dateRange: DateRange
  setDateRange: (v: DateRange) => void
  coachFilter: string
  setCoachFilter: (v: string) => void
  clientSearch: string
  setClientSearch: (v: string) => void
  coaches: string[]
  onViewReport: (r: GrowthReport) => void
}) {
  const kpis = useMemo(() => {
    const n = reports.length
    const avg = (fn: (r: GrowthReport) => number | null) => {
      const vals = reports.map(fn).filter((v): v is number => v != null)
      return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : 0
    }
    return {
      total: n,
      avgAwareness: avg(r => r.awareness_score),
      avgImpl: avg(r => r.impl_score),
      avgGrowth: avg(r => r.grow_score),
      avgConnSelf: avg(r => r.conn_self_score),
      avgConnChild: avg(r => r.conn_child_score),
      highConcern: reports.filter(r => r.concern_level === 'High').length,
      atRisk: reports.filter(r => r.client_signals?.includes('At retention risk')).length,
    }
  }, [reports])

  // Chart data
  const trendData = useMemo(() => {
    const sorted = [...reports].sort((a, b) => a.session_date.localeCompare(b.session_date))
    return sorted.map(r => ({
      date: new Date(r.session_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      awareness: r.awareness_score,
      implementation: r.impl_score,
      growth: r.grow_score,
      conn_self: r.conn_self_score,
      conn_child: r.conn_child_score,
    }))
  }, [reports])

  const coachData = useMemo(() => {
    const map: Record<string, number> = {}
    reports.forEach(r => { map[r.coach_name] = (map[r.coach_name] || 0) + 1 })
    return Object.entries(map).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
  }, [reports])

  const concernData = useMemo(() => {
    const map: Record<string, number> = { Low: 0, Medium: 0, High: 0 }
    reports.forEach(r => { if (r.concern_level) map[r.concern_level] = (map[r.concern_level] || 0) + 1 })
    return [
      { name: 'Low', value: map.Low, color: '#10b981' },
      { name: 'Medium', value: map.Medium, color: '#f59e0b' },
      { name: 'High', value: map.High, color: '#ef4444' },
    ].filter(d => d.value > 0)
  }, [reports])

  const signalData = useMemo(() => {
    const map: Record<string, number> = {}
    SIGNAL_OPTIONS.forEach(s => { map[s] = 0 })
    reports.forEach(r => r.client_signals?.forEach(s => { map[s] = (map[s] || 0) + 1 }))
    return Object.entries(map).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
  }, [reports])

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
        <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl p-1">
          {(['7d', '30d', '90d', 'all'] as DateRange[]).map(d => (
            <button
              key={d}
              onClick={() => setDateRange(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                dateRange === d
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              {d === 'all' ? 'All' : d}
            </button>
          ))}
        </div>

        <div className="relative">
          <select
            value={coachFilter}
            onChange={e => setCoachFilter(e.target.value)}
            className="pl-3 pr-8 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 appearance-none"
          >
            <option value="">All Coaches</option>
            {coaches.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search by client name..."
            value={clientSearch}
            onChange={e => setClientSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
      </div>

      {/* KPI Cards */}
      <KPICardGrid className="grid gap-4 grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
        <KPICard title="Total Reports" value={kpis.total} icon={<FileText className="h-4 w-4" />} loading={loading} />
        <KPICard title="Avg Awareness" value={kpis.avgAwareness} icon={<Brain className="h-4 w-4" />} loading={loading} subtitle="out of 10" />
        <KPICard title="Avg Implementation" value={kpis.avgImpl} icon={<Wrench className="h-4 w-4" />} loading={loading} subtitle="out of 10" />
        <KPICard title="Avg Growth" value={kpis.avgGrowth} icon={<TrendingUp className="h-4 w-4" />} loading={loading} subtitle="out of 10" />
        <KPICard title="Avg Conn. Self" value={kpis.avgConnSelf} icon={<Heart className="h-4 w-4" />} loading={loading} subtitle="out of 10" />
        <KPICard title="Avg Conn. Child" value={kpis.avgConnChild} icon={<HeartHandshake className="h-4 w-4" />} loading={loading} subtitle="out of 10" />
        <KPICard title="High Concern" value={kpis.highConcern} icon={<AlertTriangle className="h-4 w-4" />} loading={loading} subtitle="clients" />
        <KPICard title="At Retention Risk" value={kpis.atRisk} icon={<AlertTriangle className="h-4 w-4" />} loading={loading} subtitle="clients" />
      </KPICardGrid>

      {/* Charts */}
      {!loading && reports.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Line chart */}
          <Card className="lg:col-span-2">
            <CardContent className="pt-5">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Score trends over time</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={trendData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#71717a' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: '#71717a' }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip content={<ScoreTooltip />} />
                  <Line type="monotone" dataKey="awareness" stroke={LINE_COLORS.awareness} strokeWidth={2} dot={false} name="Awareness" />
                  <Line type="monotone" dataKey="implementation" stroke={LINE_COLORS.implementation} strokeWidth={2} dot={false} name="Implementation" />
                  <Line type="monotone" dataKey="growth" stroke={LINE_COLORS.growth} strokeWidth={2} dot={false} name="Growth" />
                  <Line type="monotone" dataKey="conn_self" stroke={LINE_COLORS.conn_self} strokeWidth={2} dot={false} name="Connection Self" />
                  <Line type="monotone" dataKey="conn_child" stroke={LINE_COLORS.conn_child} strokeWidth={2} dot={false} name="Connection Child" />
                  <Legend iconType="circle" iconSize={8} formatter={(value) => <span className="text-xs text-zinc-600 dark:text-zinc-400">{value}</span>} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Bar chart — reports by coach */}
          <Card>
            <CardContent className="pt-5">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Reports by coach</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={coachData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#71717a' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#71717a' }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
                  <Tooltip content={<CountTooltip />} cursor={{ fill: '#f4f4f5' }} />
                  <Bar dataKey="count" fill="#185FA5" radius={[3, 3, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Donut — concern level */}
          <Card>
            <CardContent className="pt-5">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Concern level distribution</h3>
              {concernData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={concernData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value">
                      {concernData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip content={<CountTooltip />} />
                    <Legend iconType="circle" iconSize={8} formatter={(value) => <span className="text-xs text-zinc-600 dark:text-zinc-400">{value}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-zinc-400 text-center py-10">No data</p>
              )}
            </CardContent>
          </Card>

          {/* Horizontal bar — signals */}
          <Card className="lg:col-span-2">
            <CardContent className="pt-5">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Client signals frequency</h3>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={signalData} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#71717a' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: '#71717a' }} axisLine={false} tickLine={false} width={190} />
                  <Tooltip content={<CountTooltip />} cursor={{ fill: '#f4f4f5' }} />
                  <Bar dataKey="count" fill="#6366f1" radius={[0, 3, 3, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Reports Table */}
      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Reports</h3>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />)}
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-8 w-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
              <p className="text-sm text-zinc-500">No reports found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <AnimatedTableRow variants={rowVariants} initial="hidden" animate="visible" custom={0}>
                    <TableHead>Date</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Coach</TableHead>
                    <TableHead className="hidden md:table-cell">Session #</TableHead>
                    <TableHead className="hidden md:table-cell">Type</TableHead>
                    <TableHead className="hidden lg:table-cell">Awareness</TableHead>
                    <TableHead className="hidden lg:table-cell">Implementation</TableHead>
                    <TableHead className="hidden lg:table-cell">Growth</TableHead>
                    <TableHead>Concern</TableHead>
                    <TableHead className="hidden xl:table-cell">Signals</TableHead>
                    <TableHead />
                  </AnimatedTableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((r, i) => (
                    <AnimatedTableRow key={r.id} variants={rowVariants} initial="hidden" animate="visible" custom={i + 1}>
                      <TableCell className="text-xs whitespace-nowrap">{new Date(r.session_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</TableCell>
                      <TableCell className="text-xs font-medium">{r.client_name}</TableCell>
                      <TableCell className="text-xs">{r.coach_name}</TableCell>
                      <TableCell className="text-xs hidden md:table-cell">{r.session_number || '—'}</TableCell>
                      <TableCell className="text-xs hidden md:table-cell">{r.coaching_type || '—'}</TableCell>
                      <TableCell className="text-xs hidden lg:table-cell">{r.awareness_score ?? '—'}</TableCell>
                      <TableCell className="text-xs hidden lg:table-cell">{r.impl_score ?? '—'}</TableCell>
                      <TableCell className="text-xs hidden lg:table-cell">{r.grow_score ?? '—'}</TableCell>
                      <TableCell>
                        {r.concern_level && (
                          <Badge className={`text-[10px] px-2 py-0.5 ${CONCERN_COLORS[r.concern_level] || ''}`}>
                            {r.concern_level}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {r.client_signals?.slice(0, 3).map(s => (
                            <span key={s} className="inline-block text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-full px-2 py-0.5">{s}</span>
                          ))}
                          {(r.client_signals?.length ?? 0) > 3 && (
                            <span className="text-[10px] text-zinc-400">+{r.client_signals!.length - 3}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" className="text-xs" onClick={() => onViewReport(r)}>View</Button>
                      </TableCell>
                    </AnimatedTableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/* ─── New Report Tab ─────────────────────────────────────────── */

function NewReportTab({ onSaved }: { onSaved: () => void }) {
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState('')

  // Form state
  const [clientName, setClientName] = useState('')
  const [coachName, setCoachName] = useState('')
  const [sessionNumber, setSessionNumber] = useState('')
  const [sessionDate, setSessionDate] = useState('')
  const [coachingType, setCoachingType] = useState<'Individual' | 'Group'>('Individual')

  const [connSelfScore, setConnSelfScore] = useState<number | null>(null)
  const [connSelfNote, setConnSelfNote] = useState('')
  const [connChildScore, setConnChildScore] = useState<number | null>(null)
  const [connChildNote, setConnChildNote] = useState('')

  const [awarenessText, setAwarenessText] = useState('')
  const [awarenessScore, setAwarenessScore] = useState<number | null>(null)

  const [implTools, setImplTools] = useState('')
  const [implNotes, setImplNotes] = useState('')
  const [implScore, setImplScore] = useState<number | null>(null)

  const [growWhere, setGrowWhere] = useState('')
  const [growSigns, setGrowSigns] = useState('')
  const [growScore, setGrowScore] = useState<number | null>(null)

  const [concernLevel, setConcernLevel] = useState<'Low' | 'Medium' | 'High'>('Low')
  const [clientSignals, setClientSignals] = useState<string[]>([])
  const [coachNotes, setCoachNotes] = useState('')

  function toggleSignal(s: string) {
    setClientSignals(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const body = {
      client_name: clientName,
      coach_name: coachName,
      session_number: sessionNumber || null,
      session_date: sessionDate,
      coaching_type: coachingType,
      conn_self_score: connSelfScore,
      conn_self_note: connSelfNote || null,
      conn_child_score: connChildScore,
      conn_child_note: connChildNote || null,
      awareness_text: awarenessText || null,
      awareness_score: awarenessScore,
      impl_tools: implTools || null,
      impl_notes: implNotes || null,
      impl_score: implScore,
      grow_where: growWhere || null,
      grow_signs: growSigns || null,
      grow_score: growScore,
      concern_level: concernLevel,
      client_signals: clientSignals.length > 0 ? clientSignals : null,
      coach_notes: coachNotes || null,
    }

    try {
      const res = await fetch('/api/growth/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed to save')
      }
      setToast('Report saved successfully')
      setTimeout(() => { setToast(''); onSaved() }, 1500)
    } catch (err: unknown) {
      setToast(err instanceof Error ? err.message : 'Error saving report')
      setTimeout(() => setToast(''), 3000)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      {/* Section 01 — Session Info */}
      <FormSection number="01" title="Session information">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Client name" required>
            <ClientCombobox value={clientName} onChange={setClientName} />
          </FormField>
          <FormField label="Coach name" required>
            <input value={coachName} onChange={e => setCoachName(e.target.value)} required className={inputClass} placeholder="Your name" />
          </FormField>
          <FormField label="Session number">
            <input value={sessionNumber} onChange={e => setSessionNumber(e.target.value)} className={inputClass} placeholder="e.g. 4" />
          </FormField>
          <FormField label="Session date" required>
            <input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} required className={inputClass} />
          </FormField>
        </div>
        <FormField label="Coaching type">
          <SegmentToggle
            options={['Individual', 'Group']}
            value={coachingType}
            onChange={v => setCoachingType(v as 'Individual' | 'Group')}
          />
        </FormField>
      </FormSection>

      {/* Section 02 — Connection Scores */}
      <FormSection number="02" title="Connection scores">
        <FormField label="Connection with self">
          <ScaleButtons value={connSelfScore} onChange={setConnSelfScore} />
          <textarea value={connSelfNote} onChange={e => setConnSelfNote(e.target.value)} className={textareaClass} placeholder="What influenced this score this week?" rows={2} />
        </FormField>
        <FormField label="Connection with child">
          <ScaleButtons value={connChildScore} onChange={setConnChildScore} />
          <textarea value={connChildNote} onChange={e => setConnChildNote(e.target.value)} className={textareaClass} placeholder="What influenced this score this week?" rows={2} />
        </FormField>
      </FormSection>

      {/* Section 03 — Awareness */}
      <FormSection number="03" title="Awareness">
        <FormField label="Where did the client experience awareness this week?">
          <textarea value={awarenessText} onChange={e => setAwarenessText(e.target.value)} className={textareaClass} rows={3} />
        </FormField>
        <FormField label="Awareness score">
          <ScaleButtons value={awarenessScore} onChange={setAwarenessScore} />
          <p className="text-xs text-zinc-400 mt-1.5">1-3 early awareness &middot; 4-6 increasing awareness &middot; 7-10 strong self-awareness emerging</p>
        </FormField>
      </FormSection>

      {/* Section 04 — Implementation */}
      <FormSection number="04" title="Implementation">
        <FormField label="What skills or tools did the client attempt to implement this week?">
          <textarea value={implTools} onChange={e => setImplTools(e.target.value)} className={textareaClass} rows={3} />
        </FormField>
        <FormField label="What implementation wins or struggles appeared?">
          <textarea value={implNotes} onChange={e => setImplNotes(e.target.value)} className={textareaClass} rows={3} />
        </FormField>
        <FormField label="Implementation score">
          <ScaleButtons value={implScore} onChange={setImplScore} />
          <p className="text-xs text-zinc-400 mt-1.5">1-3 experimenting &middot; 4-6 applying with effort &middot; 7-10 becoming consistent</p>
        </FormField>
      </FormSection>

      {/* Section 05 — Integration / Growth */}
      <FormSection number="05" title="Integration / Growth">
        <FormField label="Where is growth most visible this week?">
          <textarea value={growWhere} onChange={e => setGrowWhere(e.target.value)} className={textareaClass} rows={3} />
        </FormField>
        <FormField label="What signs of integration are emerging?">
          <textarea value={growSigns} onChange={e => setGrowSigns(e.target.value)} className={textareaClass} rows={3} />
        </FormField>
        <FormField label="Growth / integration score">
          <ScaleButtons value={growScore} onChange={setGrowScore} />
          <p className="text-xs text-zinc-400 mt-1.5">1-3 early growth &middot; 4-6 noticeable growth &middot; 7-10 sustainable integration emerging</p>
        </FormField>
      </FormSection>

      {/* Section 06 — Coach Observations */}
      <FormSection number="06" title="Coach observations">
        <FormField label="Concern level">
          <SegmentToggle
            options={['Low', 'Medium', 'High']}
            value={concernLevel}
            onChange={v => setConcernLevel(v as 'Low' | 'Medium' | 'High')}
            colors={{ Low: 'bg-emerald-500', Medium: 'bg-amber-500', High: 'bg-red-500' }}
          />
        </FormField>
        <FormField label="What's true for this client right now?">
          <div className="flex flex-wrap gap-2">
            {SIGNAL_OPTIONS.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => toggleSignal(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  clientSignals.includes(s)
                    ? 'bg-[#185FA5] text-white border-[#185FA5]'
                    : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </FormField>
        <FormField label="Additional coach notes">
          <textarea value={coachNotes} onChange={e => setCoachNotes(e.target.value)} className={textareaClass} rows={3} placeholder="Any additional notes..." />
        </FormField>
      </FormSection>

      <Button type="submit" disabled={submitting} className="w-full md:w-auto">
        {submitting ? 'Saving...' : "Save this week's report"}
      </Button>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-6 right-6 z-50 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium px-4 py-3 rounded-xl shadow-lg"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  )
}

/* ─── Client Combobox ────────────────────────────────────────── */

interface ActiveStudent {
  id: string
  first_name: string
  last_name: string | null
  email: string | null
}

function ClientCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [students, setStudents] = useState<ActiveStudent[]>([])
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState(value)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/students/active')
      .then(r => r.ok ? r.json() : [])
      .then(setStudents)
      .catch(() => {})
  }, [])

  // Sync external value changes into the search field
  useEffect(() => { setSearch(value) }, [value])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = useMemo(() => {
    if (!search) return students
    const q = search.toLowerCase()
    return students.filter(s => {
      const full = `${s.first_name} ${s.last_name || ''}`.toLowerCase()
      const email = (s.email || '').toLowerCase()
      return full.includes(q) || email.includes(q)
    })
  }, [students, search])

  function handleSelect(s: ActiveStudent) {
    const fullName = `${s.first_name} ${s.last_name || ''}`.trim()
    onChange(fullName)
    setSearch(fullName)
    setOpen(false)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setSearch(v)
    onChange(v)
    if (!open) setOpen(true)
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
        <input
          ref={inputRef}
          value={search}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          required
          className={`${inputClass} pl-9`}
          placeholder="Search or type client name..."
          autoComplete="off"
        />
      </div>

      <AnimatePresence>
        {open && filtered.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 top-full mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg"
          >
            {filtered.map(s => {
              const fullName = `${s.first_name} ${s.last_name || ''}`.trim()
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSelect(s)}
                  className="w-full text-left px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors border-b border-zinc-100 dark:border-zinc-800 last:border-0"
                >
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{fullName}</p>
                  {s.email && <p className="text-xs text-zinc-400 dark:text-zinc-500">{s.email}</p>}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Report Detail Modal ────────────────────────────────────── */

function ReportDetailModal({ report: r, onClose }: { report: GrowthReport; onClose: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-8 px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{r.client_name}</h2>
            <p className="text-xs text-zinc-500">Coach: {r.coach_name} &middot; Session {r.session_number || '—'} &middot; {new Date(r.session_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <X className="h-5 w-5 text-zinc-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">
          <div className="flex items-center gap-2">
            {r.coaching_type && <Badge variant="outline" className="text-xs">{r.coaching_type}</Badge>}
            {r.concern_level && <Badge className={`text-xs ${CONCERN_COLORS[r.concern_level]}`}>{r.concern_level} Concern</Badge>}
          </div>

          {/* Scores grid */}
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: 'Conn. Self', value: r.conn_self_score },
              { label: 'Conn. Child', value: r.conn_child_score },
              { label: 'Awareness', value: r.awareness_score },
              { label: 'Implement.', value: r.impl_score },
              { label: 'Growth', value: r.grow_score },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{value ?? '—'}</p>
                <p className="text-[10px] text-zinc-400 uppercase tracking-wide mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          <ModalSection title="Connection with self" content={r.conn_self_note} />
          <ModalSection title="Connection with child" content={r.conn_child_note} />
          <ModalSection title="Awareness" content={r.awareness_text} />
          <ModalSection title="Implementation — Tools" content={r.impl_tools} />
          <ModalSection title="Implementation — Notes" content={r.impl_notes} />
          <ModalSection title="Growth — Where visible" content={r.grow_where} />
          <ModalSection title="Growth — Signs of integration" content={r.grow_signs} />

          {r.client_signals && r.client_signals.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">Client Signals</h4>
              <div className="flex flex-wrap gap-1.5">
                {r.client_signals.map(s => (
                  <span key={s} className="inline-block text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-full px-2.5 py-1">{s}</span>
                ))}
              </div>
            </div>
          )}

          <ModalSection title="Coach Notes" content={r.coach_notes} />
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ─── Shared Form Components ─────────────────────────────────── */

const inputClass =
  'w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30'

const textareaClass =
  'w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 mt-2'

function FormSection({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-zinc-200 dark:border-zinc-800">
          <span className="flex items-center justify-center h-7 w-7 rounded-full bg-[#185FA5] text-white text-xs font-bold">{number}</span>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}

function ScaleButtons({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
        const isSelected = value === n
        let bg = 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400'
        if (isSelected) {
          if (n <= 3) bg = 'bg-red-500 text-white border-red-500'
          else if (n <= 6) bg = 'bg-amber-500 text-white border-amber-500'
          else bg = 'bg-emerald-500 text-white border-emerald-500'
        }
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`h-9 w-9 rounded-lg border text-sm font-semibold transition-colors ${bg}`}
          >
            {n}
          </button>
        )
      })}
    </div>
  )
}

function SegmentToggle({
  options,
  value,
  onChange,
  colors,
}: {
  options: string[]
  value: string
  onChange: (v: string) => void
  colors?: Record<string, string>
}) {
  return (
    <div className="inline-flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl p-1">
      {options.map(opt => {
        const isActive = value === opt
        const activeColor = colors?.[opt]
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isActive
                ? activeColor
                  ? `${activeColor} text-white`
                  : 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}

/* ─── Chart Tooltips ─────────────────────────────────────────── */

function ScoreTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-md px-3 py-2">
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-zinc-600 dark:text-zinc-300">{p.name}:</span>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

function CountTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-md px-3 py-2">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label || payload[0].name}</p>
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{payload[0].value}</p>
    </div>
  )
}

/* ─── Modal Helpers ──────────────────────────────────────────── */

function ModalSection({ title, content }: { title: string; content: string | null | undefined }) {
  if (!content) return null
  return (
    <div>
      <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">{title}</h4>
      <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">{content}</p>
    </div>
  )
}
