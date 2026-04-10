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
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GOALS } from '@/lib/goals'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 10

// ─── Unified interface ───────────────────────────────────────────────────────

interface UnifiedSetterDay {
  id: string
  date: string
  setter_name: string
  total_convos: number
  follow_ups: number
  outbound: number
  inbound: number
  call_proposed: number
  calls_booked: number
  calls_no_reply: number
  calls_followup: number
  qual_apps: number
  disqual_apps: number
  waiting: number
  disqual_reasons: string[] | null
  spc_invites: number
  spc_new: number
  spc_interested: number
  performance_score: number
  highs: string[]
  lows: string[]
  hours_worked: number
  source: 'setter_reports' | 'setter_daily_reports' | 'both'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSetterReport(r: any): UnifiedSetterDay {
  return {
    id: `sr_${r.id}`,
    date: r.date,
    setter_name: normalizeName(r.setter_name),
    total_convos: r.total_convos ?? 0,
    follow_ups: r.follow_ups ?? 0,
    outbound: r.outbound ?? 0,
    inbound: r.inbound ?? 0,
    call_proposed: r.call_proposed ?? 0,
    calls_booked: r.qualified_calls ?? 0,
    calls_no_reply: 0,
    calls_followup: 0,
    qual_apps: r.qualified_calls ?? 0,
    disqual_apps: r.disqualified ?? 0,
    waiting: 0,
    disqual_reasons: null,
    spc_invites: 0,
    spc_new: 0,
    spc_interested: 0,
    performance_score: r.performance_score ?? 0,
    highs: r.highs ? [r.highs] : [],
    lows: r.lows ? [r.lows] : [],
    hours_worked: r.hours_worked ?? 0,
    source: 'setter_reports',
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDailyReport(r: any): UnifiedSetterDay {
  return {
    id: `sdr_${r.id}`,
    date: r.date,
    setter_name: normalizeName(r.setter_name),
    total_convos: r.total_convos ?? 0,
    follow_ups: r.followups ?? 0,
    outbound: r.outbound ?? 0,
    inbound: r.inbound ?? 0,
    call_proposed: r.calls_proposed ?? 0,
    calls_booked: r.calls_booked ?? 0,
    calls_no_reply: r.calls_no_reply ?? 0,
    calls_followup: r.calls_followup ?? 0,
    qual_apps: r.qual_apps ?? 0,
    disqual_apps: r.disqual_apps ?? 0,
    waiting: r.waiting ?? 0,
    disqual_reasons: r.disqual_reasons ?? null,
    spc_invites: r.spc_invites ?? 0,
    spc_new: r.spc_new ?? 0,
    spc_interested: r.spc_interested ?? 0,
    performance_score: r.performance_score ?? 0,
    highs: r.highs ?? [],
    lows: r.lows ?? [],
    hours_worked: r.hours_worked ?? 0,
    source: 'setter_daily_reports',
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeName(name: string): string {
  return name.replace('@', '').trim()
}

type Preset = '7d' | '30d' | '90d' | 'todo'

function getDateRange(preset: Preset) {
  const fmtDate = (d: Date) => d.toISOString().split('T')[0]
  const endOfToday = () => {
    const d = new Date()
    d.setHours(23, 59, 59, 999)
    return fmtDate(d)
  }
  const daysAgo = (n: number) => {
    const d = new Date()
    d.setDate(d.getDate() - n)
    return fmtDate(d)
  }
  const to = endOfToday()
  if (preset === '7d')  return { from: daysAgo(6),  to }
  if (preset === '30d') return { from: daysAgo(29), to }
  if (preset === '90d') return { from: daysAgo(89), to }
  return { from: '2020-01-01', to }
}

function s(arr: UnifiedSetterDay[], key: keyof UnifiedSetterDay) {
  return arr.reduce((acc, r) => acc + ((r[key] as number) ?? 0), 0)
}

function safeDiv(num: number, den: number) {
  return den > 0 ? num / den : NaN
}

function fmtPct(v: number, dec = 1) {
  return isNaN(v) ? '—' : `${v.toFixed(dec)}%`
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

function SourceBadge({ source }: { source: UnifiedSetterDay['source'] }) {
  if (source === 'setter_daily_reports') {
    return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">Formulario</span>
  }
  if (source === 'both') {
    return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Ambos</span>
  }
  return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">CSV</span>
}

function ReportDetail({ report, onClose }: { report: UnifiedSetterDay; onClose: () => void }) {
  function chips(arr: string[] | null) {
    if (!arr?.length) return <span className="text-xs text-zinc-400">—</span>
    return (
      <div className="flex flex-wrap gap-1.5 mt-1">
        {arr.map((v) => (
          <span key={v} className="inline-flex px-2 py-0.5 rounded-full text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">{v}</span>
        ))}
      </div>
    )
  }
  function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
    if (value === null || value === undefined || value === '') return null
    return (
      <div className="flex items-start gap-2 py-1 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
        <span className="text-xs text-zinc-400 w-40 shrink-0">{label}</span>
        <span className="text-xs text-zinc-700 dark:text-zinc-300 font-medium">{String(value)}</span>
      </div>
    )
  }

  const convRate = safeDiv(report.calls_booked, report.total_convos) * 100
  const pitchRate = safeDiv(report.call_proposed, report.total_convos) * 100

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <div className="flex items-center gap-2">
          <DialogTitle className="text-base">{report.setter_name} · {formatDate(report.date)}</DialogTitle>
          <SourceBadge source={report.source} />
        </div>
      </DialogHeader>
      <div className="space-y-5 mt-2">
        {/* KPI summary */}
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'Pitch Rate', value: fmtPct(pitchRate) },
            { label: 'Booking Rate', value: fmtPct(safeDiv(report.calls_booked, report.call_proposed) * 100) },
            { label: 'Conv General', value: fmtPct(convRate) },
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
          <Row label="Total convos" value={report.total_convos} />
          <Row label="Follow-ups" value={report.follow_ups} />
          <Row label="Inbound" value={report.inbound} />
          <Row label="Outbound" value={report.outbound} />
          <Row label="Horas trabajadas" value={report.hours_worked} />
        </div>
        {/* Pipeline */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-teal-600 mb-2">Pipeline de llamadas</p>
          <Row label="Propuestas" value={report.call_proposed} />
          <Row label="Agendadas" value={report.calls_booked} />
          {report.calls_no_reply > 0 && <Row label="Sin respuesta" value={report.calls_no_reply} />}
          {report.calls_followup > 0 && <Row label="En seguimiento" value={report.calls_followup} />}
        </div>
        {/* Calificación */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-purple-600 mb-2">Calificación</p>
          <Row label="Calificados" value={report.qual_apps} />
          <Row label="Descalificados" value={report.disqual_apps} />
          {report.waiting > 0 && <Row label="En espera" value={report.waiting} />}
          {report.disqual_reasons?.length ? (
            <div className="py-1"><span className="text-xs text-zinc-400">Razones:</span>{chips(report.disqual_reasons)}</div>
          ) : null}
        </div>
        {/* SPC (if applicable) */}
        {(report.spc_invites > 0 || report.spc_new > 0) && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-purple-600 mb-2">SPC</p>
            <Row label="Invitaciones" value={report.spc_invites} />
            <Row label="Nuevos miembros" value={report.spc_new} />
            <Row label="Interesados" value={report.spc_interested} />
          </div>
        )}
        {/* Autoevaluación */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-amber-600 mb-2">Autoevaluación</p>
          <Row label="Performance" value={`${report.performance_score}/10`} />
          {report.highs.length > 0 && (
            <div className="py-1"><span className="text-xs text-zinc-400">Fortalezas:</span>{chips(report.highs)}</div>
          )}
          {report.lows.length > 0 && (
            <div className="py-1"><span className="text-xs text-zinc-400">A mejorar:</span>{chips(report.lows)}</div>
          )}
        </div>
      </div>
    </DialogContent>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SetterDashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const [data, setData] = useState<UnifiedSetterDay[]>([])
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState<Preset>('30d')
  const [selectedSetter, setSelectedSetter] = useState('Todos')
  const [page, setPage] = useState(0)
  const [detailReport, setDetailReport] = useState<UnifiedSetterDay | null>(null)

  const { from: fromDate, to: toDate } = useMemo(
    () => getDateRange(preset),
    [preset]
  )

  const fetchData = useCallback(async () => {
    setLoading(true)
    setData([])
    const [{ data: legacy }, { data: daily }] = await Promise.all([
      supabase.from('setter_reports').select('*').gte('date', fromDate).lte('date', toDate).order('date', { ascending: false }).limit(2000),
      supabase.from('setter_daily_reports').select('*').gte('date', fromDate).lte('date', toDate).order('date', { ascending: false }).limit(2000),
    ])

    // Merge: key = date_settername, prefer daily
    const merged = new Map<string, UnifiedSetterDay>()
    for (const r of (legacy ?? [])) {
      const key = `${r.date}_${normalizeName(r.setter_name)}`
      merged.set(key, mapSetterReport(r))
    }
    for (const r of (daily ?? [])) {
      const key = `${r.date}_${normalizeName(r.setter_name)}`
      const existing = merged.get(key)
      if (existing) {
        merged.set(key, { ...mapDailyReport(r), id: `both_${r.id}`, source: 'both' })
      } else {
        merged.set(key, mapDailyReport(r))
      }
    }

    const sorted = Array.from(merged.values()).sort((a, b) => b.date.localeCompare(a.date))
    setData(sorted)
    setLoading(false)
  }, [supabase, fromDate, toDate])

  useEffect(() => { fetchData() }, [fetchData])

  // Setter filter applied client-side (names come from merged data)
  const setterNames = useMemo(() => {
    const names = Array.from(new Set(data.map((r) => r.setter_name)))
    return ['Todos', ...names]
  }, [data])

  const filtered = useMemo(
    () => selectedSetter === 'Todos' ? data : data.filter((r) => r.setter_name === selectedSetter),
    [data, selectedSetter]
  )

  // ── KPI aggregates ──
  const kpis = useMemo(() => {
    const totalConvos = s(filtered, 'total_convos')
    const totalProposed = s(filtered, 'call_proposed')
    const totalBooked = s(filtered, 'calls_booked')
    return {
      pitchRate: safeDiv(totalProposed, totalConvos) * 100,
      bookingRate: safeDiv(totalBooked, totalProposed) * 100,
      convGeneral: safeDiv(totalBooked, totalConvos) * 100,
    }
  }, [filtered])

  // ── Volume stats ──
  const volume = useMemo(() => {
    const totalConvos = s(filtered, 'total_convos')
    const totalProposed = s(filtered, 'call_proposed')
    const totalBooked = s(filtered, 'calls_booked')
    const totalFollowUps = s(filtered, 'follow_ups')
    const totalOutbound = s(filtered, 'outbound')
    const avgPerf = filtered.length > 0
      ? filtered.reduce((acc, r) => acc + r.performance_score, 0) / filtered.length
      : NaN
    return {
      totalConvos, totalProposed, totalBooked, totalFollowUps, totalOutbound, avgPerf,
      followUpPct: fmtPct(safeDiv(totalFollowUps, totalConvos) * 100),
      inboundPct: fmtPct(safeDiv(s(filtered, 'inbound'), totalConvos) * 100),
      outboundPct: fmtPct(safeDiv(totalOutbound, totalConvos) * 100),
      bookingPct: fmtPct(safeDiv(totalBooked, totalProposed) * 100),
    }
  }, [filtered])

  // ── Chart data (ascending by date) ──
  const chartData = useMemo(() => {
    const byDate: Record<string, {
      date: string
      follow_ups: number
      inbound: number
      outbound: number
      call_proposed: number
      calls_booked: number
      calls_no_reply: number
    }> = {}
    for (const r of [...filtered].reverse()) {
      if (!byDate[r.date]) {
        byDate[r.date] = { date: formatDate(r.date), follow_ups: 0, inbound: 0, outbound: 0, call_proposed: 0, calls_booked: 0, calls_no_reply: 0 }
      }
      byDate[r.date].follow_ups += r.follow_ups
      byDate[r.date].inbound += r.inbound
      byDate[r.date].outbound += r.outbound
      byDate[r.date].call_proposed += r.call_proposed
      byDate[r.date].calls_booked += r.calls_booked
      byDate[r.date].calls_no_reply += r.calls_no_reply
    }
    return Object.values(byDate)
  }, [filtered])

  const hasNoReplyData = useMemo(() => filtered.some((r) => r.calls_no_reply > 0), [filtered])

  // ── Calificación ──
  const calData = useMemo(() => ({
    qual: s(filtered, 'qual_apps'),
    disqual: s(filtered, 'disqual_apps'),
    waiting: s(filtered, 'waiting'),
    disqualReasons: countFreq(filtered.map((r) => r.disqual_reasons)).slice(0, 3),
  }), [filtered])

  // ── Performance ──
  const perfData = useMemo(() => {
    if (filtered.length === 0) return { avg: NaN, sparkline: [], topHighs: [] as [string,number][], topLows: [] as [string,number][], trend: NaN }
    const avg = filtered.reduce((acc, r) => acc + r.performance_score, 0) / filtered.length
    const sparkline = [...filtered].reverse().map((r) => ({ date: formatDate(r.date), score: r.performance_score }))
    const topHighs = countFreq(filtered.map((r) => r.highs)).slice(0, 3)
    const topLows = countFreq(filtered.map((r) => r.lows)).slice(0, 3)
    return { avg, sparkline, topHighs, topLows, trend: NaN }
  }, [filtered])

  // ── SPC ──
  const spcData = useMemo(() => ({
    invites: s(filtered, 'spc_invites'),
    newMembers: s(filtered, 'spc_new'),
    interested: s(filtered, 'spc_interested'),
    rate: safeDiv(s(filtered, 'spc_new'), s(filtered, 'spc_invites')) * 100,
  }), [filtered])
  const hasSpcData = spcData.invites > 0

  // ── Pagination ──
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function perfColor(v: number) {
    if (isNaN(v) || v === 0) return 'text-zinc-400'
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
              {(['7d', '30d', '90d', 'todo'] as Preset[]).map((p) => (
                <button
                  key={p}
                  onClick={() => { setPreset(p); setPage(0) }}
                  className={cn(
                    'px-2.5 py-1.5 text-xs font-medium transition-colors',
                    preset === p
                      ? 'bg-[#185FA5] text-white'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                  )}
                >
                  {p === 'todo' ? 'Todo' : p}
                </button>
              ))}
            </div>
            <select
              value={selectedSetter}
              onChange={(e) => { setSelectedSetter(e.target.value); setPage(0) }}
              className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            >
              {setterNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {!loading && (
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                {filtered.length} días de datos
              </span>
            )}
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
            <div className="grid grid-cols-3 gap-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-28 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-xl" />)}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[...Array(6)].map((_, i) => <div key={i} className="h-20 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-xl" />)}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No hay reportes en este período"
            description="Crea el primer reporte setter para ver métricas aquí."
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
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
              <VolumeCard
                label="Total Convos"
                value={volume.totalConvos}
                sub={`${volume.followUpPct} follow-ups · ${volume.inboundPct} inbound · ${volume.outboundPct} outbound`}
              />
              <VolumeCard label="Calls Propuestas" value={volume.totalProposed} />
              <VolumeCard
                label="Calls Agendadas"
                value={volume.totalBooked}
                sub={`${volume.bookingPct} booking rate`}
              />
              <VolumeCard label="Follow-ups" value={volume.totalFollowUps} />
              <VolumeCard
                label="Outbound"
                value={volume.totalOutbound}
                sub={`${volume.outboundPct} del volumen total`}
              />
              <VolumeCard
                label="Avg Performance"
                value={isNaN(volume.avgPerf) ? '—' : `${volume.avgPerf.toFixed(1)}/10`}
                sub="/10 autoevaluación"
              />
            </div>

            {/* ── Section 3: Charts ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Volumen diario de conversaciones</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                      <Legend formatter={(v) => <span className="text-xs">{v === 'follow_ups' ? 'Follow-ups' : v === 'inbound' ? 'Inbound' : 'Outbound'}</span>} />
                      <Bar dataKey="follow_ups" stackId="a" fill="#185FA5" maxBarSize={32} />
                      <Bar dataKey="inbound" stackId="a" fill="#1D9E75" maxBarSize={32} />
                      <Bar dataKey="outbound" stackId="a" fill="#EF9F27" radius={[3, 3, 0, 0]} maxBarSize={32} />
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
                      <Legend formatter={(v) => <span className="text-xs">{v === 'call_proposed' ? 'Propuestas' : v === 'calls_booked' ? 'Agendadas' : 'Sin respuesta'}</span>} />
                      <Line type="monotone" dataKey="call_proposed" stroke="#71717a" strokeWidth={2} strokeDasharray="4 2" dot={false} />
                      <Line type="monotone" dataKey="calls_booked" stroke="#185FA5" strokeWidth={2} dot={false} />
                      {hasNoReplyData && (
                        <Line type="monotone" dataKey="calls_no_reply" stroke="#EF4444" strokeWidth={1.5} strokeDasharray="3 2" dot={false} />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* ── Section 4: Calificación + Performance ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* Leads & Calificación */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Leads & Calificación</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 mb-4">
                    {[
                      { label: 'Calificados', value: calData.qual, dot: 'bg-green-500', color: 'text-green-600 dark:text-green-400' },
                      { label: 'Descalificados', value: calData.disqual, dot: 'bg-red-500', color: 'text-red-600 dark:text-red-400' },
                      { label: 'En espera', value: calData.waiting, dot: 'bg-zinc-400', color: 'text-zinc-700 dark:text-zinc-300' },
                    ].map(({ label, value, dot, color }) => (
                      <div key={label} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={cn('w-2 h-2 rounded-full', dot)} />
                          <span className="text-sm text-zinc-500 dark:text-zinc-400">{label}</span>
                        </div>
                        <span className={cn('text-sm font-semibold', color)}>{value}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-1 border-t border-zinc-100 dark:border-zinc-800">
                      <span className="text-sm text-zinc-500 dark:text-zinc-400">Tasa cal.</span>
                      <span className={cn(
                        'inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold',
                        safeDiv(calData.qual, calData.qual + calData.disqual) >= 0.6
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                          : safeDiv(calData.qual, calData.qual + calData.disqual) >= 0.4
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                      )}>
                        {fmtPct(safeDiv(calData.qual, calData.qual + calData.disqual) * 100)}
                      </span>
                    </div>
                  </div>
                  {calData.disqualReasons.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Razones de descalificación</p>
                      <div className="flex flex-wrap gap-2">
                        {calData.disqualReasons.map(([reason, count]) => (
                          <span key={reason} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                            {reason} <span className="font-bold">({count})</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Autoevaluación & Tendencia */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Autoevaluación & Tendencia</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center mb-4">
                    <p className={cn('text-5xl font-bold', perfColor(perfData.avg))}>
                      {isNaN(perfData.avg) ? '—' : perfData.avg.toFixed(1)}
                    </p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">/ 10 promedio</p>
                  </div>
                  {perfData.sparkline.length > 1 && (
                    <div className="mb-4">
                      <ResponsiveContainer width="100%" height={60}>
                        <LineChart data={perfData.sparkline} margin={{ top: 2, right: 4, left: -30, bottom: 0 }}>
                          <Line type="monotone" dataKey="score" stroke="#EF9F27" strokeWidth={2} dot={false} />
                          <YAxis domain={[0, 10]} hide />
                          <XAxis dataKey="date" hide />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {(perfData.topHighs.length > 0 || perfData.topLows.length > 0) && (
                    <div className="space-y-3">
                      {perfData.topHighs.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-zinc-400 mb-1.5">Top fortalezas</p>
                          <div className="flex flex-wrap gap-1.5">
                            {perfData.topHighs.map(([label, count]) => (
                              <span key={label} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
                                {label} <span className="font-bold opacity-70">({count})</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {perfData.topLows.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-zinc-400 mb-1.5">Top áreas de mejora</p>
                          <div className="flex flex-wrap gap-1.5">
                            {perfData.topLows.map(([label, count]) => (
                              <span key={label} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                {label} <span className="font-bold opacity-70">({count})</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ── Section 5: SPC (conditional) ── */}
            {hasSpcData && (
              <Card className="mb-6">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Secure Parent Collective</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">Invitaciones</p>
                      <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{spcData.invites}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">Nuevos members</p>
                      <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{spcData.newMembers}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">Interesados</p>
                      <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{spcData.interested}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">Conv SPC rate</p>
                      <p className={cn('text-2xl font-bold', isNaN(spcData.rate) ? 'text-zinc-400' : 'text-purple-600 dark:text-purple-400')}>
                        {fmtPct(spcData.rate)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-1">
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
            )}

            {/* ── Section 6: Historial ── */}
            <Card className="mb-8">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">Historial completo</CardTitle>
                <span className="text-xs text-zinc-400">{filtered.length} días de datos</span>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800">
                        {['Fecha', 'Setter', 'Convos', 'Propuestas', 'Agendadas', 'Conv%', 'Perf', 'Fuente', ''].map((h) => (
                          <th key={h} className="text-left py-2.5 px-3 font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r) => {
                        const convPct = safeDiv(r.calls_booked, r.total_convos) * 100
                        return (
                          <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                            <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">{formatDate(r.date)}</td>
                            <td className="py-2.5 px-3 font-medium text-zinc-800 dark:text-zinc-200">{r.setter_name}</td>
                            <td className="py-2.5 px-3 text-zinc-700 dark:text-zinc-300">{r.total_convos}</td>
                            <td className="py-2.5 px-3 text-zinc-700 dark:text-zinc-300">{r.call_proposed}</td>
                            <td className="py-2.5 px-3 text-zinc-700 dark:text-zinc-300">{r.calls_booked}</td>
                            <td className="py-2.5 px-3 text-zinc-700 dark:text-zinc-300">{fmtPct(convPct, 0)}</td>
                            <td className="py-2.5 px-3">
                              <span className={cn('font-semibold', perfColor(r.performance_score))}>
                                {r.performance_score}/10
                              </span>
                            </td>
                            <td className="py-2.5 px-3"><SourceBadge source={r.source} /></td>
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
                      Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
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
