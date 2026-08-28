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
  active_coaching_clients: number
  followups_completed: number
  contacted_after_noshow: number
  at_risk_contacted: number
  at_risk_recovered: number
  issues_received: number
  issues_resolved_direct: number
  cases_escalated: number
  // Section 2 — Sessions
  sessions_scheduled: number
  sessions_rescheduled: number
  session_reminders_sent: number
  qa_reminders_sent: number
  coach_coordination_count: number
  weekly_slides_sent: number
  // Section 3 — Onboarding
  new_clients_received: number
  welcome_messages_sent: number
  contracts_created: number
  clients_added_ghl_kajabi: number
  coach_matches_completed: number
  first_sessions_scheduled: number
  access_issues_resolved: number
  // Section 4 — Long-Term Clients
  lt_conversations: number
  lt_followups: number
  lt_issues_resolved: number
  lt_engagement_convos: number
  lt_upgrade_opportunities: number
  // Section 5 — Graduates & Retention
  grad_approaching_contacted: number
  family_manifestos_sent: number
  clients_invited_record: number
  recordings_scheduled: number
  recordings_completed: number
  grad_nurturing_convos: number
  referred_to_grad_program: number
  continuation_opportunities: number
  // Section 6 — Volume
  total_conversations: number
  total_followups: number
  total_operational_tasks: number
  // Section 7 — Workload & Tasks
  at_risk_identified: number
  follow_ups_due: number
  hours_worked: number
  fte: number
  estimated_max_workload: number
  tasks_due_today: number
  tasks_completed_today: number
  tasks_carried_over: number
  tasks_overdue: number
  // Section 8 — Blockers
  main_blocker: string | null
  waiting_on_team: string | null
  escalated_why: string | null
  // Section 9 — Wrap-up
  pending_tasks_tomorrow: string | null
  clients_attention_tomorrow: string | null
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
  label, value, sub, status, goal, barPct, breakdowns,
}: {
  label: string
  value: string
  sub?: string
  status: 'good' | 'warn' | 'alert'
  goal?: string
  barPct: number
  breakdowns?: { label: string; value: string | number }[]
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
      {breakdowns && breakdowns.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-1 border-t border-zinc-100 dark:border-zinc-800">
          {breakdowns.map((b, i) => (
            <span key={i} className="text-[10px] text-zinc-400 dark:text-zinc-500">
              <span className="font-semibold text-zinc-500 dark:text-zinc-400">{b.value}</span>{' '}{b.label}
            </span>
          ))}
        </div>
      )}
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
          <Row label="Active coaching clients" value={report.active_coaching_clients} />
          <Row label="Follow-ups due" value={report.follow_ups_due} />
          <Row label="Follow-ups completed" value={report.followups_completed} />
          <Row label="Contacted after no-show" value={report.contacted_after_noshow} />
          <Row label="At-risk identified" value={report.at_risk_identified} />
          <Row label="At-risk contacted" value={report.at_risk_contacted} />
          <Row label="At-risk recovered" value={report.at_risk_recovered} />
          <Row label="Issues received" value={report.issues_received} />
          <Row label="Issues resolved direct" value={report.issues_resolved_direct} />
          <Row label="Cases escalated" value={report.cases_escalated} />

          <p className={subLabel}>Sessions & Coaching</p>
          <Row label="Sessions scheduled" value={report.sessions_scheduled} />
          <Row label="Sessions rescheduled" value={report.sessions_rescheduled} />
          <Row label="Session reminders sent" value={report.session_reminders_sent} />
          <Row label="QA reminders sent" value={report.qa_reminders_sent} />
          <Row label="Coach coordination count" value={report.coach_coordination_count} />
          <Row label="Weekly slides sent" value={report.weekly_slides_sent} />

          <p className={subLabel}>Onboarding</p>
          <Row label="New clients received" value={report.new_clients_received} />
          <Row label="Welcome messages sent" value={report.welcome_messages_sent} />
          <Row label="Contracts created" value={report.contracts_created} />
          <Row label="Clients added GHL/Kajabi" value={report.clients_added_ghl_kajabi} />
          <Row label="Coach matches completed" value={report.coach_matches_completed} />
          <Row label="First sessions scheduled" value={report.first_sessions_scheduled} />
          <Row label="Access issues resolved" value={report.access_issues_resolved} />
        </div>

        {/* Right column */}
        <div>
          <p className={subLabel}>Long-Term Clients</p>
          <Row label="LT conversations" value={report.lt_conversations} />
          <Row label="LT follow-ups" value={report.lt_followups} />
          <Row label="LT issues resolved" value={report.lt_issues_resolved} />
          <Row label="LT engagement convos" value={report.lt_engagement_convos} />
          <Row label="LT upgrade opportunities" value={report.lt_upgrade_opportunities} />

          <p className={subLabel}>Graduates & Retention</p>
          <Row label="Grad approaching contacted" value={report.grad_approaching_contacted} />
          <Row label="Family manifestos sent" value={report.family_manifestos_sent} />
          <Row label="Clients invited to record" value={report.clients_invited_record} />
          <Row label="Recordings scheduled" value={report.recordings_scheduled} />
          <Row label="Recordings completed" value={report.recordings_completed} />
          <Row label="Grad nurturing convos" value={report.grad_nurturing_convos} />
          <Row label="Referred to grad program" value={report.referred_to_grad_program} />
          <Row label="Continuation opportunities" value={report.continuation_opportunities} />

          <p className={subLabel}>Volume</p>
          <Row label="Total conversations" value={report.total_conversations} />
          <Row label="Total follow-ups" value={report.total_followups} />
          <Row label="Total operational tasks" value={report.total_operational_tasks} />

          <p className={subLabel}>Blockers & Escalations</p>
          <Row label="Main blocker" value={report.main_blocker} />
          <Row label="Waiting on team" value={report.waiting_on_team} />
          <Row label="Escalated — why" value={report.escalated_why} />

          <p className={subLabel}>Workload & Tasks</p>
          <Row label="Hours worked" value={report.hours_worked} />
          <Row label="FTE" value={report.fte} />
          <Row label="Estimated max workload" value={report.estimated_max_workload} />
          <Row label="Tasks due today" value={report.tasks_due_today} />
          <Row label="Tasks completed today" value={report.tasks_completed_today} />
          <Row label="Tasks carried over" value={report.tasks_carried_over} />
          <Row label="Tasks overdue" value={report.tasks_overdue} />

          <p className={subLabel}>Wrap-up</p>
          <Row label="Pending tasks tomorrow" value={report.pending_tasks_tomorrow} />
          <Row label="Clients needing attention tomorrow" value={report.clients_attention_tomorrow} />
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
  active_coaching_clients: string
  followups_completed: string
  contacted_after_noshow: string
  at_risk_contacted: string
  at_risk_recovered: string
  issues_received: string
  issues_resolved_direct: string
  cases_escalated: string
  sessions_scheduled: string
  sessions_rescheduled: string
  session_reminders_sent: string
  qa_reminders_sent: string
  coach_coordination_count: string
  weekly_slides_sent: string
  new_clients_received: string
  welcome_messages_sent: string
  contracts_created: string
  clients_added_ghl_kajabi: string
  coach_matches_completed: string
  first_sessions_scheduled: string
  access_issues_resolved: string
  lt_conversations: string
  lt_followups: string
  lt_issues_resolved: string
  lt_engagement_convos: string
  lt_upgrade_opportunities: string
  grad_approaching_contacted: string
  family_manifestos_sent: string
  clients_invited_record: string
  recordings_scheduled: string
  recordings_completed: string
  grad_nurturing_convos: string
  referred_to_grad_program: string
  continuation_opportunities: string
  total_conversations: string
  total_followups: string
  total_operational_tasks: string
  at_risk_identified: string
  follow_ups_due: string
  hours_worked: string
  fte: string
  estimated_max_workload: string
  tasks_due_today: string
  tasks_completed_today: string
  tasks_carried_over: string
  tasks_overdue: string
  main_blocker: string
  waiting_on_team: string
  escalated_why: string
  pending_tasks_tomorrow: string
  clients_attention_tomorrow: string
  capacity: string
}

