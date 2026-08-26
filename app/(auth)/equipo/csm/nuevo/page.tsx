'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { PageTransition } from '@/components/motion/PageTransition'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useProfile } from '@/hooks/useProfile'

export const dynamic = 'force-dynamic'

function today() {
  return new Date().toISOString().split('T')[0]
}

const HARDCODED_CSMS = ['Marcela Collier']

const NUM_FIELDS = [
  'active_coaching_clients', 'followups_completed', 'contacted_after_noshow',
  'at_risk_contacted', 'at_risk_recovered',
  'issues_received', 'issues_resolved_direct', 'cases_escalated',
  'sessions_scheduled', 'sessions_rescheduled', 'session_reminders_sent',
  'qa_reminders_sent', 'coach_coordination_count', 'weekly_slides_sent',
  'new_clients_received', 'welcome_messages_sent', 'contracts_created',
  'clients_added_ghl_kajabi', 'coach_matches_completed', 'first_sessions_scheduled', 'access_issues_resolved',
  'lt_conversations', 'lt_followups', 'lt_issues_resolved', 'lt_engagement_convos', 'lt_upgrade_opportunities',
  'grad_approaching_contacted', 'family_manifestos_sent', 'clients_invited_record',
  'recordings_scheduled', 'recordings_completed', 'grad_nurturing_convos',
  'referred_to_grad_program', 'continuation_opportunities',
  'total_conversations', 'total_followups', 'total_operational_tasks',
] as const

const TEXT_FIELDS = [
  'main_blocker', 'waiting_on_team', 'escalated_why',
  'pending_tasks_tomorrow', 'clients_attention_tomorrow',
] as const

type NumKey = typeof NUM_FIELDS[number]
type TextKey = typeof TEXT_FIELDS[number]

interface FormState {
  csm_name: string
  date: string
  capacity: 'Low' | 'Medium' | 'High'
  nums: Record<NumKey, string>
  texts: Record<TextKey, string>
}

function makeEmpty(): FormState {
  const nums = {} as Record<NumKey, string>
  for (const k of NUM_FIELDS) nums[k] = ''
  const texts = {} as Record<TextKey, string>
  for (const k of TEXT_FIELDS) texts[k] = ''
  return { csm_name: '', date: today(), capacity: 'Medium', nums, texts }
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

const inputCls =
  'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30 focus:border-[#ffbd59]'

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">{children}</label>
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 mb-4">
      {children}
    </div>
  )
}

