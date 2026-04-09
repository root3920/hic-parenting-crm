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
import { SetterDailyReport } from '@/types'
import { Plus, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GOALS } from '@/lib/goals'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from 'recharts'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

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

function sum(arr: SetterDailyReport[], key: keyof SetterDailyReport) {
  return arr.reduce((s, r) => s + ((r[key] as number) ?? 0), 0)
}

function safeDiv(num: number, den: number) {
  return den > 0 ? num / den : NaN
}

function fmtPct(v: number, decimals = 1) {
  return isNaN(v) ? '—' : `${v.toFixed(decimals)}%`
}

function fmtDec(v: number, decimals = 1) {
  return isNaN(v) ? '—' : v.toFixed(decimals)
}

function countFreq(arrays: (string[] | null)[]): [string, number][] {
  const freq: Record<string, number> = {}
  for (const arr of arrays) {
    if (!arr) continue
    for (const item of arr) {
      freq[item] = (freq[item] ?? 0) + 1
    }
  }
  return Object.entries(freq).sort((a, b) => b[1] - a[1])
}

function VolumeCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{value.toLocaleString()}</p>
      {sub && <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function ReportDetail({ report, onClose }: { report: SetterDailyReport; onClose: () => void }) {
  function chips(arr: string[] | null) {
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
  function Row({ label, value }: { label: string; value: string | number | null }) {
    if (value === null || value === undefined || value === '') return null
    return (
      <div className="flex items-start gap-2 py-1">
        <span className="text-xs text-zinc-400 w-36 shrink-0">{label}</span>
        <span className="text-xs text-zinc-700 dark:text-zinc-300 font-medium">{String(value)}</span>
      </div>
    )
  }

  const convRate = safeDiv(report.calls_booked, report.total_convos) * 100
  const showRate = safeDiv(report.calls_done, report.calls_booked) * 100
  const qualRate = safeDiv(report.qual_apps, report.qual_apps + report.disqual_apps) * 100
  const spcRate = safeDiv(report.spc_new, report.spc_invites) * 100

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="text-base">
          Reporte — {report.setter_name} · {formatDate(report.date)}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-5 mt-2">
        {/* KPI summary */}
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { label: 'Conv Rate', value: fmtPct(convRate) },
            { label: 'Show Rate', value: fmtPct(showRate) },
            { label: '% Cal', value: fmtPct(qualRate) },
            { label: 'Conv SPC', value: fmtPct(spcRate) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-2">
              <p className="text-xs text-zinc-400">{label}</p>
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
            </div>
          ))}
        </div>

        {/* Conversaciones */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-blue-600 mb-2">Conversaciones</p>
          <div className="grid grid-cols-2 gap-x-6">
            <Row label="Total convos" value={report.total_convos} />
            <Row label="Horas trabajadas" value={report.hours_worked} />
            <Row label="Followups" value={report.followups} />
            <Row label="Inbound" value={report.inbound} />
            <Row label="Outbound" value={report.outbound} />
            <Row label="Sin respuesta" value={report.no_reply} />
            <Row label="Nuevos leads" value={report.new_leads} />
          </div>
        </div>

        {/* Pipeline */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-teal-600 mb-2">Pipeline de llamadas</p>
          <div className="grid grid-cols-2 gap-x-6">
            <Row label="Propuestas" value={report.calls_proposed} />
            <Row label="Agendadas" value={report.calls_booked} />
            <Row label="Realizadas" value={report.calls_done} />
            <Row label="Canceladas" value={report.calls_cancelled} />
            <Row label="No-show" value={report.calls_noshow} />
            <Row label="Reagendadas" value={report.calls_rescheduled} />
          </div>
        </div>

        {/* Calificación */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-purple-600 mb-2">Calificación</p>
          <div className="grid grid-cols-2 gap-x-6">
            <Row label="Calificados" value={report.qual_apps} />
            <Row label="Descalificados" value={report.disqual_apps} />
            <Row label="En espera" value={report.waiting} />
            <Row label="Recalificado" value={report.requalified} />
          </div>
          <div className="mt-1"><span className="text-xs text-zinc-400">Razones descal.:</span>{chips(report.disqual_reasons)}</div>
        </div>

        {/* SPC */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-purple-600 mb-2">SPC</p>
          <div className="grid grid-cols-2 gap-x-6">
            <Row label="Invitaciones" value={report.spc_invites} />
            <Row label="Nuevos miembros" value={report.spc_new} />
            <Row label="Interesados" value={report.spc_interested} />
          </div>
        </div>

        {/* Autoevaluación */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-amber-600 mb-2">Autoevaluación</p>
          <Row label="Performance" value={`${report.performance_score}/10`} />
          <div className="mt-1"><span className="text-xs text-zinc-400">Fortalezas:</span>{chips(report.highs)}</div>
          <div className="mt-1"><span className="text-xs text-zinc-400">A mejorar:</span>{chips(report.lows)}</div>
          {report.notas && <p className="text-xs text-zinc-500 italic mt-2">{report.notas}</p>}
        </div>
      </div>
    </DialogContent>
  )
}

export default function SetterDashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const [reports, setReports] = useState<SetterDailyReport[]>([])
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState<Preset>('7d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [selectedSetter, setSelectedSetter] = useState('Todos')
  const [page, setPage] = useState(0)
  const [detailReport, setDetailReport] = useState<SetterDailyReport | null>(null)

  const { from: fromDate, to: toDate } = useMemo(
    () => getDateRange(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  )

  const fetchReports = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('setter_daily_reports')
      .select('*')
      .gte('date', fromDate)
      .lte('date', toDate)
      .order('date', { ascending: false })
    if (selectedSetter !== 'Todos') q = q.eq('setter_name', selectedSetter)
    const { data } = await q
    setReports(data ?? [])
    setLoading(false)
  }, [supabase, fromDate, toDate, selectedSetter])

  useEffect(() => { fetchReports() }, [fetchReports])

  const setterNames = useMemo(() => {
    const names = Array.from(new Set(reports.map((r) => r.setter_name)))
    return ['Todos', ...names]
  }, [reports])

  // Aggregated KPIs
  const kpis = useMemo(() => {
    const totalConvos = sum(reports, 'total_convos')
    const totalBooked = sum(reports, 'calls_booked')
    const totalDone = sum(reports, 'calls_done')
    const totalQual = sum(reports, 'qual_apps')
    const totalDisqual = sum(reports, 'disqual_apps')
    const totalHours = sum(reports, 'hours_worked')
    const totalSpcNew = sum(reports, 'spc_new')
    const totalSpcInvites = sum(reports, 'spc_invites')

    return {
      convRate: safeDiv(totalBooked, totalConvos) * 100,
      showRate: safeDiv(totalDone, totalBooked) * 100,
      qualRate: safeDiv(totalQual, totalQual + totalDisqual) * 100,
      convosPerHour: safeDiv(totalConvos, totalHours),
      spcConvRate: safeDiv(totalSpcNew, totalSpcInvites) * 100,
    }
  }, [reports])

  // Volume summary
  const volume = useMemo(() => ({
    totalConvos: sum(reports, 'total_convos'),
    callsBooked: sum(reports, 'calls_booked'),
    callsDone: sum(reports, 'calls_done'),
    noShows: sum(reports, 'calls_noshow'),
  }), [reports])

  // Chart data — group by date ascending
  const chartData = useMemo(() => {
    const byDate: Record<string, {
      date: string
      followups: number
      inbound: number
      outbound: number
      calls_proposed: number
      calls_booked: number
      calls_done: number
    }> = {}
    for (const r of [...reports].reverse()) {
      const label = formatDate(r.date)
      if (!byDate[r.date]) {
        byDate[r.date] = { date: label, followups: 0, inbound: 0, outbound: 0, calls_proposed: 0, calls_booked: 0, calls_done: 0 }
      }
      byDate[r.date].followups += r.followups
      byDate[r.date].inbound += r.inbound
      byDate[r.date].outbound += r.outbound
      byDate[r.date].calls_proposed += r.calls_proposed
      byDate[r.date].calls_booked += r.calls_booked
      byDate[r.date].calls_done += r.calls_done
    }
    return Object.values(byDate)
  }, [reports])

  // Calificación aggregates
  const calData = useMemo(() => ({
    qual: sum(reports, 'qual_apps'),
    disqual: sum(reports, 'disqual_apps'),
    waiting: sum(reports, 'waiting'),
    disqualReasons: countFreq(reports.map((r) => r.disqual_reasons)).slice(0, 5),
  }), [reports])

  // SPC aggregates
  const spcData = useMemo(() => ({
    invites: sum(reports, 'spc_invites'),
    newMembers: sum(reports, 'spc_new'),
    interested: sum(reports, 'spc_interested'),
    rate: safeDiv(sum(reports, 'spc_new'), sum(reports, 'spc_invites')) * 100,
  }), [reports])

  // Autoevaluación
  const evalData = useMemo(() => {
    if (reports.length === 0) return { avgScore: NaN, sparkline: [], topHighs: [], topLows: [] }
    const scores = reports.map((r) => ({ date: formatDate(r.date), score: r.performance_score })).reverse()
    const avgScore = reports.reduce((s, r) => s + r.performance_score, 0) / reports.length
    return {
      avgScore,
      sparkline: scores,
      topHighs: countFreq(reports.map((r) => r.highs)).slice(0, 3),
      topLows: countFreq(reports.map((r) => r.lows)).slice(0, 3),
    }
  }, [reports])

  // Pagination
  const totalPages = Math.ceil(reports.length / PAGE_SIZE)
  const pageReports = reports.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function perfColor(v: number) {
    if (isNaN(v)) return 'text-zinc-400'
    if (v >= 8) return 'text-green-600 dark:text-green-400'
    if (v >= 6) return 'text-amber-600 dark:text-amber-400'
    return 'text-red-600 dark:text-red-400'
  }

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto">
        <PageHeader title="Setting Team" description="Rendimiento diario del equipo setter">
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
              value={selectedSetter}
              onChange={(e) => setSelectedSetter(e.target.value)}
              className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            >
              {setterNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <Link
              href="/equipo/setter/nuevo"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#185FA5' }}
            >
              <Plus className="h-3.5 w-3.5" />
              Nuevo reporte
            </Link>
          </div>
        </PageHeader>

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-24 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-xl" />
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-64 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-xl" />
              ))}
            </div>
          </div>
        ) : reports.length === 0 ? (
          <EmptyState
            title="No hay reportes en este período"
            description="Crea el primer reporte setter para ver métricas aquí."
            icon={<Plus className="h-10 w-10" />}
          />
        ) : (
          <>
            {/* Section 1 — KPI Goal Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              <KpiGoalCard
                label={GOALS.setter_daily.convRate.label}
                description={GOALS.setter_daily.convRate.description}
                value={kpis.convRate}
                unit={GOALS.setter_daily.convRate.unit}
                goal={GOALS.setter_daily.convRate}
              />
              <KpiGoalCard
                label={GOALS.setter_daily.showRate.label}
                description={GOALS.setter_daily.showRate.description}
                value={kpis.showRate}
                unit={GOALS.setter_daily.showRate.unit}
                goal={GOALS.setter_daily.showRate}
              />
              <KpiGoalCard
                label={GOALS.setter_daily.qualRate.label}
                description={GOALS.setter_daily.qualRate.description}
                value={kpis.qualRate}
                unit={GOALS.setter_daily.qualRate.unit}
                goal={GOALS.setter_daily.qualRate}
              />
              <KpiGoalCard
                label={GOALS.setter_daily.convosPerHour.label}
                description={GOALS.setter_daily.convosPerHour.description}
                value={kpis.convosPerHour}
                unit={GOALS.setter_daily.convosPerHour.unit}
                goal={GOALS.setter_daily.convosPerHour}
              />
              <KpiGoalCard
                label={GOALS.setter_daily.spcConvRate.label}
                description={GOALS.setter_daily.spcConvRate.description}
                value={kpis.spcConvRate}
                unit={GOALS.setter_daily.spcConvRate.unit}
                goal={GOALS.setter_daily.spcConvRate}
              />
            </div>

            {/* Section 2 — Volume Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <VolumeCard label="Total convos" value={volume.totalConvos} />
              <VolumeCard label="Calls agendadas" value={volume.callsBooked} />
              <VolumeCard label="Calls realizadas" value={volume.callsDone} />
              <VolumeCard label="No-shows" value={volume.noShows} />
            </div>

            {/* Section 3 — Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Actividad diaria</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                      <Legend formatter={(v) => <span className="text-xs capitalize">{v}</span>} />
                      <Bar dataKey="followups" name="followups" stackId="a" fill="#3B82F6" maxBarSize={32} />
                      <Bar dataKey="inbound" name="inbound" stackId="a" fill="#14B8A6" maxBarSize={32} />
                      <Bar dataKey="outbound" name="outbound" stackId="a" fill="#F59E0B" radius={[3, 3, 0, 0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Pipeline de llamadas</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                      <Legend formatter={(v) => <span className="text-xs">{v === 'calls_proposed' ? 'Propuestas' : v === 'calls_booked' ? 'Agendadas' : 'Realizadas'}</span>} />
                      <Line type="monotone" dataKey="calls_proposed" stroke="#71717a" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="calls_booked" stroke="#3B82F6" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="calls_done" stroke="#22C55E" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Section 4 — Calificación & SPC */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* Leads card */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Leads</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-6">
                    {/* Donut */}
                    <div className="shrink-0">
                      <ResponsiveContainer width={100} height={100}>
                        <PieChart>
                          <Pie
                            data={[
                              { name: 'Cal', value: calData.qual },
                              { name: 'Descal', value: calData.disqual },
                            ]}
                            cx="50%"
                            cy="50%"
                            innerRadius={30}
                            outerRadius={46}
                            dataKey="value"
                            startAngle={90}
                            endAngle={-270}
                          >
                            <Cell fill="#22C55E" />
                            <Cell fill="#EF4444" />
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-500 dark:text-zinc-400">Calificados</span>
                        <span className="font-semibold text-green-600 dark:text-green-400">{calData.qual}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-500 dark:text-zinc-400">Descalificados</span>
                        <span className="font-semibold text-red-600 dark:text-red-400">{calData.disqual}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-500 dark:text-zinc-400">En espera</span>
                        <span className="font-semibold text-zinc-700 dark:text-zinc-300">{calData.waiting}</span>
                      </div>
                    </div>
                  </div>
                  {calData.disqualReasons.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Razones de descalificación más frecuentes</p>
                      <div className="space-y-1.5">
                        {calData.disqualReasons.map(([reason, count]) => (
                          <div key={reason} className="flex items-center gap-2">
                            <span className="text-xs text-zinc-600 dark:text-zinc-400 flex-1">{reason}</span>
                            <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* SPC card */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">SPC</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-500 dark:text-zinc-400">Invitaciones</span>
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">{spcData.invites}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-500 dark:text-zinc-400">Nuevos miembros</span>
                      <span className="font-semibold text-purple-600 dark:text-purple-400">{spcData.newMembers}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-500 dark:text-zinc-400">Interesados</span>
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">{spcData.interested}</span>
                    </div>
                  </div>
                  <div className="text-center mb-3">
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">Conv SPC Rate</p>
                    <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{fmtPct(spcData.rate)}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-zinc-400">
                      <span>Nuevos / Invitaciones</span>
                      <span>{spcData.newMembers} / {spcData.invites}</span>
                    </div>
                    <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(isNaN(spcData.rate) ? 0 : spcData.rate, 100)}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Section 5 — Autoevaluación */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* Performance promedio */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Performance promedio</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center mb-4">
                    <p className={cn('text-5xl font-bold', perfColor(evalData.avgScore))}>
                      {isNaN(evalData.avgScore) ? '—' : evalData.avgScore.toFixed(1)}
                    </p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">/ 10</p>
                  </div>
                  {evalData.sparkline.length > 1 && (
                    <ResponsiveContainer width="100%" height={80}>
                      <LineChart data={evalData.sparkline} margin={{ top: 4, right: 4, left: -30, bottom: 0 }}>
                        <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#71717a' }} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 10]} tick={{ fontSize: 9, fill: '#71717a' }} axisLine={false} tickLine={false} />
                        <Line type="monotone" dataKey="score" stroke="#F59E0B" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Fortalezas & mejoras */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Fortalezas y mejoras frecuentes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Top fortalezas</p>
                    <div className="flex flex-wrap gap-2">
                      {evalData.topHighs.length === 0
                        ? <span className="text-xs text-zinc-400">—</span>
                        : evalData.topHighs.map(([label, count]) => (
                          <span key={label} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
                            {label}
                            <span className="bg-teal-200 dark:bg-teal-800 text-teal-800 dark:text-teal-200 rounded-full px-1.5 py-0.5 text-xs font-bold">{count}</span>
                          </span>
                        ))
                      }
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Top áreas de mejora</p>
                    <div className="flex flex-wrap gap-2">
                      {evalData.topLows.length === 0
                        ? <span className="text-xs text-zinc-400">—</span>
                        : evalData.topLows.map(([label, count]) => (
                          <span key={label} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            {label}
                            <span className="bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 rounded-full px-1.5 py-0.5 text-xs font-bold">{count}</span>
                          </span>
                        ))
                      }
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Section 6 — Historial */}
            <Card className="mb-8">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Historial de reportes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800">
                        {['Fecha', 'Setter', 'Convos', 'Conv%', 'Show%', 'Cal%', 'Perf', 'SPC', ''].map((h) => (
                          <th key={h} className="text-left py-2.5 px-3 font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageReports.map((r) => {
                        const convR = safeDiv(r.calls_booked, r.total_convos) * 100
                        const showR = safeDiv(r.calls_done, r.calls_booked) * 100
                        const calR = safeDiv(r.qual_apps, r.qual_apps + r.disqual_apps) * 100
                        return (
                          <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                            <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">{formatDate(r.date)}</td>
                            <td className="py-2.5 px-3 font-medium text-zinc-800 dark:text-zinc-200">{r.setter_name}</td>
                            <td className="py-2.5 px-3 text-zinc-700 dark:text-zinc-300">{r.total_convos}</td>
                            <td className="py-2.5 px-3 text-zinc-700 dark:text-zinc-300">{fmtPct(convR, 0)}</td>
                            <td className="py-2.5 px-3 text-zinc-700 dark:text-zinc-300">{fmtPct(showR, 0)}</td>
                            <td className="py-2.5 px-3 text-zinc-700 dark:text-zinc-300">{fmtPct(calR, 0)}</td>
                            <td className="py-2.5 px-3">
                              <span className={cn('font-semibold', perfColor(r.performance_score))}>
                                {r.performance_score}/10
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-zinc-700 dark:text-zinc-300">{r.spc_new}</td>
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

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                    <span className="text-xs text-zinc-400">
                      Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, reports.length)} de {reports.length}
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

      {/* Detail modal */}
      <Dialog open={!!detailReport} onOpenChange={(open) => { if (!open) setDetailReport(null) }}>
        {detailReport && <ReportDetail report={detailReport} onClose={() => setDetailReport(null)} />}
      </Dialog>
    </PageTransition>
  )
}