function activityToEditForm(r: DailyActivity): EditForm {
  return {
    csm_name: r.csm_name,
    date: r.date,
    active_coaching_clients: String(r.active_coaching_clients ?? 0),
    followups_completed: String(r.followups_completed ?? 0),
    contacted_after_noshow: String(r.contacted_after_noshow ?? 0),
    at_risk_contacted: String(r.at_risk_contacted ?? 0),
    at_risk_recovered: String(r.at_risk_recovered ?? 0),
    issues_received: String(r.issues_received ?? 0),
    issues_resolved_direct: String(r.issues_resolved_direct ?? 0),
    cases_escalated: String(r.cases_escalated ?? 0),
    sessions_scheduled: String(r.sessions_scheduled ?? 0),
    sessions_rescheduled: String(r.sessions_rescheduled ?? 0),
    session_reminders_sent: String(r.session_reminders_sent ?? 0),
    qa_reminders_sent: String(r.qa_reminders_sent ?? 0),
    coach_coordination_count: String(r.coach_coordination_count ?? 0),
    weekly_slides_sent: String(r.weekly_slides_sent ?? 0),
    new_clients_received: String(r.new_clients_received ?? 0),
    welcome_messages_sent: String(r.welcome_messages_sent ?? 0),
    contracts_created: String(r.contracts_created ?? 0),
    clients_added_ghl_kajabi: String(r.clients_added_ghl_kajabi ?? 0),
    coach_matches_completed: String(r.coach_matches_completed ?? 0),
    first_sessions_scheduled: String(r.first_sessions_scheduled ?? 0),
    access_issues_resolved: String(r.access_issues_resolved ?? 0),
    lt_conversations: String(r.lt_conversations ?? 0),
    lt_followups: String(r.lt_followups ?? 0),
    lt_issues_resolved: String(r.lt_issues_resolved ?? 0),
    lt_engagement_convos: String(r.lt_engagement_convos ?? 0),
    lt_upgrade_opportunities: String(r.lt_upgrade_opportunities ?? 0),
    grad_approaching_contacted: String(r.grad_approaching_contacted ?? 0),
    family_manifestos_sent: String(r.family_manifestos_sent ?? 0),
    clients_invited_record: String(r.clients_invited_record ?? 0),
    recordings_scheduled: String(r.recordings_scheduled ?? 0),
    recordings_completed: String(r.recordings_completed ?? 0),
    grad_nurturing_convos: String(r.grad_nurturing_convos ?? 0),
    referred_to_grad_program: String(r.referred_to_grad_program ?? 0),
    continuation_opportunities: String(r.continuation_opportunities ?? 0),
    total_conversations: String(r.total_conversations ?? 0),
    total_followups: String(r.total_followups ?? 0),
    total_operational_tasks: String(r.total_operational_tasks ?? 0),
    at_risk_identified: String(r.at_risk_identified ?? 0),
    follow_ups_due: String(r.follow_ups_due ?? 0),
    hours_worked: String(r.hours_worked ?? 0),
    fte: String(r.fte ?? 0),
    estimated_max_workload: String(r.estimated_max_workload ?? 0),
    tasks_due_today: String(r.tasks_due_today ?? 0),
    tasks_completed_today: String(r.tasks_completed_today ?? 0),
    tasks_carried_over: String(r.tasks_carried_over ?? 0),
    tasks_overdue: String(r.tasks_overdue ?? 0),
    main_blocker: r.main_blocker ?? '',
    waiting_on_team: r.waiting_on_team ?? '',
    escalated_why: r.escalated_why ?? '',
    pending_tasks_tomorrow: r.pending_tasks_tomorrow ?? '',
    clients_attention_tomorrow: r.clients_attention_tomorrow ?? '',
    capacity: r.capacity ?? 'Medium',
  }
}

