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

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

interface FormState {
  date: string
  rep_name: string
  // auto-filled
  active_members_count: number
  total_members_count: number
  // engagement
  members_participated: string
  avg_daily_messages: string
  conversation_quality: number
  // activación
  new_members: string
  welcome_sent: string
  new_members_introduced: string
  checkins_sent: string
  checkins_responded: string
  // new in engagement
  support_messages: string
  // new in activation
  checkin_active_inactive: string
  // retención
  trials_expiring_today: string
  trials_converted: string
  trials_contacted: string
  cancellation_requests: string
  cancellations_retained: string
  retention_contacts: string
  successfully_retained: string
  checkin_after_cancellation: string
  failed_purchase_contact: string
  trials_expiring_soon_contacted: string
  // operación
  questions_total: string
  questions_answered_24h: string
  referrals_generated: string
  // insights
  insights: string
  top_action: string
  community_energy: number
}

const initial: FormState = {
  date: todayStr(),
  rep_name: '',
  active_members_count: 0,
  total_members_count: 0,
  members_participated: '',
  avg_daily_messages: '',
  conversation_quality: 3,
  new_members: '',
  welcome_sent: '',
  new_members_introduced: '',
  support_messages: '',
  checkin_active_inactive: '',
  checkins_sent: '',
  checkins_responded: '',
  trials_expiring_today: '',
  trials_converted: '',
  trials_contacted: '',
  cancellation_requests: '',
  cancellations_retained: '',
  retention_contacts: '',
  successfully_retained: '',
  checkin_after_cancellation: '',
  failed_purchase_contact: '',
  trials_expiring_soon_contacted: '',
  questions_total: '',
  questions_answered_24h: '',
  referrals_generated: '',
  insights: '',
  top_action: '',
  community_energy: 3,
}

function n(v: string) { return parseInt(v) || 0 }

// ── Shared UI components ──────────────────────────────────────────────────────

const inputCls = 'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400'

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">{children}</label>
}

function NumberInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="number" min={0} value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="0"
      className={inputCls}
    />
  )
}

function ReadonlyField({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 font-medium">
        {value}
      </div>
    </div>
  )
}

function ScalePicker({ value, onChange, lowLabel, highLabel }: {
  value: number
  onChange: (v: number) => void
  lowLabel?: string
  highLabel?: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={cn(
              'flex-1 py-2.5 rounded-lg text-sm font-bold border-2 transition-all',
              value === n
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                : 'border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600 hover:text-zinc-600'
            )}
          >
            {n}
          </button>
        ))}
      </div>
      {(lowLabel || highLabel) && (
        <div className="flex justify-between text-xs text-zinc-400">
          <span>{lowLabel}</span>
          <span>{highLabel}</span>
        </div>
      )}
    </div>
  )
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 mb-4">
      {children}
    </div>
  )
}

