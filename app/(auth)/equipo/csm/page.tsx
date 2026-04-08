'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/PageHeader'
import { PageTransition } from '@/components/motion/PageTransition'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import { CsmReport } from '@/types'
import { Plus, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Area, AreaChart,
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
    for (const item of arr) {
      freq[item] = (freq[item] ?? 0) + 1
    }
  }
  return Object.entries(freq).sort((a, b) => b[1] - a[1])
}

function KpiMiniCard({
  label, value, sub, color,
}: { label: string; value: string; sub?: string; color?: string }) {
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

function ReportDetail({ report, onClose }: { report: CsmReport; onClose: () => void }) {
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
    if (!value && value !== 0) return null
    return (
      <div className="flex items-start gap-2 py-1">
        <span className="text-xs text-zinc-400 w-32 shrink-0">{label}</span>
        <span className="text-xs text-zinc-700 dark:text-zinc-300 font-medium">{String(value)}</span>
      </div>
    )
  }

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="text-base">
          Reporte — {report.csm_name} · {formatDate(report.date)}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-5 mt-2">
        {/* Retención */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-red-600 mb-2">Retención</p>
          <div className="grid grid-cols-2 gap-x-6">
            <Row label="Solicitudes" value={report.r_solicitudes} />
            <Row label="Salvadas" value={report.r_saved} />
            <Row label="Churn" value={report.r_churn} />
            <Row label="Pausas" value={report.r_pausas} />
          </div>
          <div className="mt-1"><span className="text-xs text-zinc-400">Razones:</span>{chips(report.r_cancel_reasons)}</div>
          {report.r_notas && <p className="text-xs text-zinc-500 italic mt-1">{report.r_notas}</p>}
        </div>

        {/* Seguimiento */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-blue-600 mb-2">Seguimiento</p>
          <div className="grid grid-cols-2 gap-x-6">
            <Row label="Check-ins" value={report.s_checkins} />
            <Row label="En riesgo" value={report.s_riesgo} />
            <Row label="Wins" value={report.s_wins} />
            <Row label="Dudas" value={report.s_dudas} />
            <Row label="Engagement" value={report.s_engagement} />
          </div>
          <div className="mt-1"><span className="text-xs text-zinc-400">Fricciones:</span>{chips(report.s_fricciones)}</div>
          {report.s_notas && <p className="text-xs text-zinc-500 italic mt-1">{report.s_notas}</p>}
        </div>

        {/* Graduados */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-purple-600 mb-2">Graduados</p>
          <div className="grid grid-cols-2 gap-x-6">
            <Row label="Contactados" value={report.g_contactados} />
            <Row label="Conversaciones" value={report.g_conversaciones} />
            <Row label="Llamadas" value={report.g_llamadas} />
            <Row label="Seguimientos" value={report.g_seguimientos} />
            <Row label="Sin respuesta" value={report.g_sin_respuesta} />
            <Row label="Referidos" value={report.g_referidos} />
          </div>
          <div className="mt-1"><span className="text-xs text-zinc-400">Oportunidades:</span>{chips(report.g_oportunidades)}</div>
          <div className="mt-1"><span className="text-xs text-zinc-400">Objeciones:</span>{chips(report.g_objeciones)}</div>
          {report.g_notas && <p className="text-xs text-zinc-500 italic mt-1">{report.g_notas}</p>}
        </div>

        {/* Soporte */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-amber-600 mb-2">Soporte / Tickets</p>
          <div className="grid grid-cols-2 gap-x-6">
            <Row label="Recibidos" value={report.t_recibidos} />
            <Row label="Resueltos" value={report.t_resueltos} />
            <Row label="Pendientes" value={report.t_pendientes} />
            <Row label="Escalados" value={report.t_escalados} />
          </div>
          <div className="mt-1"><span className="text-xs text-zinc-400">Origen:</span>{chips(report.t_origen)}</div>
          {report.t_notas && <p className="text-xs text-zinc-500 italic mt-1">{report.t_notas}</p>}
        </div>

        {/* Escalamientos */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">Escalamientos</p>
          <div className="grid grid-cols-2 gap-x-6">
            <Row label="Críticos" value={report.e_criticos} />
            <Row label="A coaches" value={report.e_coaches} />
            <Row label="A liderazgo" value={report.e_liderazgo} />
            <Row label="Resueltos" value={report.e_resueltos} />
          </div>
          {report.e_caso_relevante && <p className="text-xs text-zinc-500 italic mt-1">{report.e_caso_relevante}</p>}
        </div>

        {/* Cierre */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-green-600 mb-2">Cierre del día</p>
          {report.c_wins && (
            <div className="mb-2">
              <p className="text-xs text-zinc-400 mb-0.5">¿Qué salió bien?</p>
              <p className="text-xs text-zinc-700 dark:text-zinc-300">{report.c_wins}</p>
            </div>
          )}
          {report.c_riesgos && (
            <div className="mb-2">
              <p className="text-xs text-zinc-400 mb-0.5">Riesgos</p>
              <p className="text-xs text-zinc-700 dark:text-zinc-300">{report.c_riesgos}</p>
            </div>
          )}
          {(report.c_accion1 || report.c_accion2 || report.c_accion3) && (
            <div>
              <p className="text-xs text-zinc-400 mb-1">Acciones para mañana</p>
              <ol className="space-y-0.5 list-decimal list-inside">
                {[report.c_accion1, report.c_accion2, report.c_accion3].filter(Boolean).map((a, i) => (
                  <li key={i} className="text-xs text-zinc-700 dark:text-zinc-300">{a}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </DialogContent>
  )
}

export default function CsmDashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const [reports, setReports] = useState<CsmReport[]>([])
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState<Preset>('7d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [selectedCsm, setSelectedCsm] = useState('Todos')
  const [page, setPage] = useState(0)
  const [detailReport, setDetailReport] = useState<CsmReport | null>(null)

  const { from: fromDate, to: toDate } = useMemo(
    () => getDateRange(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  )

  const fetchReports = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('csm_reports')
      .select('*')
      .gte('date', fromDate)
      .lte('date', toDate)
      .order('date', { ascending: false })
    if (selectedCsm !== 'Todos') q = q.eq('csm_name', selectedCsm)
    const { data } = await q
    setReports(data ?? [])
    setLoading(false)
  }, [supabase, fromDate, toDate, selectedCsm])

  useEffect(() => { fetchReports() }, [fetchReports])

  const csmNames = useMemo(() => {
    const names = Array.from(new Set(reports.map((r) => r.csm_name)))
    return ['Todos', ...names]
  }, [reports])

  // Aggregated KPIs
  const kpis = useMemo(() => {
    const totalSolicitudes = reports.reduce((s, r) => s + r.r_solicitudes, 0)
    const totalSaved = reports.reduce((s, r) => s + r.r_saved, 0)
    const totalChurn = reports.reduce((s, r) => s + r.r_churn, 0)
    const totalTicketsRecibidos = reports.reduce((s, r) => s + r.t_recibidos, 0)
    const totalTicketsResueltos = reports.reduce((s, r) => s + r.t_resueltos, 0)
    const totalLlamadas = reports.reduce((s, r) => s + r.g_llamadas, 0)
    const totalReferidos = reports.reduce((s, r) => s + r.g_referidos, 0)

    // Engagement mode
    const engagements = reports.map((r) => r.s_engagement)
    const engFreq: Record<string, number> = {}
    engagements.forEach((e) => { engFreq[e] = (engFreq[e] ?? 0) + 1 })
    const engMode = Object.entries(engFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'

    return {
      rescatePct: pct(totalSaved, totalSolicitudes),
      rescateLabel: `${totalSaved} salvadas de ${totalSolicitudes} solicitudes`,
      churn: totalChurn,
      ticketsPct: pct(totalTicketsResueltos, totalTicketsRecibidos),
      ticketsLabel: `${totalTicketsResueltos} resueltos de ${totalTicketsRecibidos} recibidos`,
      engMode,
      llamadas: totalLlamadas,
      referidos: totalReferidos,
    }
  }, [reports])

  // Chart data — group by date ascending
  const chartData = useMemo(() => {
    const byDate: Record<string, { date: string; r_saved: number; r_churn: number; t_recibidos: number; t_resueltos: number }> = {}
    for (const r of [...reports].reverse()) {
      if (!byDate[r.date]) byDate[r.date] = { date: formatDate(r.date), r_saved: 0, r_churn: 0, t_recibidos: 0, t_resueltos: 0 }
      byDate[r.date].r_saved += r.r_saved
      byDate[r.date].r_churn += r.r_churn
      byDate[r.date].t_recibidos += r.t_recibidos
      byDate[r.date].t_resueltos += r.t_resueltos
    }
    return Object.values(byDate)
  }, [reports])

  // Secondary metrics
  const secondary = useMemo(() => ({
    contactados: reports.reduce((s, r) => s + r.g_contactados, 0),
    conversaciones: reports.reduce((s, r) => s + r.g_conversaciones, 0),
    sinRespuesta: reports.reduce((s, r) => s + r.g_sin_respuesta, 0),
    referidos: reports.reduce((s, r) => s + r.g_referidos, 0),
    riesgo: reports.reduce((s, r) => s + r.s_riesgo, 0),
    checkins: reports.reduce((s, r) => s + r.s_checkins, 0),
    wins: reports.reduce((s, r) => s + r.s_wins, 0),
    fricciones: countFreq(reports.map((r) => r.s_fricciones)).slice(0, 2),
    criticos: reports.reduce((s, r) => s + r.e_criticos, 0),
    coaches: reports.reduce((s, r) => s + r.e_coaches, 0),
    liderazgo: reports.reduce((s, r) => s + r.e_liderazgo, 0),
    escalResueltos: reports.reduce((s, r) => s + r.e_resueltos, 0),
  }), [reports])

  // Frequency analysis
  const cancelFreq = useMemo(() => countFreq(reports.map((r) => r.r_cancel_reasons)), [reports])
  const friccionFreq = useMemo(() => countFreq(reports.map((r) => r.s_fricciones)), [reports])
  const totalCancel = cancelFreq.reduce((s, [, c]) => s + c, 0)
  const totalFriccion = friccionFreq.reduce((s, [, c]) => s + c, 0)

  // Pagination
  const totalPages = Math.ceil(reports.length / PAGE_SIZE)
  const pageReports = reports.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // KPI card color helpers
  function rescateColor(v: number) {
    if (isNaN(v)) return 'text-zinc-400'
    if (v >= 70) return 'text-green-600 dark:text-green-400'
    if (v >= 50) return 'text-amber-600 dark:text-amber-400'
    return 'text-red-600 dark:text-red-400'
  }
  function churnColor(v: number) {
    if (v === 0) return 'text-green-600 dark:text-green-400'
    if (v <= 2) return 'text-amber-600 dark:text-amber-400'
    return 'text-red-600 dark:text-red-400'
  }
  function ticketColor(v: number) {
    if (isNaN(v)) return 'text-zinc-400'
    if (v >= 80) return 'text-green-600 dark:text-green-400'
    if (v >= 60) return 'text-amber-600 dark:text-amber-400'
    return 'text-red-600 dark:text-red-400'
  }
  function engColor(v: string) {
    if (v === 'Alto') return 'text-teal-600 dark:text-teal-400'
    if (v === 'Medio') return 'text-amber-600 dark:text-amber-400'
    return 'text-red-600 dark:text-red-400'
  }

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto">
        <PageHeader title="Client Success — High Ticket" description="Seguimiento diario del equipo CSM">
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
              value={selectedCsm}
              onChange={(e) => setSelectedCsm(e.target.value)}
              className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            >
              {csmNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <Link
              href="/equipo/csm/nuevo"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#1D9E75' }}
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
            description="Crea el primer reporte CSM para ver métricas aquí."
            icon={<Plus className="h-10 w-10" />}
          />
        ) : (
          <>
            {/* Section 1 — KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              <KpiMiniCard
                label="Tasa de rescate"
                value={fmtPct(kpis.rescatePct)}
                sub={kpis.rescateLabel}
                color={rescateColor(kpis.rescatePct)}
              />
              <KpiMiniCard
                label="Churn acumulado"
                value={String(kpis.churn)}
                sub="cancelaciones en el período"
                color={churnColor(kpis.churn)}
              />
              <KpiMiniCard
                label="Resolución tickets"
                value={fmtPct(kpis.ticketsPct)}
                sub={kpis.ticketsLabel}
                color={ticketColor(kpis.ticketsPct)}
              />
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">Engagement</p>
                <span className={cn(
                  'inline-flex px-2.5 py-1 rounded-full text-sm font-bold',
                  kpis.engMode === 'Alto' ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300' :
                  kpis.engMode === 'Medio' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                  'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                )}>
                  {kpis.engMode}
                </span>
              </div>
              <KpiMiniCard
                label="Llamadas agendadas"
                value={String(kpis.llamadas)}
                sub={`${kpis.referidos} referidos generados`}
                color="text-blue-600 dark:text-blue-400"
              />
            </div>

            {/* Section 2 — Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Retención — Rescates vs Churn</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(value, name) => [
                          String(value),
                          name === 'r_saved' ? 'Rescatadas' : 'Churn',
                        ]}
                        contentStyle={{ fontSize: 11 }}
                      />
                      <Legend formatter={(v) => <span className="text-xs">{v === 'r_saved' ? 'Rescatadas' : 'Churn'}</span>} />
                      <Bar dataKey="r_saved" name="r_saved" fill="#3B6D11" radius={[3, 3, 0, 0]} maxBarSize={32} />
                      <Bar dataKey="r_churn" name="r_churn" fill="#A32D2D" radius={[3, 3, 0, 0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Tickets — Recibidos vs Resueltos</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="resueltosFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B6D11" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#3B6D11" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(value, name) => [
                          String(value),
                          name === 't_recibidos' ? 'Recibidos' : 'Resueltos',
                        ]}
                        contentStyle={{ fontSize: 11 }}
                      />
                      <Legend formatter={(v) => <span className="text-xs">{v === 't_recibidos' ? 'Recibidos' : 'Resueltos'}</span>} />
                      <Line type="monotone" dataKey="t_recibidos" stroke="#185FA5" strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="t_resueltos" stroke="#3B6D11" strokeWidth={2} fill="url(#resueltosFill)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Section 3 — Secondary metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Actividad con Graduados</CardTitle>
                </CardHeader>
                <CardContent>
                  <MetricRow label="Contactados" value={secondary.contactados} />
                  <MetricRow label="Conversaciones activas" value={secondary.conversaciones} />
                  <MetricRow label="Sin respuesta" value={secondary.sinRespuesta} />
                  <MetricRow label="Referidos" value={secondary.referidos} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Estudiantes en Riesgo</CardTitle>
                </CardHeader>
                <CardContent>
                  <MetricRow label="En riesgo" value={secondary.riesgo} highlight={secondary.riesgo > 0} />
                  <MetricRow label="Check-ins realizados" value={secondary.checkins} />
                  <MetricRow label="Wins / avances" value={secondary.wins} />
                  <div className="pt-1.5">
                    <p className="text-xs text-zinc-400 mb-1">Fricciones frecuentes</p>
                    {secondary.fricciones.length === 0 ? (
                      <p className="text-xs text-zinc-400">—</p>
                    ) : (
                      secondary.fricciones.map(([label, count]) => (
                        <span key={label} className="inline-flex items-center gap-1 mr-1.5 mb-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                          {label} <span className="font-bold">{count}</span>
                        </span>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Escalamientos</CardTitle>
                </CardHeader>
                <CardContent>
                  <MetricRow label="Casos críticos" value={secondary.criticos} highlight={secondary.criticos > 0} />
                  <MetricRow label="Escalados a coaches" value={secondary.coaches} />
                  <MetricRow label="Escalados a liderazgo" value={secondary.liderazgo} />
                  <MetricRow label="Resueltos" value={secondary.escalResueltos} />
                </CardContent>
              </Card>
            </div>

            {/* Section 4 — Frequency analysis */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Razones de cancelación</CardTitle>
                </CardHeader>
                <CardContent>
                  {cancelFreq.length === 0 ? (
                    <p className="text-xs text-zinc-400 py-4 text-center">Sin datos en este período</p>
                  ) : (
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
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Fricciones de estudiantes</CardTitle>
                </CardHeader>
                <CardContent>
                  {friccionFreq.length === 0 ? (
                    <p className="text-xs text-zinc-400 py-4 text-center">Sin datos en este período</p>
                  ) : (
                    <div className="space-y-2.5">
                      {friccionFreq.map(([label, count]) => {
                        const p = totalFriccion > 0 ? (count / totalFriccion) * 100 : 0
                        return (
                          <div key={label}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
                              <span className="font-semibold text-blue-600 dark:text-blue-400">{count} ({p.toFixed(0)}%)</span>
                            </div>
                            <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full">
                              <div className="h-full bg-blue-400 rounded-full" style={{ width: `${p}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Section 5 — Reports table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Historial de reportes</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800">
                        {['Fecha', 'CSM', 'Rescate%', 'Churn', 'Tickets%', 'Graduados', 'Riesgo', 'Críticos', 'Engagement', ''].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {pageReports.map((r) => {
                        const rescPct = pct(r.r_saved, r.r_solicitudes)
                        const tickPct = pct(r.t_resueltos, r.t_recibidos)
                        return (
                          <motion.tr
                            key={r.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                          >
                            <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">{formatDate(r.date)}</td>
                            <td className="px-4 py-3 text-sm font-medium text-zinc-800 dark:text-zinc-200 whitespace-nowrap">{r.csm_name}</td>
                            <td className={cn('px-4 py-3 text-sm font-semibold', rescateColor(rescPct))}>{fmtPct(rescPct)}</td>
                            <td className={cn('px-4 py-3 text-sm font-semibold', churnColor(r.r_churn))}>{r.r_churn}</td>
                            <td className={cn('px-4 py-3 text-sm font-semibold', ticketColor(tickPct))}>{fmtPct(tickPct)}</td>
                            <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">{r.g_conversaciones}</td>
                            <td className={cn('px-4 py-3 text-sm font-semibold', r.s_riesgo > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500')}>{r.s_riesgo}</td>
                            <td className={cn('px-4 py-3 text-sm font-semibold', r.e_criticos > 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-500')}>{r.e_criticos}</td>
                            <td className="px-4 py-3">
                              <span className={cn(
                                'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                                r.s_engagement === 'Alto' ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300' :
                                r.s_engagement === 'Medio' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                                'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                              )}>
                                {r.s_engagement}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => setDetailReport(r)}
                                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                Ver
                              </button>
                            </td>
                          </motion.tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100 dark:border-zinc-800">
                    <p className="text-xs text-zinc-400">
                      {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, reports.length)} de {reports.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={page >= totalPages - 1}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
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
      <Dialog open={!!detailReport} onOpenChange={() => setDetailReport(null)}>
        {detailReport && <ReportDetail report={detailReport} onClose={() => setDetailReport(null)} />}
      </Dialog>
    </PageTransition>
  )
}