const NUM_FIELDS: (keyof EditForm)[] = [
  'active_coaching_clients', 'followups_completed', 'contacted_after_noshow',
  'at_risk_contacted', 'at_risk_recovered', 'at_risk_identified',
  'issues_received', 'issues_resolved_direct', 'cases_escalated',
  'follow_ups_due',
  'sessions_scheduled', 'sessions_rescheduled', 'session_reminders_sent',
  'qa_reminders_sent', 'coach_coordination_count', 'weekly_slides_sent',
  'new_clients_received', 'welcome_messages_sent', 'contracts_created',
  'clients_added_ghl_kajabi', 'coach_matches_completed', 'first_sessions_scheduled', 'access_issues_resolved',
  'lt_conversations', 'lt_followups', 'lt_issues_resolved', 'lt_engagement_convos', 'lt_upgrade_opportunities',
  'grad_approaching_contacted', 'family_manifestos_sent', 'clients_invited_record',
  'recordings_scheduled', 'recordings_completed', 'grad_nurturing_convos',
  'referred_to_grad_program', 'continuation_opportunities',
  'total_conversations', 'total_followups', 'total_operational_tasks',
  'estimated_max_workload',
  'tasks_due_today', 'tasks_completed_today', 'tasks_carried_over', 'tasks_overdue',
]