function SectionHeader({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold tracking-wide', color)}>
        {label}
      </span>
    </div>
  )
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className={inputCls}
      />
    </div>
  )
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className={cn(inputCls, 'resize-none')}
      />
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pct(num: string, den: string): string {
  const n = parseInt(num) || 0
  const d = parseInt(den) || 0
  if (d === 0) return '—'
  return `${Math.round((n / d) * 100)}%`
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CsmDailyActivityPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { profile } = useProfile()

  const [form, setForm] = useState<FormState>(makeEmpty)
  const [saving, setSaving] = useState(false)
  const [csmOptions, setCsmOptions] = useState<string[]>([])

  function setNum(key: NumKey, value: string) {
    setForm((prev) => ({ ...prev, nums: { ...prev.nums, [key]: value } }))
  }

  function setText(key: TextKey, value: string) {
    setForm((prev) => ({ ...prev, texts: { ...prev.texts, [key]: value } }))
  }

  // Auto-fill CSM name
  useEffect(() => {
    if (profile?.full_name && profile.role === 'csm_ht') {
      setForm((prev) => ({ ...prev, csm_name: profile.full_name }))
    }
  }, [profile])

  // Load CSM name options
  useEffect(() => {
    const load = async () => {
      const names = new Set<string>(HARDCODED_CSMS)

      // Fetch distinct names from table
      try {
        const { data } = await supabase
          .from('csm_daily_activity')
          .select('csm_name')
        if (data) {
          for (const row of data) {
            if (row.csm_name) names.add(row.csm_name)
          }
        }
      } catch {}

      // Fetch profiles with csm_ht role
      try {
        const res = await fetch('/api/profiles?role=csm_ht')
        const { profiles } = await res.json()
        if (Array.isArray(profiles)) {
          for (const p of profiles) {
            if (p.full_name) names.add(p.full_name)
          }
        }
      } catch {}

      setCsmOptions(Array.from(names).sort())
    }
    load()
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.csm_name) {
      toast.error('Select a CSM name')
      return
    }
    setSaving(true)
    try {
      const row: Record<string, unknown> = {
        csm_name: form.csm_name,
        date: form.date,
        capacity: form.capacity,
      }
      for (const k of NUM_FIELDS) {
        row[k] = parseInt(form.nums[k]) || 0
      }
      for (const k of TEXT_FIELDS) {
        row[k] = form.texts[k] || null
      }

      const { error } = await supabase.from('csm_daily_activity').insert(row)
      if (error) {
        toast.error(`Failed to save: ${error.message}`)
        return
      }
      toast.success('Report saved successfully')
      router.push('/equipo/csm')
    } catch (err) {
      toast.error(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const n = form.nums

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/equipo/csm"
            className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to CSM dashboard
          </Link>
        </div>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Daily Report — Client Success Manager</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Daily CSM activity log</p>
        </div>

        {/* KPI Preview Bar */}
        <div className="sticky top-0 z-10 mb-4">
          <div className="bg-zinc-50 dark:bg-zinc-800/80 backdrop-blur border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-zinc-500 dark:text-zinc-400 text-xs font-medium">At-Risk Recovery Rate</span>
              <span className="font-bold text-zinc-900 dark:text-zinc-100">
                {pct(n.at_risk_recovered, n.at_risk_contacted)}
              </span>
            </div>
            <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700" />
            <div className="flex items-center gap-2">
              <span className="text-zinc-500 dark:text-zinc-400 text-xs font-medium">Issue Resolution Rate</span>
              <span className="font-bold text-zinc-900 dark:text-zinc-100">
                {pct(n.issues_resolved_direct, n.issues_received)}
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-0">
          {/* ── Meta ── */}
          <SectionCard>
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-4">General Information</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>CSM Name</FieldLabel>
                <select
                  value={form.csm_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, csm_name: e.target.value }))}
                  className={inputCls}
                  required
                >
                  <option value="">Select CSM...</option>
                  {csmOptions.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>Date</FieldLabel>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
                  className={inputCls}
                  required
                />
              </div>
            </div>
          </SectionCard>

          {/* ── Section 1: Clients & Follow-Up ── */}
          <SectionCard>
            <SectionHeader label="Clients & Follow-Up" color="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" />
            <div className="grid grid-cols-2 gap-4">
              <NumField label="Active Coaching Clients" value={n.active_coaching_clients} onChange={(v) => setNum('active_coaching_clients', v)} />
              <NumField label="Follow-ups Completed" value={n.followups_completed} onChange={(v) => setNum('followups_completed', v)} />
              <NumField label="Contacted After No-Show" value={n.contacted_after_noshow} onChange={(v) => setNum('contacted_after_noshow', v)} />
              <NumField label="At-Risk Contacted" value={n.at_risk_contacted} onChange={(v) => setNum('at_risk_contacted', v)} />
              <NumField label="At-Risk Recovered" value={n.at_risk_recovered} onChange={(v) => setNum('at_risk_recovered', v)} />
              <NumField label="Issues Received" value={n.issues_received} onChange={(v) => setNum('issues_received', v)} />
              <NumField label="Issues Resolved Direct" value={n.issues_resolved_direct} onChange={(v) => setNum('issues_resolved_direct', v)} />
              <NumField label="Cases Escalated" value={n.cases_escalated} onChange={(v) => setNum('cases_escalated', v)} />
            </div>
          </SectionCard>

          {/* ── Section 2: Sessions & Coaching Operations ── */}
          <SectionCard>
            <SectionHeader label="Sessions & Coaching Operations" color="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" />
            <div className="grid grid-cols-2 gap-4">
              <NumField label="Sessions Scheduled" value={n.sessions_scheduled} onChange={(v) => setNum('sessions_scheduled', v)} />
              <NumField label="Sessions Rescheduled" value={n.sessions_rescheduled} onChange={(v) => setNum('sessions_rescheduled', v)} />
              <NumField label="Session Reminders Sent" value={n.session_reminders_sent} onChange={(v) => setNum('session_reminders_sent', v)} />
              <NumField label="QA Reminders Sent" value={n.qa_reminders_sent} onChange={(v) => setNum('qa_reminders_sent', v)} />
              <NumField label="Coach Coordination Count" value={n.coach_coordination_count} onChange={(v) => setNum('coach_coordination_count', v)} />
              <NumField label="Weekly Slides Sent" value={n.weekly_slides_sent} onChange={(v) => setNum('weekly_slides_sent', v)} />
            </div>
          </SectionCard>

          {/* ── Section 3: Onboarding ── */}
          <SectionCard>
            <SectionHeader label="Onboarding" color="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" />
            <div className="grid grid-cols-2 gap-4">
              <NumField label="New Clients Received" value={n.new_clients_received} onChange={(v) => setNum('new_clients_received', v)} />
              <NumField label="Welcome Messages Sent" value={n.welcome_messages_sent} onChange={(v) => setNum('welcome_messages_sent', v)} />
              <NumField label="Contracts Created" value={n.contracts_created} onChange={(v) => setNum('contracts_created', v)} />
              <NumField label="Clients Added GHL/Kajabi" value={n.clients_added_ghl_kajabi} onChange={(v) => setNum('clients_added_ghl_kajabi', v)} />
              <NumField label="Coach Matches Completed" value={n.coach_matches_completed} onChange={(v) => setNum('coach_matches_completed', v)} />
              <NumField label="First Sessions Scheduled" value={n.first_sessions_scheduled} onChange={(v) => setNum('first_sessions_scheduled', v)} />
              <NumField label="Access Issues Resolved" value={n.access_issues_resolved} onChange={(v) => setNum('access_issues_resolved', v)} />
            </div>
          </SectionCard>

          {/* ── Section 4: Long-Term Clients ── */}
          <SectionCard>
            <SectionHeader label="Long-Term Clients" color="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" />
            <div className="grid grid-cols-2 gap-4">
              <NumField label="LT Conversations" value={n.lt_conversations} onChange={(v) => setNum('lt_conversations', v)} />
              <NumField label="LT Follow-ups" value={n.lt_followups} onChange={(v) => setNum('lt_followups', v)} />
              <NumField label="LT Issues Resolved" value={n.lt_issues_resolved} onChange={(v) => setNum('lt_issues_resolved', v)} />
              <NumField label="LT Engagement Convos" value={n.lt_engagement_convos} onChange={(v) => setNum('lt_engagement_convos', v)} />
              <NumField label="LT Upgrade Opportunities" value={n.lt_upgrade_opportunities} onChange={(v) => setNum('lt_upgrade_opportunities', v)} />
            </div>
          </SectionCard>

          {/* ── Section 5: Graduates / Retention / Expansion ── */}
          <SectionCard>
            <SectionHeader label="Graduates / Retention / Expansion" color="bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" />
            <div className="grid grid-cols-2 gap-4">
              <NumField label="Grad Approaching Contacted" value={n.grad_approaching_contacted} onChange={(v) => setNum('grad_approaching_contacted', v)} />
              <NumField label="Family Manifestos Sent" value={n.family_manifestos_sent} onChange={(v) => setNum('family_manifestos_sent', v)} />
              <NumField label="Clients Invited to Record" value={n.clients_invited_record} onChange={(v) => setNum('clients_invited_record', v)} />
              <NumField label="Recordings Scheduled" value={n.recordings_scheduled} onChange={(v) => setNum('recordings_scheduled', v)} />
              <NumField label="Recordings Completed" value={n.recordings_completed} onChange={(v) => setNum('recordings_completed', v)} />
              <NumField label="Grad Nurturing Convos" value={n.grad_nurturing_convos} onChange={(v) => setNum('grad_nurturing_convos', v)} />
              <NumField label="Referred to Grad Program" value={n.referred_to_grad_program} onChange={(v) => setNum('referred_to_grad_program', v)} />
              <NumField label="Continuation Opportunities" value={n.continuation_opportunities} onChange={(v) => setNum('continuation_opportunities', v)} />
            </div>
          </SectionCard>

          {/* ── Section 6: Daily Volume ── */}
          <SectionCard>
            <SectionHeader label="Daily Volume" color="bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" />
            <div className="grid grid-cols-3 gap-4">
              <NumField label="Total Conversations" value={n.total_conversations} onChange={(v) => setNum('total_conversations', v)} />
              <NumField label="Total Follow-ups" value={n.total_followups} onChange={(v) => setNum('total_followups', v)} />
              <NumField label="Total Operational Tasks" value={n.total_operational_tasks} onChange={(v) => setNum('total_operational_tasks', v)} />
            </div>
          </SectionCard>

          {/* ── Section 8: Blockers & Escalations ── */}
          <SectionCard>
            <SectionHeader label="Blockers & Escalations" color="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" />
            <div className="space-y-4">
              <TextAreaField
                label="Main Blocker Today"
                value={form.texts.main_blocker}
                onChange={(v) => setText('main_blocker', v)}
                placeholder="What's preventing progress?"
              />
              <TextAreaField
                label="Waiting on Team"
                value={form.texts.waiting_on_team}
                onChange={(v) => setText('waiting_on_team', v)}
                placeholder="Pending from other departments?"
              />
              <TextAreaField
                label="Escalated & Why"
                value={form.texts.escalated_why}
                onChange={(v) => setText('escalated_why', v)}
                placeholder="What was escalated and the reason"
              />
            </div>
          </SectionCard>

          {/* ── Section 9: End-of-Day Status ── */}
          <SectionCard>
            <SectionHeader label="End-of-Day Status" color="bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" />
            <div className="space-y-4">
              <TextAreaField
                label="Pending Tasks Tomorrow"
                value={form.texts.pending_tasks_tomorrow}
                onChange={(v) => setText('pending_tasks_tomorrow', v)}
                placeholder="Tasks pending for tomorrow"
              />
              <TextAreaField
                label="Clients Needing Attention Tomorrow"
                value={form.texts.clients_attention_tomorrow}
                onChange={(v) => setText('clients_attention_tomorrow', v)}
                placeholder="Which clients need attention tomorrow?"
              />
              <div>
                <FieldLabel>Capacity</FieldLabel>
                <div className="flex gap-0 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 w-fit">
                  {(['Low', 'Medium', 'High'] as const).map((level) => {
                    const selected = form.capacity === level
                    const colorMap = {
                      Low: selected ? 'bg-red-500 text-white border-red-500' : '',
                      Medium: selected ? 'bg-amber-400 text-white border-amber-400' : '',
                      High: selected ? 'bg-green-500 text-white border-green-500' : '',
                    }
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, capacity: level }))}
                        className={cn(
                          'px-5 py-2 text-sm font-medium transition-all',
                          selected
                            ? colorMap[level]
                            : 'bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                        )}
                      >
                        {level}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Submit */}
          <div className="pt-2 pb-8 border-t border-zinc-100 dark:border-zinc-800 mt-2">
            <div className="flex items-center justify-end gap-3 pt-4">
              <Link
                href="/equipo/csm"
                className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 text-sm rounded-xl text-white font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity"
                style={{ backgroundColor: '#ffbd59' }}
              >
                {saving ? 'Saving...' : 'Save report'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </PageTransition>
  )
}
