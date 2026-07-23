'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/PageHeader'
import { PageTransition } from '@/components/motion/PageTransition'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import { Plus, ChevronDown, ChevronRight, Download, Pencil, Trash2, X, Users, Kanban } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
// recharts removed — no charts in current dashboard
import { motion, AnimatePresence } from 'framer-motion'
import { getCurrentWeekRange } from '@/lib/dateUtils'
import { ClientSuccessPipeline } from '@/components/client-success/ClientSuccessPipeline'
import { ClientsGroupsView } from '@/components/contacts/ClientsGroupsView'
import { useProfile } from '@/hooks/useProfile'
import { usePreviewRole } from '@/contexts/PreviewRoleContext'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 10

type Preset = 'week' | '7d' | '30d' | '90d' | 'all' | 'custom'

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
  // Success metrics
  client_retention_rate: number
  completion_rate: number
  engagement_score: number
  upsell_renewal_rate: number
  avg_resolution_time_hours: number
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
  if (preset === 'week') {
    const w = getCurrentWeekRange()
    return { from: w.start, to: w.end }
  }
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
          <p className={subLabel}>Activity</p>
          <Row label="Real conversations"     value={report.real_conversations} />

          <p className={subLabel}>Objections</p>
          <Row label="Objection 1"       value={report.objection_1} />
          <Row label="Objection 2"       value={report.objection_2} />
          <Row label="Objection 3"       value={report.objection_3} />
        </div>

        {/* Right column */}
        <div>
          <p className={subLabel}>Success Metrics</p>
          <Row label="Client Retention Rate" value={report.client_retention_rate ? `${report.client_retention_rate}%` : null} />
          <Row label="Completion Rate" value={report.completion_rate ? `${report.completion_rate}%` : null} />
          <Row label="Engagement Score" value={report.engagement_score ? `${report.engagement_score}%` : null} />
          <Row label="Upsell / Renewal Rate" value={report.upsell_renewal_rate ? `${report.upsell_renewal_rate}%` : null} />
          <Row label="Avg Resolution Time" value={report.avg_resolution_time_hours ? `${report.avg_resolution_time_hours} hrs` : null} />

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
  real_conversations: string
  objection_1: string
  objection_2: string
  objection_3: string
  learning_1: string
  learning_2: string
  learning_3: string
  performance_score: number
  improvement_notes: string
  client_retention_rate: string
  completion_rate: string
  engagement_score: string
  upsell_renewal_rate: string
  avg_resolution_time_hours: string
}