const DECIMAL_FIELDS: (keyof EditForm)[] = ['hours_worked', 'fte']

function fieldLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\blt\b/g, 'LT')
    .replace(/\bcsm\b/g, 'CSM')
    .replace(/\bghl\b/g, 'GHL')
    .replace(/\bqa\b/g, 'QA')
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
    // Validation: cases_escalated cannot exceed issues_received
    const escalated = parseInt(form.cases_escalated) || 0
    const received = parseInt(form.issues_received) || 0
    if (escalated > received) {
      toast.error('Cases Escalated cannot be greater than Issues Received')
      return
    }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        csm_name: form.csm_name,
        date: form.date,
        main_blocker: form.main_blocker || null,
        waiting_on_team: form.waiting_on_team || null,
        escalated_why: form.escalated_why || null,
        pending_tasks_tomorrow: form.pending_tasks_tomorrow || null,
        clients_attention_tomorrow: form.clients_attention_tomorrow || null,
        capacity: form.capacity || null,
      }
      for (const k of NUM_FIELDS) {
        payload[k] = parseInt(form[k]) || 0
      }
      for (const k of DECIMAL_FIELDS) {
        payload[k] = parseFloat(form[k]) || 0
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

  const sections: { title: string; fields: (keyof EditForm)[]; decimalFields?: (keyof EditForm)[] }[] = [
    {
      title: 'Client Management',
      fields: ['active_coaching_clients', 'follow_ups_due', 'followups_completed', 'contacted_after_noshow', 'at_risk_identified', 'at_risk_contacted', 'at_risk_recovered', 'issues_received', 'issues_resolved_direct', 'cases_escalated'],
    },
    {
      title: 'Sessions & Coaching',
      fields: ['sessions_scheduled', 'sessions_rescheduled', 'session_reminders_sent', 'qa_reminders_sent', 'coach_coordination_count', 'weekly_slides_sent'],
    },
    {
      title: 'Onboarding',
      fields: ['new_clients_received', 'welcome_messages_sent', 'contracts_created', 'clients_added_ghl_kajabi', 'coach_matches_completed', 'first_sessions_scheduled', 'access_issues_resolved'],
    },
    {
      title: 'Long-Term Clients',
      fields: ['lt_conversations', 'lt_followups', 'lt_issues_resolved', 'lt_engagement_convos', 'lt_upgrade_opportunities'],
    },
    {
      title: 'Graduates & Retention',
      fields: ['grad_approaching_contacted', 'family_manifestos_sent', 'clients_invited_record', 'recordings_scheduled', 'recordings_completed', 'grad_nurturing_convos', 'referred_to_grad_program', 'continuation_opportunities'],
    },
    {
      title: 'Volume',
      fields: ['total_conversations', 'total_followups', 'total_operational_tasks'],
    },
    {
      title: 'Workload & Tasks',
      fields: ['estimated_max_workload', 'tasks_due_today', 'tasks_completed_today', 'tasks_carried_over', 'tasks_overdue'],
      decimalFields: ['hours_worked', 'fte'],
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
                {sec.decimalFields?.map((f) => (
                  <div key={f}>
                    <label className={labelCls}>{fieldLabel(f)}</label>
                    <input
                      type="number"
                      min={0}
                      step={f === 'fte' ? 0.1 : 0.5}
                      value={form[f]}
                      onChange={(e) => set(f, e.target.value)}
                      placeholder="0"
                      className={inputCls}
                    />
                  </div>
                ))}
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
            <div><label className={labelCls}>Pending tasks tomorrow</label><textarea value={form.pending_tasks_tomorrow} onChange={(e) => set('pending_tasks_tomorrow', e.target.value)} rows={2} className={cn(inputCls, 'resize-none')} /></div>
            <div><label className={labelCls}>Clients needing attention tomorrow</label><textarea value={form.clients_attention_tomorrow} onChange={(e) => set('clients_attention_tomorrow', e.target.value)} rows={2} className={cn(inputCls, 'resize-none')} /></div>
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
  const [slaThreshold, setSlaThreshold] = useState(2) // days
  const [allStudents, setAllStudents] = useState<{ status: string; last_contacted_at: string | null; created_at: string; updated_at: string }[]>([])
  const [pipelineRecords, setPipelineRecords] = useState<{ enrollment_date: string | null; step6_status: string; step6_date: string | null; current_step: number }[]>([])
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

  // Fetch auto-calc data (students + pipeline) once on mount
  const fetchAutoCalcData = useCallback(async () => {
    const [studentsRes, pipelineRes] = await Promise.all([
      supabase.from('pwu_students').select('status, last_contacted_at, created_at, updated_at'),
      supabase.from('onboarding_pipeline').select('enrollment_date, step6_status, step6_date, current_step'),
    ])
    if (studentsRes.data) setAllStudents(studentsRes.data)
    if (pipelineRes.data) setPipelineRecords(pipelineRes.data)
  }, [supabase])

  useEffect(() => { fetchAutoCalcData() }, [fetchAutoCalcData])

  // ── Aggregated KPIs from daily reports ──
  const kpis = useMemo(() => {
    if (filteredReports.length === 0) return null

    const atRiskContacted = sum(filteredReports, 'at_risk_contacted')
    const atRiskRecovered = sum(filteredReports, 'at_risk_recovered')
    const atRiskIdentified = sum(filteredReports, 'at_risk_identified')
    const issuesReceived = sum(filteredReports, 'issues_received')
    const issuesResolved = sum(filteredReports, 'issues_resolved_direct')
    const casesEscalated = sum(filteredReports, 'cases_escalated')
    const sessionsScheduled = sum(filteredReports, 'sessions_scheduled')
    const sessionsRescheduled = sum(filteredReports, 'sessions_rescheduled')
    const newClientsReceived = sum(filteredReports, 'new_clients_received')
    const coachMatchesCompleted = sum(filteredReports, 'coach_matches_completed')
    const followupsCompleted = sum(filteredReports, 'followups_completed')
    const followUpsDue = sum(filteredReports, 'follow_ups_due')
    const totalConversations = sum(filteredReports, 'total_conversations')
    const hoursWorked = filteredReports.reduce((s, r) => s + (Number(r.hours_worked) || 0), 0)
    const tasksDueToday = sum(filteredReports, 'tasks_due_today')
    const tasksCompletedToday = sum(filteredReports, 'tasks_completed_today')
    const tasksCarriedOver = sum(filteredReports, 'tasks_carried_over')
    const tasksOverdue = sum(filteredReports, 'tasks_overdue')

    // Snapshot fields: use most recent report
    const latest = filteredReports[0] // already sorted desc by date
    const fte = Number(latest?.fte) || 0
    const estimatedMaxWorkload = Number(latest?.estimated_max_workload) || 0

    // Meaningful actions: direct client work + onboarding actions + coordination
    const meaningfulActions = followupsCompleted + atRiskContacted + issuesResolved
      + sum(filteredReports, 'welcome_messages_sent')
      + coachMatchesCompleted
      + sum(filteredReports, 'first_sessions_scheduled')
      + sum(filteredReports, 'coach_coordination_count')

    return {
      atRiskRecovery: pct(atRiskRecovered, atRiskContacted),
      issueResolution: pct(issuesResolved, issuesReceived),
      coachMatchRate: pct(coachMatchesCompleted, newClientsReceived),
      followUpCompletion: pct(followupsCompleted, followUpsDue),
      atRiskContact: pct(atRiskContacted, atRiskIdentified),
      directResolution: pct(issuesResolved, issuesReceived),
      escalationRate: pct(casesEscalated, issuesReceived),
      taskCompletion: pct(tasksCompletedToday, tasksDueToday),
      atRiskContacted, atRiskRecovered, atRiskIdentified,
      issuesReceived, issuesResolved, casesEscalated,
      newClientsReceived, coachMatchesCompleted,
      followupsCompleted, followUpsDue,
      totalConversations,
      sessionsScheduled, sessionsRescheduled,
      hoursWorked, fte, estimatedMaxWorkload,
      meaningfulActions,
      tasksDueToday, tasksCompletedToday, tasksCarriedOver, tasksOverdue,
    }
  }, [filteredReports])

  // ── Auto-calculated KPIs from pwu_students + onboarding_pipeline ──
  const autoKpis = useMemo(() => {
    const now = new Date()
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(now.getDate() - 7)

    // Client Coverage %
    const activeStudents = allStudents.filter((s) => s.status === 'active')
    const totalActive = activeStudents.length
    const actioned = activeStudents.filter((s) => {
      if (!s.last_contacted_at) return false
      return new Date(s.last_contacted_at) >= sevenDaysAgo
    }).length
    const requiringAction = totalActive - actioned
    const coverage = pct(actioned, totalActive)

    // Retention / Churn % (period-based)
    const range = getDateRange(preset, customFrom, customTo)
    const periodStart = range ? range.from : '1970-01-01'
    const periodEnd = range ? range.to : new Date().toISOString().split('T')[0]
    const periodEndDate = new Date(periodEnd + 'T23:59:59')
    const periodStartDate = new Date(periodStart)

    // Starting active ≈ currently active created before period + those who churned during period (for better approximation)
    const churnedInPeriod = allStudents.filter((s) =>
      s.status === 'refund'
      && new Date(s.created_at) < periodStartDate
      && new Date(s.updated_at) >= periodStartDate
      && new Date(s.updated_at) <= periodEndDate
    )
    const activeBeforePeriod = activeStudents.filter((s) => new Date(s.created_at) < periodStartDate)
    const startingActive = activeBeforePeriod.length + churnedInPeriod.length
    const churned = churnedInPeriod.length
    const retained = startingActive - churned
    const retention = pct(retained, startingActive)
    const churn = pct(churned, startingActive)

    // Onboarding SLA %
    const pipelineInPeriod = pipelineRecords.filter((p) => {
      if (!p.enrollment_date) return false
      const ed = new Date(p.enrollment_date)
      return ed >= periodStartDate && ed <= periodEndDate
    })
    const newPipelineClients = pipelineInPeriod.length
    const fullyOnboarded = pipelineInPeriod.filter((p) => p.step6_status === 'completed')
    const withinSla = fullyOnboarded.filter((p) => {
      if (!p.step6_date || !p.enrollment_date) return false
      const diff = (new Date(p.step6_date).getTime() - new Date(p.enrollment_date).getTime()) / (1000 * 60 * 60 * 24)
      return diff <= slaThreshold
    })
    // SLA % uses only completed onboardings as denominator — pending students are excluded from both numerator and denominator
    const onboardingSla = pct(withinSla.length, fullyOnboarded.length)

    // Average completion time (days)
    let avgCompletionDays = NaN
    if (fullyOnboarded.length > 0) {
      const totalDays = fullyOnboarded.reduce((acc, p) => {
        if (!p.step6_date || !p.enrollment_date) return acc
        const diff = (new Date(p.step6_date).getTime() - new Date(p.enrollment_date).getTime()) / (1000 * 60 * 60 * 24)
        return acc + diff
      }, 0)
      avgCompletionDays = totalDays / fullyOnboarded.length
    }
    const pendingOnboarding = newPipelineClients - fullyOnboarded.length

    return {
      totalActive, actioned, requiringAction, coverage,
      startingActive, retained, churned, retention, churn,
      newPipelineClients, fullyOnboarded: fullyOnboarded.length,
      withinSla: withinSla.length, onboardingSla,
      avgCompletionDays, pendingOnboarding,
    }
  }, [allStudents, pipelineRecords, preset, customFrom, customTo, slaThreshold])

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
            {/* SLA threshold */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-zinc-400 font-medium whitespace-nowrap">SLA</span>
              <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden">
                {[1, 2, 3].map((d) => (
                  <button
                    key={d}
                    onClick={() => setSlaThreshold(d)}
                    className={cn(
                      'px-2 py-1.5 text-xs font-medium transition-colors',
                      slaThreshold === d
                        ? 'bg-[#ffbd59] text-[#1a1a2e]'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                    )}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
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
            {/* ── Primary KPI Dashboard ── */}
            <div className="mb-2">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">KPI Dashboard</p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              {/* 1. Client Coverage % */}
              <KpiCard
                label="Client Coverage %"
                value={fmtPct(autoKpis.coverage)}
                goal="Last 7 days"
                barPct={isNaN(autoKpis.coverage) ? 0 : autoKpis.coverage}
                status={rateStatus(autoKpis.coverage, 85)}
                breakdowns={[
                  { label: 'assigned', value: autoKpis.totalActive },
                  { label: 'actioned', value: autoKpis.actioned },
                  { label: 'need action', value: autoKpis.requiringAction },
                ]}
              />
              {/* 2. Follow-up Completion % */}
              <KpiCard
                label="Follow-up Completion %"
                value={fmtPct(kpis.followUpCompletion)}
                goal="Goal: >= 90%"
                barPct={isNaN(kpis.followUpCompletion) ? 0 : (kpis.followUpCompletion / 90) * 100}
                status={rateStatus(kpis.followUpCompletion, 90)}
                breakdowns={[
                  { label: 'due', value: kpis.followUpsDue },
                  { label: 'completed', value: kpis.followupsCompleted },
                  { label: 'overdue', value: Math.max(0, kpis.followUpsDue - kpis.followupsCompleted) },
                ]}
              />
              {/* 3. At-Risk Contact % */}
              <KpiCard
                label="At-Risk Contact %"
                value={fmtPct(kpis.atRiskContact)}
                goal="Goal: >= 90%"
                barPct={isNaN(kpis.atRiskContact) ? 0 : (kpis.atRiskContact / 90) * 100}
                status={rateStatus(kpis.atRiskContact, 90)}
                breakdowns={[
                  { label: 'identified', value: kpis.atRiskIdentified },
                  { label: 'contacted', value: kpis.atRiskContacted },
                  { label: 'not contacted', value: Math.max(0, kpis.atRiskIdentified - kpis.atRiskContacted) },
                ]}
              />
              {/* 4. At-Risk Recovery % */}
              <KpiCard
                label="At-Risk Recovery %"
                value={fmtPct(kpis.atRiskRecovery)}
                goal="Goal: >= 70%"
                barPct={isNaN(kpis.atRiskRecovery) ? 0 : (kpis.atRiskRecovery / 70) * 100}
                status={rateStatus(kpis.atRiskRecovery, 70)}
                breakdowns={[
                  { label: 'contacted', value: kpis.atRiskContacted },
                  { label: 'recovered', value: kpis.atRiskRecovered },
                  { label: 'still at risk', value: Math.max(0, kpis.atRiskContacted - kpis.atRiskRecovered) },
                ]}
              />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              {/* 5. Onboarding SLA % */}
              <KpiCard
                label={`Onboarding SLA % (≤${slaThreshold}d)`}
                value={fmtPct(autoKpis.onboardingSla)}
                goal={`SLA: ${slaThreshold} day${slaThreshold > 1 ? 's' : ''}`}
                barPct={isNaN(autoKpis.onboardingSla) ? 0 : autoKpis.onboardingSla}
                status={rateStatus(autoKpis.onboardingSla, 80)}
                breakdowns={[
                  { label: 'new', value: autoKpis.newPipelineClients },
                  { label: 'within SLA', value: autoKpis.withinSla },
                  { label: 'pending', value: autoKpis.pendingOnboarding },
                  { label: 'avg days', value: isNaN(autoKpis.avgCompletionDays) ? '—' : autoKpis.avgCompletionDays.toFixed(1) },
                ]}
              />
              {/* 6. Direct Resolution % + Escalation Rate */}
              <KpiCard
                label="Direct Resolution %"
                value={fmtPct(kpis.directResolution)}
                sub={`Escalation: ${fmtPct(kpis.escalationRate)}`}
                goal="Goal: >= 80%"
                barPct={isNaN(kpis.directResolution) ? 0 : (kpis.directResolution / 80) * 100}
                status={rateStatus(kpis.directResolution, 80)}
                breakdowns={[
                  { label: 'received', value: kpis.issuesReceived },
                  { label: 'resolved', value: kpis.issuesResolved },
                  { label: 'escalated', value: kpis.casesEscalated },
                ]}
              />
              {/* 7. Retention % / Churn % */}
              <KpiCard
                label="Retention %"
                value={fmtPct(autoKpis.retention)}
                sub={`Churn: ${fmtPct(autoKpis.churn)}`}
                goal="Goal: >= 90%"
                barPct={isNaN(autoKpis.retention) ? 0 : (autoKpis.retention / 90) * 100}
                status={rateStatus(autoKpis.retention, 90)}
                breakdowns={[
                  { label: 'starting', value: autoKpis.startingActive },
                  { label: 'retained', value: autoKpis.retained },
                  { label: 'churned', value: autoKpis.churned },
                ]}
              />
              {/* 8. Clients per FTE */}
              <KpiCard
                label="Clients per FTE"
                value={kpis.fte > 0 ? (autoKpis.totalActive / kpis.fte).toFixed(1) : '—'}
                barPct={100}
                status="good"
                breakdowns={[
                  { label: 'clients', value: autoKpis.totalActive },
                  { label: 'FTE', value: kpis.fte },
                ]}
              />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {/* 9. Meaningful Actions per Work Hour */}
              <KpiCard
                label="Actions / Work Hour"
                value={kpis.hoursWorked > 0 ? (kpis.meaningfulActions / kpis.hoursWorked).toFixed(1) : '—'}
                barPct={100}
                status="good"
                breakdowns={[
                  { label: 'actions', value: kpis.meaningfulActions },
                  { label: 'hours', value: kpis.hoursWorked.toFixed(1) },
                ]}
              />
              {/* 10. Avg Time per Client */}
              <KpiCard
                label="Avg Time per Client"
                value={kpis.hoursWorked > 0 && autoKpis.totalActive > 0 ? `${(kpis.hoursWorked / autoKpis.totalActive).toFixed(1)}h` : '—'}
                barPct={100}
                status="good"
                breakdowns={[
                  { label: 'hours', value: kpis.hoursWorked.toFixed(1) },
                  { label: 'clients', value: autoKpis.totalActive },
                ]}
              />
              {/* 11. Capacity Utilization % */}
              {(() => {
                const utilization = kpis.estimatedMaxWorkload > 0 ? pct(autoKpis.totalActive, kpis.estimatedMaxWorkload) : NaN
                const additionalCapacity = Math.max(0, kpis.estimatedMaxWorkload - autoKpis.totalActive)
                return (
                  <KpiCard
                    label="Capacity Utilization %"
                    value={fmtPct(utilization)}
                    barPct={isNaN(utilization) ? 0 : utilization}
                    status={isNaN(utilization) ? 'alert' : utilization <= 85 ? 'good' : utilization <= 95 ? 'warn' : 'alert'}
                    breakdowns={[
                      { label: 'current', value: autoKpis.totalActive },
                      { label: 'max', value: kpis.estimatedMaxWorkload },
                      { label: 'available', value: additionalCapacity },
                    ]}
                  />
                )
              })()}
              {/* 12. Daily Task Completion % */}
              <KpiCard
                label="Task Completion %"
                value={fmtPct(kpis.taskCompletion)}
                goal="Goal: >= 85%"
                barPct={isNaN(kpis.taskCompletion) ? 0 : (kpis.taskCompletion / 85) * 100}
                status={rateStatus(kpis.taskCompletion, 85)}
                breakdowns={[
                  { label: 'due', value: kpis.tasksDueToday },
                  { label: 'completed', value: kpis.tasksCompletedToday },
                  { label: 'carried', value: kpis.tasksCarriedOver },
                  { label: 'overdue', value: kpis.tasksOverdue },
                ]}
              />
            </div>

            {/* ── Operational Metrics (secondary) ── */}
            <div className="mb-2">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">Operational Metrics</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <KpiCard
                label="Coach Match Rate"
                value={fmtPct(kpis.coachMatchRate)}
                sub={`${kpis.coachMatchesCompleted} / ${kpis.newClientsReceived} matched`}
                goal="Goal: >= 90%"
                barPct={isNaN(kpis.coachMatchRate) ? 0 : (kpis.coachMatchRate / 90) * 100}
                status={rateStatus(kpis.coachMatchRate, 90)}
              />
              <KpiCard
                label="Follow-ups Completed"
                value={String(kpis.followupsCompleted)}
                sub={`${filteredReports.length} reports`}
                barPct={100}
                status="good"
              />
              <KpiCard
                label="Total Conversations"
                value={String(kpis.totalConversations)}
                sub={`${filteredReports.length} reports`}
                barPct={100}
                status="good"
              />
              <KpiCard
                label="Sessions Scheduled"
                value={String(kpis.sessionsScheduled)}
                sub={`${kpis.sessionsRescheduled} rescheduled`}
                barPct={100}
                status="good"
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
                        const recovery = pct(r.at_risk_recovered, r.at_risk_contacted)
                        const resolution = pct(r.issues_resolved_direct, r.issues_received)
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
                              <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400">{r.new_clients_received}</td>
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
