'use client'

import { useEffect, useState, useMemo, useCallback, Fragment } from 'react'
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
import { motion, AnimatePresence } from 'framer-motion'
import { getCurrentWeekRange } from '@/lib/dateUtils'
import { ClientSuccessPipeline } from '@/components/client-success/ClientSuccessPipeline'
import { ClientsGroupsView } from '@/components/contacts/ClientsGroupsView'
import { useProfile } from '@/hooks/useProfile'
import { usePreviewRole } from '@/contexts/PreviewRoleContext'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 10

type Preset = 'week' | '7d' | '30d' | '90d' | 'all' | 'custom'

interface DailyActivity {
  id: string
  csm_name: string
  date: string
  // Section 1 — Client Management
  active_clients: number
  checkins_completed: number
  at_risk_identified: number
  at_risk_recovered: number
  issues_reported: number
  issues_resolved_same_day: number
  follow_ups_sent: number
  follow_ups_replied: number
  // Section 2 — Sessions
  sessions_scheduled: number
  sessions_completed: number
  no_shows: number
  rescheduled: number
  session_notes_filed: number
  coach_flags_raised: number
  // Section 3 — Onboarding
  new_clients_started: number
  welcome_calls_done: number
  onboarding_steps_completed: number
  portal_access_verified: number
  first_session_booked: number
  onboarding_stuck: number
  onboarding_completed_total: number
  // Section 4 — Long-Term Clients
  lt_active_clients: number
  lt_checkins: number
  lt_upsell_conversations: number
  lt_upsells_closed: number
  lt_churn_requests: number
  // Section 5 — Graduates & Renewals
  graduates_contacted: number
  graduates_responded: number
  renewals_offered: number
  renewals_closed: number
  referrals_asked: number
  referrals_received: number
  testimonials_requested: number
  testimonials_received: number
  // Section 6 — Volume
  total_messages_sent: number
  total_calls_made: number
  hours_in_client_work: number
  // Section 8 — Blockers
  main_blocker: string | null
  waiting_on_team: string | null
  escalated_why: string | null
  // Section 9 — Wrap-up
  wins_today: string | null
  focus_tomorrow: string | null
  capacity: string | null
  created_at: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pct(num: number, den: number): number {
  return den > 0 ? (num / den) * 100 : NaN
}

function fmtPct(v: number): string {
  return isNaN(v) ? '—' : `${v.toFixed(0)}%`
}

function sum(arr: DailyActivity[], key: keyof DailyActivity): number {
  return arr.reduce((s, r) => s + (Number(r[key]) || 0), 0)
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

function rateStatus(v: number, goal: number): 'good' | 'warn' | 'alert' {
  if (isNaN(v)) return 'alert'
  if (v >= goal) return 'good'
  if (v >= goal - 15) return 'warn'
  return 'alert'
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

const CAPACITY_BADGE: Record<string, string> = {
  low:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  high:   'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
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
  barPct: number
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

// ── Row detail expand ─────────────────────────────────────────────────────────

function ReportDetail({
  report,
  onEdit,
  onDelete,
}: {
  report: DailyActivity
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
          {formatDate(report.date)} · {report.csm_name}
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
          <p className={subLabel}>Client Management</p>
          <Row label="Active clients" value={report.active_clients} />
          <Row label="Check-ins completed" value={report.checkins_completed} />
          <Row label="At-risk identified" value={report.at_risk_identified} />
          <Row label="At-risk recovered" value={report.at_risk_recovered} />
          <Row label="Issues reported" value={report.issues_reported} />
          <Row label="Issues resolved same day" value={report.issues_resolved_same_day} />
          <Row label="Follow-ups sent" value={report.follow_ups_sent} />
          <Row label="Follow-ups replied" value={report.follow_ups_replied} />

          <p className={subLabel}>Sessions</p>
          <Row label="Sessions scheduled" value={report.sessions_scheduled} />
          <Row label="Sessions completed" value={report.sessions_completed} />
          <Row label="No-shows" value={report.no_shows} />
          <Row label="Rescheduled" value={report.rescheduled} />
          <Row label="Session notes filed" value={report.session_notes_filed} />
          <Row label="Coach flags raised" value={report.coach_flags_raised} />

          <p className={subLabel}>Onboarding</p>
          <Row label="New clients started" value={report.new_clients_started} />
          <Row label="Welcome calls done" value={report.welcome_calls_done} />
          <Row label="Onboarding steps completed" value={report.onboarding_steps_completed} />
          <Row label="Portal access verified" value={report.portal_access_verified} />
          <Row label="First session booked" value={report.first_session_booked} />
          <Row label="Onboarding stuck" value={report.onboarding_stuck} />
          <Row label="Onboarding completed (total)" value={report.onboarding_completed_total} />
        </div>

        {/* Right column */}
        <div>
          <p className={subLabel}>Long-Term Clients</p>
          <Row label="LT active clients" value={report.lt_active_clients} />
          <Row label="LT check-ins" value={report.lt_checkins} />
          <Row label="LT upsell conversations" value={report.lt_upsell_conversations} />
          <Row label="LT upsells closed" value={report.lt_upsells_closed} />
          <Row label="LT churn requests" value={report.lt_churn_requests} />

          <p className={subLabel}>Graduates & Renewals</p>
          <Row label="Graduates contacted" value={report.graduates_contacted} />
          <Row label="Graduates responded" value={report.graduates_responded} />
          <Row label="Renewals offered" value={report.renewals_offered} />
          <Row label="Renewals closed" value={report.renewals_closed} />
          <Row label="Referrals asked" value={report.referrals_asked} />
          <Row label="Referrals received" value={report.referrals_received} />
          <Row label="Testimonials requested" value={report.testimonials_requested} />
          <Row label="Testimonials received" value={report.testimonials_received} />

          <p className={subLabel}>Volume</p>
          <Row label="Total messages sent" value={report.total_messages_sent} />
          <Row label="Total calls made" value={report.total_calls_made} />
          <Row label="Hours in client work" value={report.hours_in_client_work} />

          <p className={subLabel}>Blockers & Escalations</p>
          <Row label="Main blocker" value={report.main_blocker} />
          <Row label="Waiting on team" value={report.waiting_on_team} />
          <Row label="Escalated — why" value={report.escalated_why} />

          <p className={subLabel}>Wrap-up</p>
          <Row label="Wins today" value={report.wins_today} />
          <Row label="Focus tomorrow" value={report.focus_tomorrow} />
          <Row label="Capacity" value={report.capacity} />
        </div>
      </div>
    </div>
  )
}

// ── Edit modal ────────────────────────────────────────────────────────────────

interface EditForm {
  csm_name: string
  date: string
  active_clients: string
  checkins_completed: string
  at_risk_identified: string
  at_risk_recovered: string
  issues_reported: string
  issues_resolved_same_day: string
  follow_ups_sent: string
  follow_ups_replied: string
  sessions_scheduled: string
  sessions_completed: string
  no_shows: string
  rescheduled: string
  session_notes_filed: string
  coach_flags_raised: string
  new_clients_started: string
  welcome_calls_done: string
  onboarding_steps_completed: string
  portal_access_verified: string
  first_session_booked: string
  onboarding_stuck: string
  onboarding_completed_total: string
  lt_active_clients: string
  lt_checkins: string
  lt_upsell_conversations: string
  lt_upsells_closed: string
  lt_churn_requests: string
  graduates_contacted: string
  graduates_responded: string
  renewals_offered: string
  renewals_closed: string
  referrals_asked: string
  referrals_received: string
  testimonials_requested: string
  testimonials_received: string
  total_messages_sent: string
  total_calls_made: string
  hours_in_client_work: string
  main_blocker: string
  waiting_on_team: string
  escalated_why: string
  wins_today: string
  focus_tomorrow: string
  capacity: string
}

function activityToEditForm(r: DailyActivity): EditForm {
  return {
    csm_name: r.csm_name,
    date: r.date,
    active_clients: String(r.active_clients ?? 0),
    checkins_completed: String(r.checkins_completed ?? 0),
    at_risk_identified: String(r.at_risk_identified ?? 0),
    at_risk_recovered: String(r.at_risk_recovered ?? 0),
    issues_reported: String(r.issues_reported ?? 0),
    issues_resolved_same_day: String(r.issues_resolved_same_day ?? 0),
    follow_ups_sent: String(r.follow_ups_sent ?? 0),
    follow_ups_replied: String(r.follow_ups_replied ?? 0),
    sessions_scheduled: String(r.sessions_scheduled ?? 0),
    sessions_completed: String(r.sessions_completed ?? 0),
    no_shows: String(r.no_shows ?? 0),
    rescheduled: String(r.rescheduled ?? 0),
    session_notes_filed: String(r.session_notes_filed ?? 0),
    coach_flags_raised: String(r.coach_flags_raised ?? 0),
    new_clients_started: String(r.new_clients_started ?? 0),
    welcome_calls_done: String(r.welcome_calls_done ?? 0),
    onboarding_steps_completed: String(r.onboarding_steps_completed ?? 0),
    portal_access_verified: String(r.portal_access_verified ?? 0),
    first_session_booked: String(r.first_session_booked ?? 0),
    onboarding_stuck: String(r.onboarding_stuck ?? 0),
    onboarding_completed_total: String(r.onboarding_completed_total ?? 0),
    lt_active_clients: String(r.lt_active_clients ?? 0),
    lt_checkins: String(r.lt_checkins ?? 0),
    lt_upsell_conversations: String(r.lt_upsell_conversations ?? 0),
    lt_upsells_closed: String(r.lt_upsells_closed ?? 0),
    lt_churn_requests: String(r.lt_churn_requests ?? 0),
    graduates_contacted: String(r.graduates_contacted ?? 0),
    graduates_responded: String(r.graduates_responded ?? 0),
    renewals_offered: String(r.renewals_offered ?? 0),
    renewals_closed: String(r.renewals_closed ?? 0),
    referrals_asked: String(r.referrals_asked ?? 0),
    referrals_received: String(r.referrals_received ?? 0),
    testimonials_requested: String(r.testimonials_requested ?? 0),
    testimonials_received: String(r.testimonials_received ?? 0),
    total_messages_sent: String(r.total_messages_sent ?? 0),
    total_calls_made: String(r.total_calls_made ?? 0),
    hours_in_client_work: String(r.hours_in_client_work ?? 0),
    main_blocker: r.main_blocker ?? '',
    waiting_on_team: r.waiting_on_team ?? '',
    escalated_why: r.escalated_why ?? '',
    wins_today: r.wins_today ?? '',
    focus_tomorrow: r.focus_tomorrow ?? '',
    capacity: r.capacity ?? 'Medium',
  }
}

const NUM_FIELDS: (keyof EditForm)[] = [
  'active_clients', 'checkins_completed', 'at_risk_identified', 'at_risk_recovered',
  'issues_reported', 'issues_resolved_same_day', 'follow_ups_sent', 'follow_ups_replied',
  'sessions_scheduled', 'sessions_completed', 'no_shows', 'rescheduled',
  'session_notes_filed', 'coach_flags_raised',
  'new_clients_started', 'welcome_calls_done', 'onboarding_steps_completed',
  'portal_access_verified', 'first_session_booked', 'onboarding_stuck', 'onboarding_completed_total',
  'lt_active_clients', 'lt_checkins', 'lt_upsell_conversations', 'lt_upsells_closed', 'lt_churn_requests',
  'graduates_contacted', 'graduates_responded', 'renewals_offered', 'renewals_closed',
  'referrals_asked', 'referrals_received', 'testimonials_requested', 'testimonials_received',
  'total_messages_sent', 'total_calls_made', 'hours_in_client_work',
]

function fieldLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\blt\b/g, 'LT')
    .replace(/\bcsm\b/g, 'CSM')
    .replace(/^(.)/, (m) => m.toUpperCase())
}

function EditModal({
  report,
  onClose,
  onSaved,
}: {
  report: DailyActivity
  onClose: () => void
  onSaved: (updated: DailyActivity) => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [form, setForm] = useState<EditForm>(() => activityToEditForm(report))
  const [saving, setSaving] = useState(false)

  function set<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const inputCls = 'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30 focus:border-[#ffbd59]'
  const labelCls = 'block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1'
  const sectionCls = 'text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2 mt-4 first:mt-0'

  async function handleSave() {
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        csm_name: form.csm_name,
        date: form.date,
        main_blocker: form.main_blocker || null,
        waiting_on_team: form.waiting_on_team || null,
        escalated_why: form.escalated_why || null,
        wins_today: form.wins_today || null,
        focus_tomorrow: form.focus_tomorrow || null,
        capacity: form.capacity || null,
      }
      for (const k of NUM_FIELDS) {
        payload[k] = parseInt(form[k]) || 0
      }

      const { data, error } = await supabase
        .from('csm_daily_activity')
        .update(payload)
        .eq('id', report.id)
        .select()
        .single()

      if (error) { toast.error(`Save failed: ${error.message}`); return }
      toast.success('Report updated')
      onSaved(data as DailyActivity)
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
        value={form[field]}
        onChange={(e) => set(field, e.target.value)}
        placeholder="0"
        className={inputCls}
      />
    )
  }

  const sections: { title: string; fields: (keyof EditForm)[] }[] = [
    {
      title: 'Client Management',
      fields: ['active_clients', 'checkins_completed', 'at_risk_identified', 'at_risk_recovered', 'issues_reported', 'issues_resolved_same_day', 'follow_ups_sent', 'follow_ups_replied'],
    },
    {
      title: 'Sessions',
      fields: ['sessions_scheduled', 'sessions_completed', 'no_shows', 'rescheduled', 'session_notes_filed', 'coach_flags_raised'],
    },
    {
      title: 'Onboarding',
      fields: ['new_clients_started', 'welcome_calls_done', 'onboarding_steps_completed', 'portal_access_verified', 'first_session_booked', 'onboarding_stuck', 'onboarding_completed_total'],
    },
    {
      title: 'Long-Term Clients',
      fields: ['lt_active_clients', 'lt_checkins', 'lt_upsell_conversations', 'lt_upsells_closed', 'lt_churn_requests'],
    },
    {
      title: 'Graduates & Renewals',
      fields: ['graduates_contacted', 'graduates_responded', 'renewals_offered', 'renewals_closed', 'referrals_asked', 'referrals_received', 'testimonials_requested', 'testimonials_received'],
    },
    {
      title: 'Volume',
      fields: ['total_messages_sent', 'total_calls_made', 'hours_in_client_work'],
    },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-zinc-200 dark:border-zinc-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 sticky top-0 bg-white dark:bg-zinc-900 z-10">
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Edit Report</p>
            <p className="text-xs text-zinc-400 mt-0.5">{report.csm_name} · {formatDate(report.date)}</p>
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
              <label className={labelCls}>CSM Name</label>
              <input type="text" value={form.csm_name} onChange={(e) => set('csm_name', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Date</label>
              <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Number field sections */}
          {sections.map((sec) => (
            <div key={sec.title}>
              <p className={sectionCls}>{sec.title}</p>
              <div className="grid grid-cols-2 gap-3">
                {sec.fields.map((f) => (
                  <div key={f}>
                    <label className={labelCls}>{fieldLabel(f)}</label>
                    <NumInput field={f} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Text fields */}
          <p className={sectionCls}>Blockers & Escalations</p>
          <div className="space-y-2">
            <div><label className={labelCls}>Main blocker</label><textarea value={form.main_blocker} onChange={(e) => set('main_blocker', e.target.value)} rows={2} className={cn(inputCls, 'resize-none')} /></div>
            <div><label className={labelCls}>Waiting on team</label><textarea value={form.waiting_on_team} onChange={(e) => set('waiting_on_team', e.target.value)} rows={2} className={cn(inputCls, 'resize-none')} /></div>
            <div><label className={labelCls}>Escalated — why</label><textarea value={form.escalated_why} onChange={(e) => set('escalated_why', e.target.value)} rows={2} className={cn(inputCls, 'resize-none')} /></div>
          </div>

          <p className={sectionCls}>Wrap-up</p>
          <div className="space-y-2">
            <div><label className={labelCls}>Wins today</label><textarea value={form.wins_today} onChange={(e) => set('wins_today', e.target.value)} rows={2} className={cn(inputCls, 'resize-none')} /></div>
            <div><label className={labelCls}>Focus tomorrow</label><textarea value={form.focus_tomorrow} onChange={(e) => set('focus_tomorrow', e.target.value)} rows={2} className={cn(inputCls, 'resize-none')} /></div>
          </div>

          {/* Capacity segmented control */}
          <div>
            <label className={labelCls}>Capacity</label>
            <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden mt-1">
              {['Low', 'Medium', 'High'].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => set('capacity', opt)}
                  className={cn(
                    'flex-1 px-3 py-2 text-xs font-medium transition-colors',
                    form.capacity === opt
                      ? opt === 'Low' ? 'bg-red-500 text-white'
                        : opt === 'Medium' ? 'bg-amber-400 text-white'
                        : 'bg-green-500 text-white'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
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
            {saving ? 'Saving...' : 'Save Changes'}
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

  const [reports, setReports] = useState<DailyActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState<Preset>('week')
  const [customFrom, setCustomFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().split('T')[0] })
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().split('T')[0])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingReport, setEditingReport] = useState<DailyActivity | null>(null)
  const [csmFilter, setCsmFilter] = useState<string>('all')
  const weekRange = useMemo(() => getCurrentWeekRange(), [])
  const [page, setPage] = useState(0)

  // Distinct CSM names for filter dropdown
  const csmNames = useMemo(() => {
    const names = Array.from(new Set(reports.map((r) => r.csm_name))).sort()
    return names
  }, [reports])

  // Filtered reports by CSM
  const filteredReports = useMemo(() => {
    if (csmFilter === 'all') return reports
    return reports.filter((r) => r.csm_name === csmFilter)
  }, [reports, csmFilter])

  async function handleDelete(id: string) {
    const { error } = await supabase.from('csm_daily_activity').delete().eq('id', id)
    if (error) { toast.error(`Delete failed: ${error.message}`); return }
    setReports((prev) => prev.filter((r) => r.id !== id))
    setExpandedId(null)
    toast.success('Report deleted')
  }

  const fetchReports = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('csm_daily_activity')
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
    if (filteredReports.length === 0) return null

    const atRiskIdentified = sum(filteredReports, 'at_risk_identified')
    const atRiskRecovered = sum(filteredReports, 'at_risk_recovered')
    const issuesReported = sum(filteredReports, 'issues_reported')
    const issuesResolved = sum(filteredReports, 'issues_resolved_same_day')
    const sessionsScheduled = sum(filteredReports, 'sessions_scheduled')
    const sessionsCompleted = sum(filteredReports, 'sessions_completed')
    const onboardingCompleted = sum(filteredReports, 'onboarding_completed_total')
    const newClientsStarted = sum(filteredReports, 'new_clients_started')
    const followUpsSent = sum(filteredReports, 'follow_ups_sent')
    const followUpsReplied = sum(filteredReports, 'follow_ups_replied')
    const renewalsOffered = sum(filteredReports, 'renewals_offered')
    const renewalsClosed = sum(filteredReports, 'renewals_closed')

    return {
      atRiskRecovery: pct(atRiskRecovered, atRiskIdentified),
      issueResolution: pct(issuesResolved, issuesReported),
      sessionShowRate: pct(sessionsCompleted, sessionsScheduled),
      onboardingCompletion: pct(onboardingCompleted, newClientsStarted),
      followUpReply: pct(followUpsReplied, followUpsSent),
      renewalClose: pct(renewalsClosed, renewalsOffered),
    }
  }, [filteredReports])

  // ── Pagination ──
  const totalPages = Math.ceil(filteredReports.length / PAGE_SIZE)
  const pageReports = filteredReports.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

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
            <button
              onClick={() => setActiveTab('dashboard')}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'dashboard'
                  ? 'border-[#ffbd59] text-[#ffbd59]'
                  : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:border-zinc-300'
              )}
            >
              Dashboard
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
        <PageHeader title="Client Success — Daily Activity" description={preset === 'week' ? `Current week: ${weekRange.label} (Fri → Thu)` : 'CSM daily activity dashboard'}>
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
            {/* CSM filter */}
            {csmNames.length > 1 && (
              <select
                value={csmFilter}
                onChange={(e) => { setCsmFilter(e.target.value); setPage(0) }}
                className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30"
              >
                <option value="all">All CSMs</option>
                {csmNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
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
              onClick={() => { const t = document.title; const r = getDateRange(preset, customFrom, customTo); document.title = `CSM Daily Activity — ${r ? r.from + ' to ' + r.to : 'All time'}`; window.print(); document.title = t }}
              className="no-print inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Export PDF
            </button>
          </div>
        </PageHeader>

        <div className="print-header">
          <img src="/logo.png" width="120" alt="HIC Parenting" />
          <h1 style={{ fontSize: '18px', marginTop: '8px', fontWeight: 600 }}>CSM Daily Activity — Performance Report</h1>
          <p style={{ fontSize: '12px', color: '#666' }}>Period: {(() => { const r = getDateRange(preset, customFrom, customTo); return r ? `${r.from} — ${r.to}` : 'All time' })()}</p>
          <p style={{ fontSize: '12px', color: '#666' }}>Generated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-24 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-xl" />
              ))}
            </div>
          </div>
        ) : filteredReports.length === 0 ? (
          <EmptyState
            title="No reports in this period"
            description="Create the first CSM daily activity report to see metrics here."
            icon={<Plus className="h-10 w-10" />}
          />
        ) : kpis && (
          <>
            {/* ── KPI Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
              <KpiCard
                label="At-Risk Recovery Rate"
                value={fmtPct(kpis.atRiskRecovery)}
                sub={`${sum(filteredReports, 'at_risk_recovered')} / ${sum(filteredReports, 'at_risk_identified')} recovered`}
                goal="Goal: >= 70%"
                barPct={isNaN(kpis.atRiskRecovery) ? 0 : (kpis.atRiskRecovery / 70) * 100}
                status={rateStatus(kpis.atRiskRecovery, 70)}
              />
              <KpiCard
                label="Issue Resolution Rate"
                value={fmtPct(kpis.issueResolution)}
                sub={`${sum(filteredReports, 'issues_resolved_same_day')} / ${sum(filteredReports, 'issues_reported')} resolved`}
                goal="Goal: >= 80%"
                barPct={isNaN(kpis.issueResolution) ? 0 : (kpis.issueResolution / 80) * 100}
                status={rateStatus(kpis.issueResolution, 80)}
              />
              <KpiCard
                label="Session Show Rate"
                value={fmtPct(kpis.sessionShowRate)}
                sub={`${sum(filteredReports, 'sessions_completed')} / ${sum(filteredReports, 'sessions_scheduled')} showed`}
                goal="Goal: >= 85%"
                barPct={isNaN(kpis.sessionShowRate) ? 0 : (kpis.sessionShowRate / 85) * 100}
                status={rateStatus(kpis.sessionShowRate, 85)}
              />
              <KpiCard
                label="Onboarding Completion"
                value={fmtPct(kpis.onboardingCompletion)}
                sub={`${sum(filteredReports, 'onboarding_completed_total')} / ${sum(filteredReports, 'new_clients_started')} completed`}
                goal="Goal: >= 90%"
                barPct={isNaN(kpis.onboardingCompletion) ? 0 : (kpis.onboardingCompletion / 90) * 100}
                status={rateStatus(kpis.onboardingCompletion, 90)}
              />
              <KpiCard
                label="Follow-Up Reply Rate"
                value={fmtPct(kpis.followUpReply)}
                sub={`${sum(filteredReports, 'follow_ups_replied')} / ${sum(filteredReports, 'follow_ups_sent')} replied`}
                goal="Goal: >= 40%"
                barPct={isNaN(kpis.followUpReply) ? 0 : (kpis.followUpReply / 40) * 100}
                status={rateStatus(kpis.followUpReply, 40)}
              />
              <KpiCard
                label="Renewal Close Rate"
                value={fmtPct(kpis.renewalClose)}
                sub={`${sum(filteredReports, 'renewals_closed')} / ${sum(filteredReports, 'renewals_offered')} closed`}
                goal="Goal: >= 30%"
                barPct={isNaN(kpis.renewalClose) ? 0 : (kpis.renewalClose / 30) * 100}
                status={rateStatus(kpis.renewalClose, 30)}
              />
            </div>

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
                        {['', 'Date', 'CSM', 'At-Risk Recovery %', 'Issues Resolved %', 'Cases Escalated', 'New Clients', 'Capacity'].map((h, i) => (
                          <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {pageReports.map((r) => {
                        const recovery = pct(r.at_risk_recovered, r.at_risk_identified)
                        const resolution = pct(r.issues_resolved_same_day, r.issues_reported)
                        const isOpen = expandedId === r.id
                        const hasEscalation = r.escalated_why !== null && r.escalated_why !== ''
                        const capKey = (r.capacity ?? '').toLowerCase()

                        return (
                          <Fragment key={r.id}>
                            <motion.tr
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
                              <td className="px-4 py-3 text-sm font-medium text-zinc-800 dark:text-zinc-200 whitespace-nowrap">{r.csm_name}</td>
                              <td className="px-4 py-3">
                                <span className={cn('inline-flex px-1.5 py-0.5 rounded text-xs font-semibold', CELL_BG[rateStatus(recovery, 70)])}>
                                  {fmtPct(recovery)}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={cn('inline-flex px-1.5 py-0.5 rounded text-xs font-semibold', CELL_BG[rateStatus(resolution, 80)])}>
                                  {fmtPct(resolution)}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400">
                                {hasEscalation ? (
                                  <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-semibold bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300">Yes</span>
                                ) : '—'}
                              </td>
                              <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400">{r.new_clients_started}</td>
                              <td className="px-4 py-3">
                                {r.capacity ? (
                                  <span className={cn('inline-flex px-1.5 py-0.5 rounded text-xs font-semibold', CAPACITY_BADGE[capKey] ?? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400')}>
                                    {r.capacity}
                                  </span>
                                ) : '—'}
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
                                  <td colSpan={8} className="p-0">
                                    <ReportDetail
                                      report={r}
                                      onEdit={() => setEditingReport(r)}
                                      onDelete={() => handleDelete(r.id)}
                                    />
                                  </td>
                                </motion.tr>
                              )}
                            </AnimatePresence>
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100 dark:border-zinc-800">
                    <p className="text-xs text-zinc-400">
                      {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredReports.length)} of {filteredReports.length}
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
