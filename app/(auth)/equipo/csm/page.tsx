'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/PageHeader'
import { PageTransition } from '@/components/motion/PageTransition'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import { Plus, ChevronDown, ChevronRight, Download, Pencil, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { motion, AnimatePresence } from 'framer-motion'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 10

type Preset = '7d' | '30d' | '90d' | 'all' | 'custom'

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

function getDateRange(preset: Preset, customFrom?: string, customTo?: string): { from: string; to: string } | null {
  if (preset === 'all') return null
  if (preset === 'custom' && customFrom && customTo) return { from: customFrom, to: customTo }
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  const from = new Date(today)
  from.setDate(today.getDate() - (preset === '7d' ? 6 : preset === '30d' ? 29 : 89))
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
  if (v >= 4 && v <= 6) return 'good'
  if (v >= 3) return 'warn'
  return 'alert'
}

function closeRateStatus(v: number): 'good' | 'warn' | 'alert' {
  if (isNaN(v)) return 'alert'
  if (v >= 30 && v <= 40) return 'good'
  if (v >= 25) return 'warn'
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
  label, value, sub, status, goal, barPct,
}: {
  label: string
  value: string
  sub?: string
  status: 'good' | 'warn' | 'alert'
  goal?: string
  barPct: number   // 0–100, how full to render the bar
}) {
  const barColor  = status === 'good' ? 'bg-green-500' : status === 'warn' ? 'bg-orange-400' : 'bg-red-500'
  const textColor = RATE_COLORS[status]
  const badgeColor = status === 'good'
    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
    : status === 'warn'
    ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  const statusLabel = status === 'good' ? 'On track' : status === 'warn' ? 'At risk' : 'Below target'

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 leading-tight">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <p className={cn('text-2xl font-bold leading-none', textColor)}>{value}</p>
        <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold shrink-0', badgeColor)}>
          {statusLabel}
        </span>
      </div>
      {/* Progress bar */}
      <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', barColor)}
          style={{ width: `${Math.min(100, Math.max(0, barPct))}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-zinc-400 dark:text-zinc-500">
        <span>{sub}</span>
        {goal && <span>{goal}</span>}
      </div>
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

const LOST_REASONS = ['Lack of interest', 'Price', 'Timing', 'Not qualified', 'Other']

function ReportDetail({
  report,
  onEdit,
  onDelete,
}: {
  report: HtReport
  onEdit: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  const rowLabel = 'text-xs text-zinc-500 dark:text-zinc-400'
  const rowValue = 'text-xs font-medium text-zinc-800 dark:text-zinc-200 text-right'
  const subLabel = 'text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2 mt-3'

  function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
    if (value === null || value === undefined || value === '') return null
    return (
      <div className="flex items-center justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
        <span className={rowLabel}>{label}</span>
        <span className={rowValue}>{String(value)}</span>
      </div>
    )
  }

  return (
    <div className="px-6 pb-5 pt-3 bg-zinc-50 dark:bg-zinc-800/40 border-t border-zinc-100 dark:border-zinc-800">
      {/* Action bar */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-zinc-400">
          {formatDate(report.date)} · {report.rep_name}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit() }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-white dark:hover:bg-zinc-800 transition-colors"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
          {!confirmDelete ? (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-lg px-3 py-1.5">
              <span className="text-xs text-red-700 dark:text-red-300 font-medium">Delete this report?</span>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete() }}
                className="text-xs font-bold text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-100 transition-colors"
              >
                Yes
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(false) }}
                className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Two-column detail */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
        {/* Left column */}
        <div>
          <p className={subLabel}>Funnel Metrics</p>
          <Row label="Graduates contacted"    value={report.graduates_contacted} />
          <Row label="Graduates responded"    value={report.graduates_responded} />
          <Row label="Real conversations"     value={report.real_conversations} />
          <Row label="Ascension invitations"  value={report.ascension_invitations} />
          <Row label="Calls scheduled"        value={report.calls_scheduled} />
          <Row label="Calls showed"           value={report.calls_showed} />
          <Row label="Enrollments closed"     value={report.enrollments_closed} />
          <Row label="Calls today"             value={report.total_calls_week} />

          <p className={subLabel}>Lost Opportunities</p>
          <Row label="Leads lost"      value={report.leads_lost} />
          <Row label="Primary reason"  value={report.lost_reason} />

          <p className={subLabel}>Objections</p>
          <Row label="Objection 1"       value={report.objection_1} />
          <Row label="Objection 2"       value={report.objection_2} />
          <Row label="Objection 3"       value={report.objection_3} />
          <Row label="Graduate patterns" value={report.graduate_patterns} />
        </div>

        {/* Right column */}
        <div>
          <p className={subLabel}>Key Learnings</p>
          <Row label="Learning 1" value={report.learning_1} />
          <Row label="Learning 2" value={report.learning_2} />
          <Row label="Learning 3" value={report.learning_3} />

          <p className={subLabel}>Self-Assessment</p>
          <Row label="Performance score"  value={`${report.performance_score} / 10`} />
          <Row label="Improvement notes"  value={report.improvement_notes} />
        </div>
      </div>
    </div>
  )
}

// ── Edit modal ────────────────────────────────────────────────────────────────

interface EditForm {
  date: string
  rep_name: string
  graduates_contacted: string
  graduates_responded: string
  real_conversations: string
  ascension_invitations: string
  calls_scheduled: string
  calls_showed: string
  enrollments_closed: string
  total_calls_week: string
  objection_1: string
  objection_2: string
  objection_3: string
  graduate_patterns: string
  leads_lost: string
  lost_reason: string
  learning_1: string
  learning_2: string
  learning_3: string
  performance_score: number
  improvement_notes: string
}

function reportToEditForm(r: HtReport): EditForm {
  return {
    date:                   r.date,
    rep_name:               r.rep_name,
    graduates_contacted:    String(r.graduates_contacted),
    graduates_responded:    String(r.graduates_responded),
    real_conversations:     String(r.real_conversations),
    ascension_invitations:  String(r.ascension_invitations),
    calls_scheduled:        String(r.calls_scheduled),
    calls_showed:           String(r.calls_showed),
    enrollments_closed:     String(r.enrollments_closed),
    total_calls_week:       String(r.total_calls_week),
    objection_1:            r.objection_1 ?? '',
    objection_2:            r.objection_2 ?? '',
    objection_3:            r.objection_3 ?? '',
    graduate_patterns:      r.graduate_patterns ?? '',
    leads_lost:             String(r.leads_lost),
    lost_reason:            r.lost_reason ?? '',
    learning_1:             r.learning_1 ?? '',
    learning_2:             r.learning_2 ?? '',
    learning_3:             r.learning_3 ?? '',
    performance_score:      r.performance_score,
    improvement_notes:      r.improvement_notes ?? '',
  }
}

function EditModal({
  report,
  onClose,
  onSaved,
}: {
  report: HtReport
  onClose: () => void
  onSaved: (updated: HtReport) => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [form, setForm] = useState<EditForm>(() => reportToEditForm(report))
  const [saving, setSaving] = useState(false)

  function set<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const inputCls = 'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400'
  const readonlyCls = 'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400'
  const labelCls = 'block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1'
  const sectionCls = 'text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2 mt-4 first:mt-0'

  async function handleSave() {
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('ht_csm_reports')
        .update({
          date:                   form.date,
          rep_name:               form.rep_name,
          graduates_contacted:    parseInt(form.graduates_contacted) || 0,
          graduates_responded:    parseInt(form.graduates_responded) || 0,
          real_conversations:     parseInt(form.real_conversations) || 0,
          ascension_invitations:  parseInt(form.ascension_invitations) || 0,
          calls_scheduled:        parseInt(form.calls_scheduled) || 0,
          calls_showed:           parseInt(form.calls_showed) || 0,
          enrollments_closed:     parseInt(form.enrollments_closed) || 0,
          total_calls_week:       parseInt(form.total_calls_week) || 0,
          objection_1:            form.objection_1 || null,
          objection_2:            form.objection_2 || null,
          objection_3:            form.objection_3 || null,
          graduate_patterns:      form.graduate_patterns || null,
          leads_lost:             parseInt(form.leads_lost) || 0,
          lost_reason:            form.lost_reason || null,
          learning_1:             form.learning_1 || null,
          learning_2:             form.learning_2 || null,
          learning_3:             form.learning_3 || null,
          performance_score:      form.performance_score,
          improvement_notes:      form.improvement_notes || null,
        })
        .eq('id', report.id)
        .select()
        .single()

      if (error) { toast.error(`Save failed: ${error.message}`); return }
      toast.success('Report updated')
      onSaved(data as HtReport)
    } catch (err) {
      toast.error(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  function NumInput({ field }: { field: keyof EditForm }) {
    return (
      <input
        type="number"
        min={0}
        value={form[field] as string}
        onChange={(e) => set(field, e.target.value as EditForm[typeof field])}
        placeholder="0"
        className={inputCls}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-zinc-200 dark:border-zinc-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 sticky top-0 bg-white dark:bg-zinc-900 z-10">
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Edit Report</p>
            <p className="text-xs text-zinc-400 mt-0.5">{report.rep_name} · {formatDate(report.date)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Fields */}
        <div className="px-6 py-5 space-y-3">
          {/* General */}
          <p className={sectionCls}>General</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Rep name</label>
              <input type="text" value={form.rep_name} onChange={(e) => set('rep_name', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Date</label>
              <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Funnel */}
          <p className={sectionCls}>Funnel Metrics</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Graduates contacted</label><NumInput field="graduates_contacted" /></div>
            <div><label className={labelCls}>Graduates responded</label><NumInput field="graduates_responded" /></div>
            <div><label className={labelCls}>Real conversations</label><NumInput field="real_conversations" /></div>
            <div><label className={labelCls}>Ascension invitations</label><NumInput field="ascension_invitations" /></div>
            <div><label className={labelCls}>Calls scheduled</label><NumInput field="calls_scheduled" /></div>
            <div><label className={labelCls}>Calls showed</label><NumInput field="calls_showed" /></div>
            <div><label className={labelCls}>Enrollments closed</label><NumInput field="enrollments_closed" /></div>
            <div><label className={labelCls}>Calls today</label><NumInput field="total_calls_week" /></div>
          </div>

          {/* Quality */}
          <p className={sectionCls}>Conversation Quality</p>
          <div className="grid grid-cols-3 gap-3">
            <div><label className={labelCls}>Objection 1</label><input type="text" value={form.objection_1} onChange={(e) => set('objection_1', e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Objection 2</label><input type="text" value={form.objection_2} onChange={(e) => set('objection_2', e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Objection 3</label><input type="text" value={form.objection_3} onChange={(e) => set('objection_3', e.target.value)} className={inputCls} /></div>
          </div>
          <div>
            <label className={labelCls}>Graduate patterns</label>
            <textarea value={form.graduate_patterns} onChange={(e) => set('graduate_patterns', e.target.value)} rows={2} className={cn(inputCls, 'resize-none')} />
          </div>

          {/* Lost */}
          <p className={sectionCls}>Lost Opportunities</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Leads lost</label><NumInput field="leads_lost" /></div>
            <div>
              <label className={labelCls}>Primary reason</label>
              <select value={form.lost_reason} onChange={(e) => set('lost_reason', e.target.value)} className={inputCls}>
                <option value="">Select…</option>
                {LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {/* Learnings */}
          <p className={sectionCls}>Strategic Insights</p>
          <div className="space-y-2">
            <div><label className={labelCls}>Learning 1</label><input type="text" value={form.learning_1} onChange={(e) => set('learning_1', e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Learning 2</label><input type="text" value={form.learning_2} onChange={(e) => set('learning_2', e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Learning 3</label><input type="text" value={form.learning_3} onChange={(e) => set('learning_3', e.target.value)} className={inputCls} /></div>
          </div>

          {/* Self-assessment */}
          <p className={sectionCls}>Performance Self-Assessment</p>
          <div>
            <label className={labelCls}>Performance score (1–10)</label>
            <div className="flex gap-1.5 flex-wrap mt-1">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => set('performance_score', n)}
                  className={cn(
                    'w-9 h-9 rounded-lg text-sm font-bold border-2 transition-all',
                    form.performance_score === n
                      ? n >= 8 ? 'bg-green-500 border-green-500 text-white'
                        : n >= 5 ? 'bg-amber-400 border-amber-400 text-white'
                        : 'bg-red-500 border-red-500 text-white'
                      : 'border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:border-zinc-400'
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Improvement notes</label>
            <textarea value={form.improvement_notes} onChange={(e) => set('improvement_notes', e.target.value)} rows={2} className={cn(inputCls, 'resize-none')} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 sticky bottom-0 bg-white dark:bg-zinc-900">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-xs rounded-lg text-white font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity"
            style={{ backgroundColor: '#185FA5' }}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
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
  const [customFrom, setCustomFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().split('T')[0] })
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().split('T')[0])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingReport, setEditingReport] = useState<HtReport | null>(null)
  const [page, setPage] = useState(0)

  async function handleDelete(id: string) {
    const { error } = await supabase.from('ht_csm_reports').delete().eq('id', id)
    if (error) { toast.error(`Delete failed: ${error.message}`); return }
    setReports((prev) => prev.filter((r) => r.id !== id))
    setExpandedId(null)
    toast.success('Report deleted')
  }

  const fetchReports = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('ht_csm_reports')
      .select('*')
      .order('date', { ascending: false })

    const range = getDateRange(preset, customFrom, customTo)
    if (range) {
      q = q.gte('date', range.from).lte('date', range.to)
    }

    const { data } = await q
    setReports(data ?? [])
    setPage(0)
    setLoading(false)
  }, [supabase, preset, customFrom, customTo])

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
    const sumCalls       = reports.reduce((s, r) => s + r.total_calls_week, 0)
    const avgScore       = avg(reports.map((r) => r.performance_score))

    return {
      outreachRate:  pct(totContacted, totGraduates),
      responseRate:  pct(totConversations, totContacted),
      pitchRate:     pct(totInvitations, totConversations),
      showRate:      pct(totShowed, totScheduled),
      closeRate:     pct(totClosed, totShowed),
      sumCalls,
      avgScore,
      totalClosed: totClosed,
      totContacted,
      totGraduates,
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
        <PageHeader title="Client Success — High Ticket" description="Daily HT CSM performance">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Date preset */}
            <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden">
              {(['7d', '30d', '90d', 'all', 'custom'] as Preset[]).map((p) => (
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
                  {p === 'all' ? 'All' : p === 'custom' ? 'Custom' : p}
                </button>
              ))}
            </div>
            {preset === 'custom' && (
              <div className="flex items-center gap-1.5">
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100" />
                <span className="text-xs text-zinc-400">→</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100" />
              </div>
            )}
            <Link
              href="/equipo/csm/nuevo"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#1D9E75' }}
            >
              <Plus className="h-3.5 w-3.5" />
              New Report
            </Link>
            <button
              onClick={() => { const t = document.title; const r = getDateRange(preset, customFrom, customTo); document.title = `Client Success HT — ${r ? r.from + ' to ' + r.to : 'All time'}`; window.print(); document.title = t }}
              className="no-print inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Export PDF
            </button>
          </div>
        </PageHeader>

        <div className="print-header">
          <img src="/logo.png" width="120" alt="HIC Parenting" />
          <h1 style={{ fontSize: '18px', marginTop: '8px', fontWeight: 600 }}>Client Success HT — Performance Report</h1>
          <p style={{ fontSize: '12px', color: '#666' }}>Period: {(() => { const r = getDateRange(preset, customFrom, customTo); return r ? `${r.from} — ${r.to}` : 'All time' })()}</p>
          <p style={{ fontSize: '12px', color: '#666' }}>Generated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </div>

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
                goal="Goal: ≥ 50%"
                barPct={isNaN(kpis.outreachRate) ? 0 : (kpis.outreachRate / 50) * 100}
                status={rateStatus(kpis.outreachRate, 50, 40)}
              />
              <KpiCard
                label="Response Rate"
                value={fmtPct(kpis.responseRate)}
                goal="Goal: ≥ 35%"
                barPct={isNaN(kpis.responseRate) ? 0 : (kpis.responseRate / 35) * 100}
                status={rateStatus(kpis.responseRate, 35, 25)}
              />
              <KpiCard
                label="Pitch Rate"
                value={fmtPct(kpis.pitchRate)}
                goal="Goal: ≥ 45%"
                barPct={isNaN(kpis.pitchRate) ? 0 : (kpis.pitchRate / 45) * 100}
                status={rateStatus(kpis.pitchRate, 45, 30)}
              />
              <KpiCard
                label="Show Rate"
                value={fmtPct(kpis.showRate)}
                goal="Goal: ≥ 65%"
                barPct={isNaN(kpis.showRate) ? 0 : (kpis.showRate / 65) * 100}
                status={rateStatus(kpis.showRate, 65, 50)}
              />
              <KpiCard
                label="Close Rate"
                value={fmtPct(kpis.closeRate)}
                goal="Goal: 30–40%"
                barPct={isNaN(kpis.closeRate) ? 0 : (kpis.closeRate / 40) * 100}
                status={closeRateStatus(kpis.closeRate)}
              />
              <KpiCard
                label="Total Calls"
                value={String(kpis.sumCalls)}
                sub="sum for period"
                barPct={Math.min(100, (kpis.sumCalls / (reports.length * 6)) * 100)}
                status={kpis.sumCalls > 0 ? 'good' : 'alert'}
              />
              <KpiCard
                label="Avg Score"
                value={isNaN(kpis.avgScore) ? '—' : `${kpis.avgScore.toFixed(1)} / 10`}
                sub="self-assessment"
                barPct={isNaN(kpis.avgScore) ? 0 : (kpis.avgScore / 10) * 100}
                status={rateStatus(kpis.avgScore * 10, 70, 50)}
              />
              <KpiCard
                label="Total Enrollments"
                value={String(kpis.totalClosed)}
                sub="closed in period"
                barPct={Math.min(100, kpis.totalClosed * 20)}
                status={kpis.totalClosed > 0 ? 'good' : 'warn'}
              />
              <KpiCard
                label="Graduates Contacted"
                value={`${kpis.totContacted} of ${kpis.totGraduates}`}
                sub={`${fmtPct(pct(kpis.totContacted, kpis.totGraduates))} reached`}
                goal="Goal: contact all"
                barPct={kpis.totGraduates > 0 ? (kpis.totContacted / kpis.totGraduates) * 100 : 0}
                status={rateStatus(pct(kpis.totContacted, kpis.totGraduates), 50, 30)}
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
                        formatter={(v) => [`${Number(v ?? 0).toFixed(1)}%`]}
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

              {/* Daily call volume */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Daily Call Volume</CardTitle>
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
                      <Tooltip formatter={(v) => [`${Number(v ?? 0).toFixed(1)}%`]} contentStyle={{ fontSize: 11 }} />
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
                        {['', 'Date', 'Rep', 'Outreach%', 'Response%', 'Pitch%', 'Show%', 'Close%', 'Calls', 'Score'].map((h, i) => (
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
                                    <ReportDetail
                                      report={r}
                                      onEdit={() => setEditingReport(r)}
                                      onDelete={() => handleDelete(r.id)}
                                    />
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

      {editingReport && (
        <EditModal
          report={editingReport}
          onClose={() => setEditingReport(null)}
          onSaved={(updated) => {
            setReports((prev) => prev.map((r) => r.id === updated.id ? updated : r))
            setEditingReport(null)
          }}
        />
      )}
    </PageTransition>
  )
}