function SectionHeader({ label, weight, color }: { label: string; weight: string; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold tracking-wide', color)}>
        {label}
      </span>
      <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">{weight}</span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NuevoSpcPerfPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { profile } = useProfile()
  const [form, setForm] = useState<FormState>(initial)
  const [submitting, setSubmitting] = useState(false)
  const [repOptions, setRepOptions] = useState<string[]>([])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // Auto-fill rep name from profile
  useEffect(() => {
    if (profile?.full_name && profile.role === 'csm_spc') {
      set('rep_name', profile.full_name)
    }
  }, [profile])

  // Fetch rep options
  useEffect(() => {
    fetch('/api/profiles?role=csm_spc')
      .then((r) => r.json())
      .then(({ profiles }) => {
        if (profiles) {
          const names = (profiles as { full_name: string | null; email: string | null }[])
            .map((p) => p.full_name || p.email || '')
            .filter(Boolean)
          setRepOptions(names)
        }
      })
  }, [])

  // Auto-fill member counts from spc_members
  useEffect(() => {
    async function fetchCounts() {
      const [activeRes, totalRes] = await Promise.all([
        supabase.from('spc_members').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('spc_members').select('id', { count: 'exact', head: true }).in('status', ['active', 'trial']),
      ])
      set('active_members_count', activeRes.count ?? 0)
      set('total_members_count', totalRes.count ?? 0)
    }
    fetchCounts()
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.date || !form.rep_name) {
      toast.error('Date and rep are required')
      return
    }
    setSubmitting(true)
    const { error } = await supabase.from('spc_performance_reports').insert({
      date:                    form.date,
      rep_name:                form.rep_name,
      active_members_count:    form.active_members_count,
      total_members_count:     form.total_members_count,
      members_participated:    n(form.members_participated),
      avg_daily_messages:      n(form.avg_daily_messages),
      conversation_quality:    form.conversation_quality,
      new_members:             n(form.new_members),
      welcome_sent:            n(form.welcome_sent),
      new_members_introduced:  n(form.new_members_introduced),
      checkins_sent:           n(form.checkins_sent),
      checkins_responded:      n(form.checkins_responded),
      trials_expiring_today:   n(form.trials_expiring_today),
      trials_converted:        n(form.trials_converted),
      trials_contacted:        n(form.trials_contacted),
      cancellation_requests:   n(form.cancellation_requests),
      cancellations_retained:  n(form.cancellations_retained),
      support_messages:        n(form.support_messages),
      retention_contacts:      n(form.retention_contacts),
      checkin_active_inactive:  n(form.checkin_active_inactive),
      checkin_after_cancellation: n(form.checkin_after_cancellation),
      successfully_retained:   n(form.successfully_retained),
      failed_purchase_contact: n(form.failed_purchase_contact),
      trials_expiring_soon_contacted: n(form.trials_expiring_soon_contacted),
      questions_total:         n(form.questions_total),
      questions_answered_24h:  n(form.questions_answered_24h),
      referrals_generated:     n(form.referrals_generated),
      insights:                form.insights || null,
      top_action:              form.top_action || null,
      community_energy:        form.community_energy,
    })
    setSubmitting(false)
    if (error) {
      toast.error(`Error saving: ${error.message}`)
    } else {
      toast.success('Report saved')
      router.push('/equipo/spc')
    }
  }

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/equipo/spc"
            className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to SPC dashboard
          </Link>
        </div>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Daily Report — Client Success SPC</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Community management activity log</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-0">

          {/* ── Sección 1: Información general ── */}
          <SectionCard>
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-4">General Information</p>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <FieldLabel>SPC Rep</FieldLabel>
                <select
                  value={form.rep_name}
                  onChange={(e) => set('rep_name', e.target.value)}
                  className={inputCls}
                >
                  <option value="">Select rep…</option>
                  {repOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel>Date</FieldLabel>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => set('date', e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <ReadonlyField value={form.active_members_count} label="Active members (auto)" />
              <ReadonlyField value={form.total_members_count} label="Total active + trial members (auto)" />
            </div>
          </SectionCard>

          {/* ── Sección 2: Engagement ── */}
          <SectionCard>
            <SectionHeader
              label="Engagement"
              weight="Weight: 40%"
              color="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
            />
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <FieldLabel>Members who actively participated</FieldLabel>
                <NumberInput value={form.members_participated} onChange={(v) => set('members_participated', v)} />
              </div>
              <div>
                <FieldLabel>Average daily messages</FieldLabel>
                <NumberInput value={form.avg_daily_messages} onChange={(v) => set('avg_daily_messages', v)} />
              </div>
            </div>
            <div>
              <FieldLabel>Was the conversation organic or driven?</FieldLabel>
              <ScalePicker
                value={form.conversation_quality}
                onChange={(v) => set('conversation_quality', v)}
                lowLabel="1 = Fully driven"
                highLabel="5 = Fully organic"
              />
            </div>
            <div className="mt-4">
              <FieldLabel>Support/Group messages sent today</FieldLabel>
              <NumberInput value={form.support_messages} onChange={(v) => set('support_messages', v)} />
              <p className="text-[10px] text-zinc-400 mt-1">Total messages sent by CSM in community + WhatsApp</p>
            </div>
          </SectionCard>

          {/* ── Sección 3: Activación ── */}
          <SectionCard>
            <SectionHeader
              label="Activation"
              weight="Weight: 20%"
              color="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
            />
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <FieldLabel>New members today</FieldLabel>
                <NumberInput value={form.new_members} onChange={(v) => set('new_members', v)} />
              </div>
              <div>
                <FieldLabel>Personalized welcomes sent</FieldLabel>
                <NumberInput value={form.welcome_sent} onChange={(v) => set('welcome_sent', v)} />
              </div>
              <div>
                <FieldLabel>New members who introduced themselves</FieldLabel>
                <NumberInput value={form.new_members_introduced} onChange={(v) => set('new_members_introduced', v)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <FieldLabel>Check-ins to inactive members +7 days</FieldLabel>
                <NumberInput value={form.checkins_sent} onChange={(v) => set('checkins_sent', v)} />
              </div>
              <div>
                <FieldLabel>Check-ins that generated a response</FieldLabel>
                <NumberInput value={form.checkins_responded} onChange={(v) => set('checkins_responded', v)} />
              </div>
              <div>
                <FieldLabel>Check in active or inactive members</FieldLabel>
                <NumberInput value={form.checkin_active_inactive} onChange={(v) => set('checkin_active_inactive', v)} />
              </div>
            </div>
          </SectionCard>

          {/* ── Sección 4: Retención y conversión ── */}
          <SectionCard>
            <SectionHeader
              label="Retention & Conversion"
              weight="Weight: 30%"
              color="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
            />
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <FieldLabel>Trials expiring today</FieldLabel>
                <NumberInput value={form.trials_expiring_today} onChange={(v) => set('trials_expiring_today', v)} />
              </div>
              <div>
                <FieldLabel>Trials converted to active</FieldLabel>
                <NumberInput value={form.trials_converted} onChange={(v) => set('trials_converted', v)} />
              </div>
              <div>
                <FieldLabel>Trials contacted on expiration day</FieldLabel>
                <NumberInput value={form.trials_contacted} onChange={(v) => set('trials_contacted', v)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <FieldLabel>Cancellation requests today</FieldLabel>
                <NumberInput value={form.cancellation_requests} onChange={(v) => set('cancellation_requests', v)} />
              </div>
              <div>
                <FieldLabel>Members retained (avoided cancelling)</FieldLabel>
                <NumberInput value={form.cancellations_retained} onChange={(v) => set('cancellations_retained', v)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <FieldLabel>Retention contacts (trial ending or want to cancel)</FieldLabel>
                <NumberInput value={form.retention_contacts} onChange={(v) => set('retention_contacts', v)} />
                <p className="text-[10px] text-zinc-400 mt-1">How many members did you contact proactively?</p>
              </div>
              <div>
                <FieldLabel>Successfully retained</FieldLabel>
                <NumberInput value={form.successfully_retained} onChange={(v) => set('successfully_retained', v)} />
                <p className="text-[10px] text-zinc-400 mt-1">Members who confirmed they want to stay</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Check in after cancellation</FieldLabel>
                <NumberInput value={form.checkin_after_cancellation} onChange={(v) => set('checkin_after_cancellation', v)} />
                <p className="text-[10px] text-zinc-400 mt-1">Members checked in after they already cancelled</p>
              </div>
              <div>
                <FieldLabel>After failed purchase contact</FieldLabel>
                <NumberInput value={form.failed_purchase_contact} onChange={(v) => set('failed_purchase_contact', v)} />
                <p className="text-[10px] text-zinc-400 mt-1">Members contacted after a failed payment</p>
              </div>
            </div>
            <div className="mt-3">
              <FieldLabel>Trials expiring in {'<'}7 days — messaged today</FieldLabel>
              <NumberInput value={form.trials_expiring_soon_contacted} onChange={(v) => set('trials_expiring_soon_contacted', v)} />
              <p className="text-[10px] text-zinc-400 mt-1">How many trials expiring within 7 days did you contact today?</p>
            </div>
          </SectionCard>

          {/* ── Sección 5: Operación ── */}
          <SectionCard>
            <SectionHeader
              label="Operations"
              weight="Weight: 10%"
              color="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
            />
            <div className="grid grid-cols-3 gap-3">
              <div>
                <FieldLabel>Questions in the community</FieldLabel>
                <NumberInput value={form.questions_total} onChange={(v) => set('questions_total', v)} />
              </div>
              <div>
                <FieldLabel>Answered within 24h</FieldLabel>
                <NumberInput value={form.questions_answered_24h} onChange={(v) => set('questions_answered_24h', v)} />
              </div>
              <div>
                <FieldLabel>Referrals generated</FieldLabel>
                <NumberInput value={form.referrals_generated} onChange={(v) => set('referrals_generated', v)} />
              </div>
            </div>
          </SectionCard>

          {/* ── Sección 6: Insights cualitativos ── */}
          <SectionCard>
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-4">Qualitative Insights</p>
            <div className="mb-4">
              <FieldLabel>3 key insights from today</FieldLabel>
              <textarea
                value={form.insights}
                onChange={(e) => set('insights', e.target.value)}
                placeholder="What did you observe today in the community?"
                rows={3}
                className={`${inputCls} resize-none`}
              />
            </div>
            <div className="mb-4">
              <FieldLabel>Which action had the most impact today?</FieldLabel>
              <textarea
                value={form.top_action}
                onChange={(e) => set('top_action', e.target.value)}
                placeholder="Describe the most impactful action…"
                rows={2}
                className={`${inputCls} resize-none`}
              />
            </div>
            <div>
              <FieldLabel>Community energy level (1–5)</FieldLabel>
              <ScalePicker
                value={form.community_energy}
                onChange={(v) => set('community_energy', v)}
                lowLabel="1 = Very low"
                highLabel="5 = Very high"
              />
            </div>
          </SectionCard>

          <div className="pt-2 pb-8">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-60 hover:opacity-90"
              style={{ backgroundColor: '#185FA5' }}
            >
              {submitting ? 'Saving…' : 'Save report'}
            </button>
          </div>
        </form>
      </div>
    </PageTransition>
  )
}
