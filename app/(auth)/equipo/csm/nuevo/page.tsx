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
] as const

const TEXT_FIELDS = [
  'main_blocker', 'waiting_on_team', 'escalated_why', 'wins_today', 'focus_tomorrow',
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
                {pct(n.at_risk_recovered, n.at_risk_identified)}
              </span>
            </div>
            <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700" />
            <div className="flex items-center gap-2">
              <span className="text-zinc-500 dark:text-zinc-400 text-xs font-medium">Issue Resolution Rate</span>
              <span className="font-bold text-zinc-900 dark:text-zinc-100">
                {pct(n.issues_resolved_same_day, n.issues_reported)}
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
              <NumField label="Active Clients Today" value={n.active_clients} onChange={(v) => setNum('active_clients', v)} />
              <NumField label="Check-ins Completed" value={n.checkins_completed} onChange={(v) => setNum('checkins_completed', v)} />
              <NumField label="At-Risk Clients Identified" value={n.at_risk_identified} onChange={(v) => setNum('at_risk_identified', v)} />
              <NumField label="At-Risk Recovered" value={n.at_risk_recovered} onChange={(v) => setNum('at_risk_recovered', v)} />
              <NumField label="Issues Reported by Clients" value={n.issues_reported} onChange={(v) => setNum('issues_reported', v)} />
              <NumField label="Issues Resolved Same Day" value={n.issues_resolved_same_day} onChange={(v) => setNum('issues_resolved_same_day', v)} />
              <NumField label="Follow-Ups Sent" value={n.follow_ups_sent} onChange={(v) => setNum('follow_ups_sent', v)} />
              <NumField label="Follow-Ups Replied" value={n.follow_ups_replied} onChange={(v) => setNum('follow_ups_replied', v)} />
            </div>
          </SectionCard>

          {/* ── Section 2: Sessions & Coaching Operations ── */}
          <SectionCard>
            <SectionHeader label="Sessions & Coaching Operations" color="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" />
            <div className="grid grid-cols-2 gap-4">
              <NumField label="Sessions Scheduled" value={n.sessions_scheduled} onChange={(v) => setNum('sessions_scheduled', v)} />
              <NumField label="Sessions Completed" value={n.sessions_completed} onChange={(v) => setNum('sessions_completed', v)} />
              <NumField label="No-Shows" value={n.no_shows} onChange={(v) => setNum('no_shows', v)} />
              <NumField label="Rescheduled" value={n.rescheduled} onChange={(v) => setNum('rescheduled', v)} />
              <NumField label="Session Notes Filed" value={n.session_notes_filed} onChange={(v) => setNum('session_notes_filed', v)} />
              <NumField label="Coach Flags Raised" value={n.coach_flags_raised} onChange={(v) => setNum('coach_flags_raised', v)} />
            </div>
          </SectionCard>

          {/* ── Section 3: Onboarding ── */}
          <SectionCard>
            <SectionHeader label="Onboarding" color="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" />
            <div className="grid grid-cols-2 gap-4">
              <NumField label="New Clients Started Today" value={n.new_clients_started} onChange={(v) => setNum('new_clients_started', v)} />
              <NumField label="Welcome Calls Done" value={n.welcome_calls_done} onChange={(v) => setNum('welcome_calls_done', v)} />
              <NumField label="Onboarding Steps Completed" value={n.onboarding_steps_completed} onChange={(v) => setNum('onboarding_steps_completed', v)} />
              <NumField label="Portal Access Verified" value={n.portal_access_verified} onChange={(v) => setNum('portal_access_verified', v)} />
              <NumField label="First Session Booked" value={n.first_session_booked} onChange={(v) => setNum('first_session_booked', v)} />
              <NumField label="Onboarding Stuck / Needs Help" value={n.onboarding_stuck} onChange={(v) => setNum('onboarding_stuck', v)} />
              <NumField label="Onboarding Fully Completed" value={n.onboarding_completed_total} onChange={(v) => setNum('onboarding_completed_total', v)} />
            </div>
          </SectionCard>

          {/* ── Section 4: Low-Ticket ── */}
          <SectionCard>
            <SectionHeader label="Low-Ticket" color="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" />
            <div className="grid grid-cols-2 gap-4">
              <NumField label="LT Active Clients" value={n.lt_active_clients} onChange={(v) => setNum('lt_active_clients', v)} />
              <NumField label="LT Check-ins Done" value={n.lt_checkins} onChange={(v) => setNum('lt_checkins', v)} />
              <NumField label="Upsell Conversations" value={n.lt_upsell_conversations} onChange={(v) => setNum('lt_upsell_conversations', v)} />
              <NumField label="Upsells Closed" value={n.lt_upsells_closed} onChange={(v) => setNum('lt_upsells_closed', v)} />
              <NumField label="LT Churn Requests" value={n.lt_churn_requests} onChange={(v) => setNum('lt_churn_requests', v)} />
            </div>
          </SectionCard>

          {/* ── Section 5: Graduates / Retention / Expansion ── */}
          <SectionCard>
            <SectionHeader label="Graduates / Retention / Expansion" color="bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" />
            <div className="grid grid-cols-2 gap-4">
              <NumField label="Graduates Contacted" value={n.graduates_contacted} onChange={(v) => setNum('graduates_contacted', v)} />
              <NumField label="Graduates Responded" value={n.graduates_responded} onChange={(v) => setNum('graduates_responded', v)} />
              <NumField label="Renewals Offered" value={n.renewals_offered} onChange={(v) => setNum('renewals_offered', v)} />
              <NumField label="Renewals Closed" value={n.renewals_closed} onChange={(v) => setNum('renewals_closed', v)} />
              <NumField label="Referrals Asked" value={n.referrals_asked} onChange={(v) => setNum('referrals_asked', v)} />
              <NumField label="Referrals Received" value={n.referrals_received} onChange={(v) => setNum('referrals_received', v)} />
              <NumField label="Testimonials Requested" value={n.testimonials_requested} onChange={(v) => setNum('testimonials_requested', v)} />
              <NumField label="Testimonials Received" value={n.testimonials_received} onChange={(v) => setNum('testimonials_received', v)} />
            </div>
          </SectionCard>

          {/* ── Section 6: Daily Volume ── */}
          <SectionCard>
            <SectionHeader label="Daily Volume" color="bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" />
            <div className="grid grid-cols-3 gap-4">
              <NumField label="Total Messages Sent" value={n.total_messages_sent} onChange={(v) => setNum('total_messages_sent', v)} />
              <NumField label="Total Calls Made" value={n.total_calls_made} onChange={(v) => setNum('total_calls_made', v)} />
              <NumField label="Hours in Client Work" value={n.hours_in_client_work} onChange={(v) => setNum('hours_in_client_work', v)} />
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
                label="Wins Today"
                value={form.texts.wins_today}
                onChange={(v) => setText('wins_today', v)}
                placeholder="What went well?"
              />
              <TextAreaField
                label="Focus Tomorrow"
                value={form.texts.focus_tomorrow}
                onChange={(v) => setText('focus_tomorrow', v)}
                placeholder="Top priorities for tomorrow"
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
