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
const POST_TYPES = ['Educational', 'Inspirational', 'Community spotlight', 'Announcement', 'Question / Poll', 'Other']

function today() {
  return new Date().toISOString().split('T')[0]
}

interface FormState {
  date: string
  rep_name: string
  hours_worked: string
  // Community
  community_size: string
  new_members: string
  members_welcomed: string
  members_introduced: string
  questions_answered: string
  wins_shared: string
  // Content & Activity
  published_post: boolean
  post_type: string
  sent_class_reminder: boolean
  // Retention
  inactive_identified: string
  checkin_messages_sent: string
  parent_frustration: boolean
  parent_frustration_notes: string
  referral_mentioned: boolean
  referrals_count: string
  // End of day
  highs: string
  lows: string
  performance: string
}

const initialState: FormState = {
  date: today(),
  rep_name: '',
  hours_worked: '',
  community_size: '', new_members: '', members_welcomed: '',
  members_introduced: '', questions_answered: '', wins_shared: '',
  published_post: false, post_type: '', sent_class_reminder: false,
  inactive_identified: '', checkin_messages_sent: '',
  parent_frustration: false, parent_frustration_notes: '',
  referral_mentioned: false, referrals_count: '',
  highs: '', lows: '', performance: '7',
}

function n(v: string) { return parseInt(v) || 0 }

function SectionHeader({ color, label, sub }: { color: string; label: string; sub: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold tracking-wide', color)}>
        {label}
      </span>
      <span className="text-xs text-zinc-400 dark:text-zinc-500">{sub}</span>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">{children}</label>
}

function NumberInput({ value, onChange, placeholder = '0' }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <input
      type="number" min={0} value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
    />
  )
}

function TextArea({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <textarea
      value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} rows={3}
      className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none"
    />
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        'inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
        checked
          ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-600'
          : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
      )}
    >
      <span className={cn(
        'w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0',
        checked ? 'border-blue-500 bg-blue-500' : 'border-zinc-300 dark:border-zinc-600'
      )}>
        {checked && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
      </span>
      {label}
    </button>
  )
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 mb-4">
      {children}
    </div>
  )
}

