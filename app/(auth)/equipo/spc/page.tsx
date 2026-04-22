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
import { Plus, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Pencil, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
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
  if (score >= 90) return { label: 'Excellent', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' }
  if (score >= 75) return { label: 'Good', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' }
  if (score >= 60) return { label: 'At Risk', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' }
  return { label: 'Danger', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' }
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

function MainKpiCard({
  label, value, unit, sub, meta, alert,
}: {
  label: string
  value: number
  unit?: string
  sub?: string
  meta: number
  alert: number
}) {
  const pct = Math.min(100, Math.round((value / meta) * 100))
  const isGood    = value >= meta
  const isWarning = !isGood && value >= alert
  // colors
  const barColor  = isGood ? 'bg-green-500' : isWarning ? 'bg-orange-400' : 'bg-red-500'
  const textColor = isGood ? 'text-green-600 dark:text-green-400' : isWarning ? 'text-orange-500 dark:text-orange-400' : 'text-red-600 dark:text-red-400'
  const badgeColor = isGood
    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
    : isWarning
    ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  const statusLabel = isGood ? 'Goal met' : isWarning ? 'Needs improvement' : 'Alert'

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 leading-tight">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <p className={cn('text-2xl font-bold leading-none', textColor)}>
          {value}{unit ?? ''}
        </p>
        <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold shrink-0', badgeColor)}>
          {statusLabel}
        </span>
      </div>
      {/* Progress bar */}
      <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-zinc-400 dark:text-zinc-500">
        <span>{sub}</span>
        <span>Meta: {meta}{unit ?? ''}</span>
      </div>
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
        <Pair label="Participated" value={r.members_participated} />
        <Pair label="Total active" value={r.active_members_count} />
        <Pair label="% Engagement" value={`${m.pctEngagement}%`} />
        <Pair label="Messages/day" value={r.avg_daily_messages} />
        <Pair label="Conv. quality" value={`${r.conversation_quality}/5`} />
      </div>
      {/* Activation + Retention */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-green-600 dark:text-green-400 mb-2">Activation</p>
        <Pair label="New members" value={r.new_members} />
        <Pair label="Welcomes sent" value={r.welcome_sent} />
        <Pair label="Introduced themselves" value={r.new_members_introduced} />
        <Pair label="% Welcome" value={`${m.pctBienvenida}%`} />
        <Pair label="Check-ins sent" value={r.checkins_sent} />
        <Pair label="% Reactivation" value={`${m.pctReactivacion}%`} />
      </div>
      {/* Trials + Operations */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-2">Retention · Operations</p>
        <Pair label="Trials expiring" value={r.trials_expiring_today} />
        <Pair label="Trials converted" value={r.trials_converted} />
        <Pair label="% Trial Conv." value={`${m.pctConvTrial}%`} />
        <Pair label="Cancel. requests" value={r.cancellation_requests} />
        <Pair label="Retained" value={r.cancellations_retained} />
        <Pair label="% Retention" value={`${m.pctRetencion}%`} />
        <Pair label="Questions" value={r.questions_total} />
        <Pair label="Answered <24h" value={r.questions_answered_24h} />
        <Pair label="% Response" value={`${m.pctRespuesta}%`} />
        <Pair label="Referrals" value={r.referrals_generated} />
        <Pair label="Community energy" value={`${r.community_energy}/5`} />
      </div>
      {/* Insights */}
      {(r.insights || r.top_action) && (
        <div className="md:col-span-3 border-t border-zinc-200 dark:border-zinc-700 pt-3">
          {r.insights && (
            <div className="mb-2">
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-0.5">Key insights</p>
              <p className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{r.insights}</p>
            </div>
          )}
          {r.top_action && (
            <div>
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-0.5">Most impactful action</p>
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
  const [deleteTarget, setDeleteTarget] = useState<SpcPerfReport | null>(null)
  const [editTarget, setEditTarget] = useState<SpcPerfReport | null>(null)
  const [editForm, setEditForm] = useState<Record<string, string | number>>({})
  const [saving, setSaving] = useState(false)

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

  async function handleDelete(report: SpcPerfReport) {
    setReports((prev) => prev.filter((r) => r.id !== report.id))
    setDeleteTarget(null)
    const { error } = await supabase.from('spc_performance_reports').delete().eq('id', report.id)
    if (error) {
      toast.error(`Error deleting: ${error.message}`)
      fetchReports()
    } else {
      toast.success('Report deleted')
    }
  }

  function openEdit(report: SpcPerfReport) {
    setEditTarget(report)
    setEditForm({
      date: report.date,
      rep_name: report.rep_name,
      active_members_count: report.active_members_count,
      total_members_count: report.total_members_count,
      members_participated: report.members_participated,
      avg_daily_messages: report.avg_daily_messages,
      conversation_quality: report.conversation_quality,
      new_members: report.new_members,
      welcome_sent: report.welcome_sent,
      new_members_introduced: report.new_members_introduced,
      checkins_sent: report.checkins_sent,
      checkins_responded: report.checkins_responded,
      trials_expiring_today: report.trials_expiring_today,
      trials_converted: report.trials_converted,
      trials_contacted: report.trials_contacted,
      cancellation_requests: report.cancellation_requests,
      cancellations_retained: report.cancellations_retained,
      questions_total: report.questions_total,
      questions_answered_24h: report.questions_answered_24h,
      referrals_generated: report.referrals_generated,
      insights: report.insights ?? '',
      top_action: report.top_action ?? '',
      community_energy: report.community_energy,
    })
  }

  function setField(key: string, value: string | number) {
    setEditForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleEditSave() {
    if (!editTarget) return
    setSaving(true)
    const payload = {
      date:                    editForm.date,
      rep_name:                editForm.rep_name,
      active_members_count:    Number(editForm.active_members_count),
      total_members_count:     Number(editForm.total_members_count),
      members_participated:    Number(editForm.members_participated),
      avg_daily_messages:      Number(editForm.avg_daily_messages),
      conversation_quality:    Number(editForm.conversation_quality),
      new_members:             Number(editForm.new_members),
      welcome_sent:            Number(editForm.welcome_sent),
      new_members_introduced:  Number(editForm.new_members_introduced),
      checkins_sent:           Number(editForm.checkins_sent),
      checkins_responded:      Number(editForm.checkins_responded),
      trials_expiring_today:   Number(editForm.trials_expiring_today),
      trials_converted:        Number(editForm.trials_converted),
      trials_contacted:        Number(editForm.trials_contacted),
      cancellation_requests:   Number(editForm.cancellation_requests),
      cancellations_retained:  Number(editForm.cancellations_retained),
      questions_total:         Number(editForm.questions_total),
      questions_answered_24h:  Number(editForm.questions_answered_24h),
      referrals_generated:     Number(editForm.referrals_generated),
      insights:                editForm.insights || null,
      top_action:              editForm.top_action || null,
      community_energy:        Number(editForm.community_energy),
    }
    const { error } = await supabase
      .from('spc_performance_reports')
      .update(payload)
      .eq('id', editTarget.id)
    setSaving(false)
    if (error) {
      toast.error(`Error updating: ${error.message}`)
    } else {
      setReports((prev) =>
        prev.map((r) => (r.id === editTarget.id ? { ...r, ...payload, insights: payload.insights ?? null, top_action: payload.top_action ?? null } as SpcPerfReport : r))
      )
      setEditTarget(null)
      toast.success('Report updated')
    }
  }

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
    const pctEngSem    = allMetrics.map(({ m }) => m.pctEngagement)
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
        <PageHeader title="Client Success — SPC" description="Daily community management performance">
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
              New report
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
            title="No reports in this period"
            description="Create the first SPC report to see metrics here."
            icon={<Plus className="h-10 w-10" />}
          />
        ) : (
          <>
            {/* ── KPIs Principales (5) ── */}
            <div className="mb-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2 px-0.5">Main KPIs</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              <MainKpiCard
                label="% Weekly Engagement"
                value={kpis?.avgEngSemanal ?? 0}
                unit="%"
                sub="active / total members"
                meta={25}
                alert={15}
              />
              <MainKpiCard
                label="Daily Messages"
                value={kpis?.avgMessages ?? 0}
                sub="period average"
                meta={20}
                alert={10}
              />
              <MainKpiCard
                label="% Inactive Reactivation"
                value={kpis?.avgReact ?? 0}
                unit="%"
                sub="check-ins responded"
                meta={20}
                alert={10}
              />
              <MainKpiCard
                label="% Trial Conversion"
                value={kpis?.avgConv ?? 0}
                unit="%"
                sub="trials converted"
                meta={60}
                alert={40}
              />
              <MainKpiCard
                label="% Cancellation Retention"
                value={kpis?.avgRet ?? 0}
                unit="%"
                sub="members retained"
                meta={15}
                alert={8}
              />
            </div>

            {/* ── KPIs Secundarios ── */}
            <div className="mb-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2 px-0.5">Secondary Metrics</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <KpiCard
                label="Average Final Score"
                value={kpis ? String(kpis.avgScore) : '—'}
                sub={kpis ? scoreBadge(kpis.avgScore).label : undefined}
                color={kpis ? scoreColor(kpis.avgScore) : undefined}
              />
              <KpiCard
                label="% Response <24h"
                value={kpis ? `${kpis.avgResp}%` : '—'}
                sub="questions answered"
                color="text-purple-600 dark:text-purple-400"
              />
              <KpiCard
                label="Total Referrals"
                value={kpis ? String(kpis.totalRefs) : '—'}
                sub="in the period"
                color="text-indigo-600 dark:text-indigo-400"
              />
              <KpiCard
                label="Community Energy"
                value={kpis ? `${kpis.avgEnergy}/5` : '—'}
                sub="period average"
                color={kpis && parseFloat(kpis.avgEnergy) >= 4 ? 'text-green-600 dark:text-green-400' : parseFloat(kpis?.avgEnergy ?? '0') >= 3 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}
              />
            </div>

            {/* ── Charts ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {/* Score trend */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Final Score</CardTitle>
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
                  <CardTitle className="text-sm font-semibold">Engagement · Reactivation · Trial Conv.</CardTitle>
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
                      <Line type="monotone" dataKey="reactivacion" name="Reactivation" stroke="#3B6D11" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="convTrial" name="Conv. Trial" stroke="#BA7517" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Retención bar */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Cancellation Retention (%)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#71717a' }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v) => [`${v}%`, 'Retención']} contentStyle={{ fontSize: 11 }} />
                      <Bar dataKey="retencion" name="Retention" fill="#1D9E75" radius={[3, 3, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* ── Reports table ── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Report History</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800">
                        {['Date', 'Rep', 'Score', 'Engagement', 'Reactivation', 'Trial Conv.', 'Retention', 'Energy', ''].map((h) => (
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
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => setExpandedId(expanded ? null : r.id)}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    {expanded ? 'Close' : 'View'}
                                    {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                  </button>
                                  <button
                                    onClick={() => openEdit(r)}
                                    className="p-1 rounded text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                    title="Edit report"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setDeleteTarget(r)}
                                    className="p-1 rounded text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                    title="Delete report"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
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
                      {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, allMetrics.length)} of {allMetrics.length}
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

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-sm p-6 border border-zinc-200 dark:border-zinc-700">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Delete report?</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-5">
              Delete this report from {formatDate(deleteTarget.date)}? This cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                className="px-4 py-2 text-xs rounded-lg text-white font-semibold bg-red-600 hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditTarget(null)} />
          <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-2xl my-8 border border-zinc-200 dark:border-zinc-700">
            <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-700">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Edit Report — {formatDate(editTarget.date)}</h2>
              <button
                onClick={() => setEditTarget(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* General */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-3">General Information</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Rep</label>
                    <input
                      type="text"
                      value={editForm.rep_name}
                      onChange={(e) => setField('rep_name', e.target.value)}
                      className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Date</label>
                    <input
                      type="date"
                      value={editForm.date}
                      onChange={(e) => setField('date', e.target.value)}
                      className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Active members</label>
                    <input type="number" min={0} value={editForm.active_members_count} onChange={(e) => setField('active_members_count', e.target.value)} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Total members</label>
                    <input type="number" min={0} value={editForm.total_members_count} onChange={(e) => setField('total_members_count', e.target.value)} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                </div>
              </div>

              {/* Engagement */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-3">Engagement</p>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Members participated</label>
                    <input type="number" min={0} value={editForm.members_participated} onChange={(e) => setField('members_participated', e.target.value)} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Avg daily messages</label>
                    <input type="number" min={0} value={editForm.avg_daily_messages} onChange={(e) => setField('avg_daily_messages', e.target.value)} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Conversation quality (1–5)</label>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setField('conversation_quality', v)}
                        className={cn(
                          'flex-1 py-2 rounded-lg text-sm font-bold border-2 transition-all',
                          Number(editForm.conversation_quality) === v
                            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                            : 'border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:border-zinc-300'
                        )}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Activation */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-green-600 dark:text-green-400 mb-3">Activation</p>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">New members</label>
                    <input type="number" min={0} value={editForm.new_members} onChange={(e) => setField('new_members', e.target.value)} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Welcomes sent</label>
                    <input type="number" min={0} value={editForm.welcome_sent} onChange={(e) => setField('welcome_sent', e.target.value)} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Introduced themselves</label>
                    <input type="number" min={0} value={editForm.new_members_introduced} onChange={(e) => setField('new_members_introduced', e.target.value)} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Check-ins sent</label>
                    <input type="number" min={0} value={editForm.checkins_sent} onChange={(e) => setField('checkins_sent', e.target.value)} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Check-ins responded</label>
                    <input type="number" min={0} value={editForm.checkins_responded} onChange={(e) => setField('checkins_responded', e.target.value)} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                </div>
              </div>

              {/* Retention & Conversion */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-3">Retention & Conversion</p>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Trials expiring</label>
                    <input type="number" min={0} value={editForm.trials_expiring_today} onChange={(e) => setField('trials_expiring_today', e.target.value)} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Trials converted</label>
                    <input type="number" min={0} value={editForm.trials_converted} onChange={(e) => setField('trials_converted', e.target.value)} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Trials contacted</label>
                    <input type="number" min={0} value={editForm.trials_contacted} onChange={(e) => setField('trials_contacted', e.target.value)} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Cancellation requests</label>
                    <input type="number" min={0} value={editForm.cancellation_requests} onChange={(e) => setField('cancellation_requests', e.target.value)} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Members retained</label>
                    <input type="number" min={0} value={editForm.cancellations_retained} onChange={(e) => setField('cancellations_retained', e.target.value)} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                </div>
              </div>

              {/* Operations */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-purple-600 dark:text-purple-400 mb-3">Operations</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Questions total</label>
                    <input type="number" min={0} value={editForm.questions_total} onChange={(e) => setField('questions_total', e.target.value)} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Answered {'<'}24h</label>
                    <input type="number" min={0} value={editForm.questions_answered_24h} onChange={(e) => setField('questions_answered_24h', e.target.value)} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Referrals generated</label>
                    <input type="number" min={0} value={editForm.referrals_generated} onChange={(e) => setField('referrals_generated', e.target.value)} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                </div>
              </div>

              {/* Qualitative */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-3">Qualitative Insights</p>
                <div className="mb-3">
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Key insights</label>
                  <textarea
                    value={editForm.insights}
                    onChange={(e) => setField('insights', e.target.value)}
                    rows={3}
                    className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none"
                  />
                </div>
                <div className="mb-3">
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Most impactful action</label>
                  <textarea
                    value={editForm.top_action}
                    onChange={(e) => setField('top_action', e.target.value)}
                    rows={2}
                    className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Community energy (1–5)</label>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setField('community_energy', v)}
                        className={cn(
                          'flex-1 py-2 rounded-lg text-sm font-bold border-2 transition-all',
                          Number(editForm.community_energy) === v
                            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                            : 'border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:border-zinc-300'
                        )}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 p-5 border-t border-zinc-200 dark:border-zinc-700">
              <button
                onClick={() => setEditTarget(null)}
                className="px-4 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={saving}
                className="px-4 py-2 text-xs rounded-lg text-white font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: '#185FA5' }}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageTransition>
  )
}