function reportToEditForm(r: HtReport): EditForm {
  return {
    date:                   r.date,
    rep_name:               r.rep_name,
    real_conversations:     String(r.real_conversations),
    objection_1:            r.objection_1 ?? '',
    objection_2:            r.objection_2 ?? '',
    objection_3:            r.objection_3 ?? '',
    learning_1:             r.learning_1 ?? '',
    learning_2:             r.learning_2 ?? '',
    learning_3:             r.learning_3 ?? '',
    performance_score:      r.performance_score,
    improvement_notes:      r.improvement_notes ?? '',
    client_retention_rate:  String(r.client_retention_rate ?? 0),
    completion_rate:        String(r.completion_rate ?? 0),
    engagement_score:       String(r.engagement_score ?? 0),
    upsell_renewal_rate:    String(r.upsell_renewal_rate ?? 0),
    avg_resolution_time_hours: String(r.avg_resolution_time_hours ?? 0),
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

  const inputCls = 'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30 focus:border-[#ffbd59]'
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
          real_conversations:     parseInt(form.real_conversations) || 0,
          objection_1:            form.objection_1 || null,
          objection_2:            form.objection_2 || null,
          objection_3:            form.objection_3 || null,
          learning_1:             form.learning_1 || null,
          learning_2:             form.learning_2 || null,
          learning_3:             form.learning_3 || null,
          performance_score:      form.performance_score,
          improvement_notes:      form.improvement_notes || null,
          client_retention_rate:  parseFloat(form.client_retention_rate) || 0,
          completion_rate:        parseFloat(form.completion_rate) || 0,
          engagement_score:       parseFloat(form.engagement_score) || 0,
          upsell_renewal_rate:    parseFloat(form.upsell_renewal_rate) || 0,
          avg_resolution_time_hours: parseFloat(form.avg_resolution_time_hours) || 0,
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

          {/* Activity */}
          <p className={sectionCls}>Activity</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Real conversations</label><NumInput field="real_conversations" /></div>
          </div>

          {/* Quality */}
          <p className={sectionCls}>Conversation Quality</p>
          <div className="grid grid-cols-3 gap-3">
            <div><label className={labelCls}>Objection 1</label><input type="text" value={form.objection_1} onChange={(e) => set('objection_1', e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Objection 2</label><input type="text" value={form.objection_2} onChange={(e) => set('objection_2', e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Objection 3</label><input type="text" value={form.objection_3} onChange={(e) => set('objection_3', e.target.value)} className={inputCls} /></div>
          </div>

          {/* Learnings */}
          <p className={sectionCls}>Strategic Insights</p>
          <div className="space-y-2">
            <div><label className={labelCls}>Learning 1</label><input type="text" value={form.learning_1} onChange={(e) => set('learning_1', e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Learning 2</label><input type="text" value={form.learning_2} onChange={(e) => set('learning_2', e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Learning 3</label><input type="text" value={form.learning_3} onChange={(e) => set('learning_3', e.target.value)} className={inputCls} /></div>
          </div>

          {/* Success Metrics */}
          <p className={sectionCls}>Success Metrics</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Client Retention Rate (%)</label><NumInput field="client_retention_rate" /></div>
            <div><label className={labelCls}>Completion Rate (%)</label><NumInput field="completion_rate" /></div>
            <div><label className={labelCls}>Engagement Score (%)</label><NumInput field="engagement_score" /></div>
            <div><label className={labelCls}>Upsell / Renewal Rate (%)</label><NumInput field="upsell_renewal_rate" /></div>
            <div><label className={labelCls}>Avg Resolution Time (hours)</label><NumInput field="avg_resolution_time_hours" /></div>
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
            style={{ backgroundColor: '#ffbd59' }}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type CsmTab = 'clients' | 'pipeline' | 'dashboard'

export default function HtCsmDashboardPage() {
  const { profile } = useProfile()
  const { previewRole } = usePreviewRole()
  const effectiveRole = previewRole ?? profile?.role ?? null
  const isCsmHt = effectiveRole === 'csm_ht'
  const [activeTab, setActiveTab] = useState<CsmTab>('dashboard')
  const supabase = useMemo(() => createClient(), [])

  // Set default tab based on role once loaded
  useEffect(() => {
    if (effectiveRole === 'csm_ht') setActiveTab('clients')
    else if (effectiveRole) setActiveTab('dashboard')
  }, [effectiveRole])
  const [reports, setReports] = useState<HtReport[]>([])
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState<Preset>('week')
  const [customFrom, setCustomFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().split('T')[0] })
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().split('T')[0])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingReport, setEditingReport] = useState<HtReport | null>(null)
  const weekRange = useMemo(() => getCurrentWeekRange(), [])
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

    const reportsRes = await q

    setReports(reportsRes.data ?? [])

    setPage(0)
    setLoading(false)
  }, [supabase, preset, customFrom, customTo])

  useEffect(() => { fetchReports() }, [fetchReports])

  // ── Aggregated KPIs ──
  const kpis = useMemo(() => {
    if (reports.length === 0) return null

    const totContacted   = reports.reduce((s, r) => s + r.graduates_contacted, 0)
    const totConversations = reports.reduce((s, r) => s + r.real_conversations, 0)
    const avgScore       = avg(reports.map((r) => r.performance_score))

    // Success metrics averages (only count reports that have non-zero values)
    const retentionVals = reports.map((r) => r.client_retention_rate ?? 0).filter((v) => v > 0)
    const completionVals = reports.map((r) => r.completion_rate ?? 0).filter((v) => v > 0)
    const engagementVals = reports.map((r) => r.engagement_score ?? 0).filter((v) => v > 0)
    const upsellVals = reports.map((r) => r.upsell_renewal_rate ?? 0).filter((v) => v > 0)
    const resolutionVals = reports.map((r) => r.avg_resolution_time_hours ?? 0).filter((v) => v > 0)

    return {
      responseRate:  pct(totConversations, totContacted),
      avgScore,
      avgRetention:   retentionVals.length > 0 ? retentionVals.reduce((s, v) => s + v, 0) / retentionVals.length : null,
      avgCompletion:  completionVals.length > 0 ? completionVals.reduce((s, v) => s + v, 0) / completionVals.length : null,
      avgEngagement:  engagementVals.length > 0 ? engagementVals.reduce((s, v) => s + v, 0) / engagementVals.length : null,
      avgUpsell:      upsellVals.length > 0 ? upsellVals.reduce((s, v) => s + v, 0) / upsellVals.length : null,
      avgResolution:  resolutionVals.length > 0 ? resolutionVals.reduce((s, v) => s + v, 0) / resolutionVals.length : null,
    }
  }, [reports])

  // ── Objections ──
  const objections = useMemo(() => collectObjections(reports), [reports])

  // ── Pagination ──
  const totalPages = Math.ceil(reports.length / PAGE_SIZE)
  const pageReports = reports.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <PageTransition>
      {/* Tab switcher — only for csm_ht role */}
      {isCsmHt && (
        <div className="max-w-7xl mx-auto mb-4">
          <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-800">
            <button
              onClick={() => setActiveTab('clients')}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'clients'
                  ? 'border-[#ffbd59] text-[#ffbd59]'
                  : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:border-zinc-300'
              )}
            >
              <Users className="h-4 w-4" />
              Clients
            </button>
            <button
              onClick={() => setActiveTab('pipeline')}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'pipeline'
                  ? 'border-[#ffbd59] text-[#ffbd59]'
                  : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:border-zinc-300'
              )}
            >
              <Kanban className="h-4 w-4" />
              Pipeline
            </button>
          </div>
        </div>
      )}

      {isCsmHt && activeTab === 'clients' ? (
        <ClientsGroupsView />
      ) : isCsmHt && activeTab === 'pipeline' ? (
        <ClientSuccessPipeline />
      ) : (
      <>
      <div className="max-w-7xl mx-auto">
        <PageHeader title="Client Success — High Ticket" description={preset === 'week' ? `Current week: ${weekRange.label} (Fri → Thu)` : 'Daily HT CSM performance'}>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Date preset */}
            <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden">
              {(['week', '7d', '30d', '90d', 'all', 'custom'] as Preset[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPreset(p)}
                  className={cn(
                    'px-2.5 py-1.5 text-xs font-medium transition-colors',
                    preset === p
                      ? p === 'week' ? 'bg-[#89bcef] text-[#1a1a2e]' : 'bg-[#ffbd59] text-[#1a1a2e]'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                  )}
                >
                  {p === 'week' ? 'Week' : p === 'all' ? 'All' : p === 'custom' ? 'Custom' : p}
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
            <div className="grid grid-cols-2 md:grid-cols-2 gap-3 mb-6">
              <KpiCard
                label="Response Rate"
                value={fmtPct(kpis.responseRate)}
                goal="Goal: ≥ 35%"
                barPct={isNaN(kpis.responseRate) ? 0 : (kpis.responseRate / 35) * 100}
                status={rateStatus(kpis.responseRate, 35, 25)}
              />
              <KpiCard
                label="Avg Score"
                value={isNaN(kpis.avgScore) ? '—' : `${kpis.avgScore.toFixed(1)} / 10`}
                sub="self-assessment"
                barPct={isNaN(kpis.avgScore) ? 0 : (kpis.avgScore / 10) * 100}
                status={rateStatus(kpis.avgScore * 10, 70, 50)}
              />
            </div>

            {/* ── Success Metrics ── */}
            <div className="mb-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2 px-0.5">Success Metrics</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              <KpiCard
                label="Client Retention Rate"
                value={kpis.avgRetention !== null ? `${kpis.avgRetention.toFixed(1)}%` : '—'}
                sub="avg for period"
                barPct={kpis.avgRetention ?? 0}
                status={rateStatus(kpis.avgRetention ?? 0, 80, 60)}
              />
              <KpiCard
                label="Completion Rate"
                value={kpis.avgCompletion !== null ? `${kpis.avgCompletion.toFixed(1)}%` : '—'}
                sub="avg for period"
                barPct={kpis.avgCompletion ?? 0}
                status={rateStatus(kpis.avgCompletion ?? 0, 70, 50)}
              />
              <KpiCard
                label="Engagement Score"
                value={kpis.avgEngagement !== null ? `${kpis.avgEngagement.toFixed(1)}%` : '—'}
                sub="avg for period"
                barPct={kpis.avgEngagement ?? 0}
                status={rateStatus(kpis.avgEngagement ?? 0, 70, 50)}
              />
              <KpiCard
                label="Upsell / Renewal Rate"
                value={kpis.avgUpsell !== null ? `${kpis.avgUpsell.toFixed(1)}%` : '—'}
                sub="avg for period"
                barPct={kpis.avgUpsell ?? 0}
                status={rateStatus(kpis.avgUpsell ?? 0, 30, 15)}
              />
              <KpiCard
                label="Avg Resolution Time"
                value={kpis.avgResolution !== null ? `${kpis.avgResolution.toFixed(1)} hrs` : '—'}
                sub="avg for period"
                barPct={kpis.avgResolution !== null ? Math.min(100, (1 - kpis.avgResolution / 48) * 100) : 0}
                status={kpis.avgResolution !== null ? (kpis.avgResolution <= 12 ? 'good' : kpis.avgResolution <= 24 ? 'warn' : 'alert') : 'alert'}
              />
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
                        {['', 'Date', 'Rep', 'Response%', 'Retention%', 'Completion%', 'Engagement%', 'Upsell%', 'Res. Time', 'Score'].map((h, i) => (
                          <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {pageReports.map((r) => {
                        const response = pct(r.real_conversations, r.graduates_contacted)
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

                        function ValCell({ v, unit }: { v: number; unit?: string }) {
                          return (
                            <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400">
                              {v > 0 ? `${v}${unit ?? ''}` : '—'}
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
                              <Cell v={response} st={rateStatus(response, 35, 25)} />
                              <ValCell v={r.client_retention_rate ?? 0} unit="%" />
                              <ValCell v={r.completion_rate ?? 0} unit="%" />
                              <ValCell v={r.engagement_score ?? 0} unit="%" />
                              <ValCell v={r.upsell_renewal_rate ?? 0} unit="%" />
                              <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400">
                                {(r.avg_resolution_time_hours ?? 0) > 0 ? `${r.avg_resolution_time_hours}h` : '—'}
                              </td>
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
      </>
      )}
    </PageTransition>
  )
}