export default function NuevoReporteSpcPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [form, setForm] = useState<FormState>(initialState)
  const [submitting, setSubmitting] = useState(false)
  const [repOptions, setRepOptions] = useState<string[]>([])
  const { profile } = useProfile()

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

  useEffect(() => {
    if (profile?.full_name && profile.role === 'csm_spc') {
      setForm((prev) => ({ ...prev, rep_name: profile.full_name! }))
    }
  }, [profile])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.date || !form.rep_name) {
      toast.error('Date and rep name are required')
      return
    }
    setSubmitting(true)
    const { error } = await supabase.from('spc_csm_reports').insert({
      date: form.date,
      rep_name: form.rep_name,
      hours_worked: parseFloat(form.hours_worked) || 0,
      community_size: n(form.community_size),
      new_members: n(form.new_members),
      members_welcomed: n(form.members_welcomed),
      members_introduced: n(form.members_introduced),
      questions_answered: n(form.questions_answered),
      wins_shared: n(form.wins_shared),
      published_post: form.published_post,
      post_type: form.published_post ? (form.post_type || null) : null,
      sent_class_reminder: form.sent_class_reminder,
      inactive_identified: n(form.inactive_identified),
      checkin_messages_sent: n(form.checkin_messages_sent),
      parent_frustration: form.parent_frustration,
      parent_frustration_notes: form.parent_frustration ? (form.parent_frustration_notes || null) : null,
      referral_mentioned: form.referral_mentioned,
      referrals_count: form.referral_mentioned ? n(form.referrals_count) : 0,
      highs: form.highs || null,
      lows: form.lows || null,
      performance: n(form.performance) || 5,
    })
    setSubmitting(false)
    if (error) {
      toast.error(`Error saving: ${error.message}`)
    } else {
      toast.success('Report saved successfully')
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
            Back to SPC Dashboard
          </Link>
        </div>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Daily Closeout — Client Success SPC</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Community management daily activity log</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-0">

          {/* Basic Info */}
          <SectionCard>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <FieldLabel>Date</FieldLabel>
                <input
                  type="date" value={form.date}
                  onChange={(e) => set('date', e.target.value)}
                  className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                />
              </div>
              <div>
                <FieldLabel>SPC Rep</FieldLabel>
                <select
                  value={form.rep_name}
                  onChange={(e) => set('rep_name', e.target.value)}
                  className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                >
                  <option value="">Select rep...</option>
                  {repOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel>Hours worked</FieldLabel>
                <input
                  type="number" min={0} step={0.5} value={form.hours_worked}
                  onChange={(e) => set('hours_worked', e.target.value)}
                  placeholder="0"
                  className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                />
              </div>
            </div>
          </SectionCard>

          {/* Community Metrics */}
          <SectionCard>
            <SectionHeader
              color="bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300"
              label="🟢 COMMUNITY METRICS"
              sub="Membership & engagement"
            />
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><FieldLabel>Community size</FieldLabel><NumberInput value={form.community_size} onChange={(v) => set('community_size', v)} /></div>
              <div><FieldLabel>New members</FieldLabel><NumberInput value={form.new_members} onChange={(v) => set('new_members', v)} /></div>
              <div><FieldLabel>Members welcomed</FieldLabel><NumberInput value={form.members_welcomed} onChange={(v) => set('members_welcomed', v)} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><FieldLabel>Members introduced</FieldLabel><NumberInput value={form.members_introduced} onChange={(v) => set('members_introduced', v)} /></div>
              <div><FieldLabel>Questions answered</FieldLabel><NumberInput value={form.questions_answered} onChange={(v) => set('questions_answered', v)} /></div>
              <div><FieldLabel>Wins shared</FieldLabel><NumberInput value={form.wins_shared} onChange={(v) => set('wins_shared', v)} /></div>
            </div>
          </SectionCard>

          {/* Content & Activity */}
          <SectionCard>
            <SectionHeader
              color="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
              label="🔵 CONTENT & ACTIVITY"
              sub="Daily publishing"
            />
            <div className="flex flex-wrap gap-3 mb-4">
              <Toggle
                checked={form.published_post}
                onChange={(v) => set('published_post', v)}
                label="Published a post today"
              />
              <Toggle
                checked={form.sent_class_reminder}
                onChange={(v) => set('sent_class_reminder', v)}
                label="Sent class reminder"
              />
            </div>
            {form.published_post && (
              <div>
                <FieldLabel>Post type</FieldLabel>
                <select
                  value={form.post_type}
                  onChange={(e) => set('post_type', e.target.value)}
                  className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                >
                  <option value="">Select type...</option>
                  {POST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}
          </SectionCard>

          {/* Retention */}
          <SectionCard>
            <SectionHeader
              color="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
              label="🔴 RETENTION"
              sub="At-risk members & check-ins"
            />
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div><FieldLabel>Inactive members identified</FieldLabel><NumberInput value={form.inactive_identified} onChange={(v) => set('inactive_identified', v)} /></div>
              <div><FieldLabel>Check-in messages sent</FieldLabel><NumberInput value={form.checkin_messages_sent} onChange={(v) => set('checkin_messages_sent', v)} /></div>
            </div>
            <div className="flex flex-wrap gap-3 mb-4">
              <Toggle
                checked={form.parent_frustration}
                onChange={(v) => set('parent_frustration', v)}
                label="Parent frustration expressed"
              />
              <Toggle
                checked={form.referral_mentioned}
                onChange={(v) => set('referral_mentioned', v)}
                label="Referral mentioned"
              />
            </div>
            {form.parent_frustration && (
              <div className="mb-3">
                <FieldLabel>Frustration notes</FieldLabel>
                <TextArea
                  value={form.parent_frustration_notes}
                  onChange={(v) => set('parent_frustration_notes', v)}
                  placeholder="Describe the situation..."
                />
              </div>
            )}
            {form.referral_mentioned && (
              <div>
                <FieldLabel>Referrals count</FieldLabel>
                <NumberInput value={form.referrals_count} onChange={(v) => set('referrals_count', v)} />
              </div>
            )}
          </SectionCard>

          {/* End of Day */}
          <SectionCard>
            <SectionHeader
              color="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
              label="🟢 END OF DAY"
              sub="Reflection & self-assessment"
            />
            <div className="mb-3">
              <FieldLabel>Highs</FieldLabel>
              <TextArea value={form.highs} onChange={(v) => set('highs', v)} placeholder="What went well today?" />
            </div>
            <div className="mb-4">
              <FieldLabel>Lows</FieldLabel>
              <TextArea value={form.lows} onChange={(v) => set('lows', v)} placeholder="What was challenging?" />
            </div>
            <div>
              <FieldLabel>Performance score (1–10)</FieldLabel>
              <div className="flex items-center gap-3 mt-1">
                <input
                  type="range" min={1} max={10}
                  value={form.performance}
                  onChange={(e) => set('performance', e.target.value)}
                  className="flex-1 accent-blue-600"
                />
                <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100 w-8 text-center">{form.performance}</span>
              </div>
            </div>
          </SectionCard>

          <div className="pt-2 pb-8">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: '#1D9E75' }}
            >
              {submitting ? 'Saving...' : 'Save daily closeout'}
            </button>
          </div>
        </form>
      </div>
    </PageTransition>
  )
}
