'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/PageHeader'
import { PageTransition } from '@/components/motion/PageTransition'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import { SpcPerfReport } from '@/types'
import { Plus, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { motion } from 'framer-motion'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 15

type Preset = '7d' | '30d' | 'all'

// ── Score & metrics engine ────────────────────────────────────────────────────

function safe(num: number, den: number): number {
  return den > 0 ? Math.min(100, Math.round((num / den) * 100)) : 0
}

interface Metrics {
  pctEngagement: number
  pctBienvenida: number
  pctPresentacion: number
  pctReactivacion: number
  pctConvTrial: number
  pctContactoTrial: number
  pctRetencion: number
  pctRespuesta: number
  score: number
}

function calcMetrics(r: SpcPerfReport): Metrics {
  const pctEngagement   = safe(r.members_participated, r.active_members_count)
  const pctBienvenida   = safe(r.welcome_sent, r.new_members)
  const pctPresentacion = safe(r.new_members_introduced, r.new_members)
  const pctReactivacion = safe(r.checkins_responded, r.checkins_sent)
  const pctConvTrial    = safe(r.trials_converted, r.trials_expiring_today)
  const pctContactoTrial = safe(r.trials_contacted, r.trials_expiring_today)
  const pctRetencion    = safe(r.cancellations_retained, r.cancellation_requests)
  const pctRespuesta    = safe(r.questions_answered_24h, r.questions_total)

  // Engagement (max 40)
  const engagementScore =
    pctEngagement * 0.25 +
    Math.min(r.avg_daily_messages, 10) / 10 * 100 * 0.10 +
    r.conversation_quality / 5 * 100 * 0.05

  // Activación (max 20)
  const activationScore =
    pctBienvenida * 0.05 +
    pctPresentacion * 0.05 +
    pctReactivacion * 0.10

  // Retención y conversión (max 30)
  const retentionScore =
    pctRetencion * 0.10 +
    pctContactoTrial * 0.05 +
    pctConvTrial * 0.05 +
    r.community_energy / 5 * 100 * 0.10

  // Operación (max 10)
  const operationScore = pctRespuesta * 0.10

  const score = Math.min(100, Math.round(engagementScore + activationScore + retentionScore + operationScore))

  return {
    pctEngagement, pctBienvenida, pctPresentacion, pctReactivacion,
    pctConvTrial, pctContactoTrial, pctRetencion, pctRespuesta, score,
  }
}

function scoreBadge(score: number): { label: string; cls: string } {
  if (score >= 90) return { label: 'Excelente', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' }
  if (score >= 75) return { label: 'Buena', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' }
  if (score >= 60) return { label: 'Riesgo', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' }
  return { label: 'Peligro', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' }
}

function scoreColor(score: number): string {
  if (score >= 90) return 'text-green-600 dark:text-green-400'
  if (score >= 75) return 'text-blue-600 dark:text-blue-400'
  if (score >= 60) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function avg(vals: number[]): number {
  if (vals.length === 0) return 0
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length)
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">{label}</p>
      <p className={cn('text-2xl font-bold', color ?? 'text-zinc-900 dark:text-zinc-100')}>{value}</p>
      {sub && <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function ScorePill({ score }: { score: number }) {
  const { label, cls } = scoreBadge(score)
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', cls)}>
      {score} · {label}
    </span>
  )
}

function Pct({ value }: { value: number }) {
  return <span className={cn('text-xs font-semibold', value >= 80 ? 'text-green-600' : value >= 50 ? 'text-amber-600' : 'text-red-500')}>{value}%</span>
}

// ── Expanded detail row ───────────────────────────────────────────────────────

function DetailRow({ r, m }: { r: SpcPerfReport; m: Metrics }) {
  const labelCls = 'text-xs text-zinc-400 dark:text-zinc-500'
  const valCls = 'text-xs font-semibold text-zinc-700 dark:text-zinc-300'

  function Pair({ label, value }: { label: string; value: string | number }) {
    return (
      <div className="flex items-center justify-between py-1 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
        <span className={labelCls}>{label}</span>
        <span className={valCls}>{value}</span>
      </div>
    )
  }

  return (
    <div className="bg-zinc-50 dark:bg-zinc-800/40 rounded-xl p-4 mt-1 grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Engagement */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-2">Engagement</p>
        <Pair label="Participaron" value={r.members_participated} />
        <Pair label="Activos totales" value={r.active_members_count} />
        <Pair label="% Engagement" value={`${m.pctEngagement}%`} />
        <Pair label="Mensajes/día" value={r.avg_daily_messages} />
        <Pair label="Calidad conv." value={`${r.conversation_quality}/5`} />
      </div>
      {/* Activación + Retención */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-green-600 dark:text-green-400 mb-2">Activación</p>
        <Pair label="Nuevos" value={r.new_members} />
        <Pair label="Bienvenidas enviadas" value={r.welcome_sent} />
        <Pair label="Se presentaron" value={r.new_members_introduced} />
        <Pair label="% Bienvenida" value={`${m.pctBienvenida}%`} />
        <Pair label="Check-ins enviados" value={r.checkins_sent} />
        <Pair label="% Reactivación" value={`${m.pctReactivacion}%`} />
      </div>
      {/* Trials + Operación */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-2">Retención · Operación</p>
        <Pair label="Trials venciendo" value={r.trials_expiring_today} />
        <Pair label="Trials convertidos" value={r.trials_converted} />
        <Pair label="% Conv. Trial" value={`${m.pctConvTrial}%`} />
        <Pair label="Cancel. solicitadas" value={r.cancellation_requests} />
        <Pair label="Retenidos" value={r.cancellations_retained} />
        <Pair label="% Retención" value={`${m.pctRetencion}%`} />
        <Pair label="Preguntas" value={r.questions_total} />
        <Pair label="Resp. <24h" value={r.questions_answered_24h} />
        <Pair label="% Respuesta" value={`${m.pctRespuesta}%`} />
        <Pair label="Referencias" value={r.referrals_generated} />
        <Pair label="Energía comunidad" value={`${r.community_energy}/5`} />
      </div>
      {/* Insights */}
      {(r.insights || r.top_action) && (
        <div className="md:col-span-3 border-t border-zinc-200 dark:border-zinc-700 pt-3">
          {r.insights && (
            <div className="mb-2">
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-0.5">Insights clave</p>
              <p className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{r.insights}</p>
            </div>
          )}
          {r.top_action && (
            <div>
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-0.5">Acción más impactante</p>
              <p className="text-xs text-zinc-700 dark:text-zinc-300">{r.top_action}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SpcPerfDashboard() {
  const supabase = useMemo(() => createClient(), [])
  const [reports, setReports] = useState<SpcPerfReport[]>([])
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState<Preset>('30d')
  const [selectedRep, setSelectedRep] = useState('Todos')
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  function getRange(p: Preset): { from: string; to: string } {
    const now = new Date()
    const fmt = (d: Date) => d.toISOString().split('T')[0]
    if (p === '7d')  { const f = new Date(now); f.setDate(now.getDate() - 6); return { from: fmt(f), to: fmt(now) } }
    if (p === '30d') { const f = new Date(now); f.setDate(now.getDate() - 29); return { from: fmt(f), to: fmt(now) } }
    return { from: '2020-01-01', to: fmt(now) }
  }

  const fetchReports = useCallback(async () => {
    setLoading(true)
    const { from, to } = getRange(preset)
    let q = supabase
      .from('spc_performance_reports')
      .select('*')
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false })
    if (selectedRep !== 'Todos') q = q.eq('rep_name', selectedRep)
    const { data } = await q
    setReports(data ?? [])
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, preset, selectedRep])

  useEffect(() => { fetchReports() }, [fetchReports])
  useEffect(() => { setPage(0) }, [preset, selectedRep])

  const repNames = useMemo(() => {
    const names = Array.from(new Set(reports.map((r) => r.rep_name)))
    return ['Todos', ...names.sort()]
  }, [reports])

  // All metrics computed once
  const allMetrics = useMemo(() => {
    return reports.map((r) => ({ r, m: calcMetrics(r) }))
  }, [reports])

  // KPI aggregates
  const kpis = useMemo(() => {
    if (allMetrics.length === 0) return null
    const scores       = allMetrics.map(({ m }) => m.score)
    const pctEngSem    = allMetrics.map(({ r }) => safe(r.active_members_count, r.total_members_count))
    const messages     = allMetrics.map(({ r }) => r.avg_daily_messages)
    const pctReact     = allMetrics.map(({ m }) => m.pctReactivacion)
    const pctConv      = allMetrics.map(({ m }) => m.pctConvTrial)
    const pctRet       = allMetrics.map(({ m }) => m.pctRetencion)
    const pctEng       = allMetrics.map(({ m }) => m.pctEngagement)
    const pctResp      = allMetrics.map(({ m }) => m.pctRespuesta)
    const refs         = allMetrics.map(({ r }) => r.referrals_generated)
    const energy       = allMetrics.map(({ r }) => r.community_energy)
    return {
      avgScore:       avg(scores),
      avgEngSemanal:  avg(pctEngSem),
      avgMessages:    Math.round(messages.reduce((s, v) => s + v, 0) / messages.length),
      avgReact:       avg(pctReact),
      avgConv:        avg(pctConv),
      avgRet:         avg(pctRet),
      avgEng:         avg(pctEng),
      avgResp:        avg(pctResp),
      totalRefs:      refs.reduce((s, v) => s + v, 0),
      avgEnergy:      (energy.reduce((s, v) => s + v, 0) / energy.length).toFixed(1),
    }
  }, [allMetrics])

  // Chart data
  const chartData = useMemo(() => {
    return [...allMetrics].reverse().map(({ r, m }) => ({
      date:    formatDate(r.date),
      score:   m.score,
      engagement: m.pctEngagement,
      reactivacion: m.pctReactivacion,
      convTrial: m.pctConvTrial,
      retencion: m.pctRetencion,
    }))
  }, [allMetrics])

  const totalPages = Math.ceil(allMetrics.length / PAGE_SIZE)
  const pageRows = allMetrics.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto">
        <PageHeader title="Client Success — SPC" description="Performance diario de gestión comunitaria">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Preset */}
            <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden">
              {(['7d', '30d', 'all'] as Preset[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPreset(p)}
                  className={cn(
                    'px-2.5 py-1.5 text-xs font-medium transition-colors border-r border-zinc-200 dark:border-zinc-700 last:border-r-0',
                    preset === p ? 'bg-[#185FA5] text-white' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                  )}
                >
                  {p === 'all' ? 'All' : p}
                </button>
              ))}
            </div>
            {/* Rep filter */}
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
              style={{ backgroundColor: '#185FA5' }}
            >
              <Plus className="h-3.5 w-3.5" />
              Nuevo reporte
            </Link>
          </div>
        </PageHeader>

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[...Array(8)].map((_, i) => <div key={i} className="h-24 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-xl" />)}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <div key={i} className="h-56 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-xl" />)}
            </div>
          </div>
        ) : reports.length === 0 ? (
          <EmptyState
            title="Sin reportes en este período"
            description="Crea el primer reporte SPC para ver métricas aquí."
            icon={<Plus className="h-10 w-10" />}
          />
        ) : (
          <>
            {/* ── KPIs Principales (5) ── */}
            <div className="mb-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2 px-0.5">KPIs Principales</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              <KpiCard
                label="% Engagement Semanal"
                value={kpis ? `${kpis.avgEngSemanal}%` : '—'}
                sub="activos / total miembros"
                color="text-blue-600 dark:text-blue-400"
              />
              <KpiCard
                label="Mensajes diarios"
                value={kpis ? String(kpis.avgMessages) : '—'}
                sub="promedio del período"
                color="text-sky-600 dark:text-sky-400"
              />
              <KpiCard
                label="% Reactivación inactivos"
                value={kpis ? `${kpis.avgReact}%` : '—'}
                sub="check-ins respondidos"
                color="text-green-600 dark:text-green-400"
              />
              <KpiCard
                label="% Conv. Trial"
                value={kpis ? `${kpis.avgConv}%` : '—'}
                sub="trials convertidos"
                color="text-amber-600 dark:text-amber-400"
              />
              <KpiCard
                label="% Retención cancelaciones"
                value={kpis ? `${kpis.avgRet}%` : '—'}
                sub="miembros retenidos"
                color="text-red-600 dark:text-red-400"
              />
            </div>

            {/* ── KPIs Secundarios ── */}
            <div className="mb-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2 px-0.5">Métricas secundarias</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <KpiCard
                label="Score final promedio"
                value={kpis ? String(kpis.avgScore) : '—'}
                sub={kpis ? scoreBadge(kpis.avgScore).label : undefined}
                color={kpis ? scoreColor(kpis.avgScore) : undefined}
              />
              <KpiCard
                label="% Respuesta <24h"
                value={kpis ? `${kpis.avgResp}%` : '—'}
                sub="preguntas respondidas"
                color="text-purple-600 dark:text-purple-400"
              />
              <KpiCard
                label="Referencias totales"
                value={kpis ? String(kpis.totalRefs) : '—'}
                sub="en el período"
                color="text-indigo-600 dark:text-indigo-400"
              />
              <KpiCard
                label="Energía comunidad"
                value={kpis ? `${kpis.avgEnergy}/5` : '—'}
                sub="promedio del período"
                color={kpis && parseFloat(kpis.avgEnergy) >= 4 ? 'text-green-600 dark:text-green-400' : parseFloat(kpis?.avgEnergy ?? '0') >= 3 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}
              />
            </div>

            {/* ── Charts ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {/* Score trend */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Score final</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v) => [`${v}`, 'Score']} contentStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="score" stroke="#185FA5" strokeWidth={2.5} dot={{ r: 3, fill: '#185FA5' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Multi-metric lines */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Engagement · Reactivación · Conv. Trial</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v, name) => [`${v}%`, name]} contentStyle={{ fontSize: 11 }} />
                      <Legend formatter={(v) => <span className="text-xs">{v}</span>} iconSize={8} />
                      <Line type="monotone" dataKey="engagement" name="Engagement" stroke="#185FA5" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="reactivacion" name="Reactivación" stroke="#3B6D11" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="convTrial" name="Conv. Trial" stroke="#BA7517" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Retención bar */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Retención de cancelaciones (%)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v) => [`${v}%`, 'Retención']} contentStyle={{ fontSize: 11 }} />
                      <Bar dataKey="retencion" name="Retención" fill="#1D9E75" radius={[3, 3, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* ── Reports table ── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Historial de reportes</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800">
                        {['Fecha', 'Rep', 'Score', 'Engagement', 'Reactivación', 'Conv. Trial', 'Retención', 'Energía', ''].map((h) => (
                          <th key={h} className="px-4 py-3 text-left font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map(({ r, m }) => {
                        const expanded = expandedId === r.id
                        return (
                          <>
                            <motion.tr
                              key={r.id}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className={cn(
                                'border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors',
                                expanded && 'bg-zinc-50 dark:bg-zinc-800/30'
                              )}
                            >
                              <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">{formatDate(r.date)}</td>
                              <td className="px-4 py-3 font-medium text-zinc-800 dark:text-zinc-200 whitespace-nowrap">{r.rep_name}</td>
                              <td className="px-4 py-3">
                                <ScorePill score={m.score} />
                              </td>
                              <td className="px-4 py-3"><Pct value={m.pctEngagement} /></td>
                              <td className="px-4 py-3"><Pct value={m.pctReactivacion} /></td>
                              <td className="px-4 py-3"><Pct value={m.pctConvTrial} /></td>
                              <td className="px-4 py-3"><Pct value={m.pctRetencion} /></td>
                              <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{r.community_energy}/5</td>
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => setExpandedId(expanded ? null : r.id)}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                  {expanded ? 'Cerrar' : 'Ver'}
                                  {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                </button>
                              </td>
                            </motion.tr>
                            {expanded && (
                              <tr key={`${r.id}-detail`} className="bg-zinc-50 dark:bg-zinc-800/20 border-b border-zinc-100 dark:border-zinc-800">
                                <td colSpan={9} className="px-4 py-3">
                                  <DetailRow r={r} m={m} />
                                </td>
                              </tr>
                            )}
                          </>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100 dark:border-zinc-800">
                    <p className="text-xs text-zinc-400">
                      {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, allMetrics.length)} de {allMetrics.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="text-xs text-zinc-500 px-1">{page + 1} / {totalPages}</span>
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
    </PageTransition>
  )
}
