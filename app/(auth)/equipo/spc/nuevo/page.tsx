'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { ChipSelector } from '@/components/shared/ChipSelector'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { PageTransition } from '@/components/motion/PageTransition'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const REP_OPTIONS = ['Ana Sofía', 'Otro SPC Rep']

const CANCEL_REASONS = ['Financial', 'Lack of time', 'No value seen', 'Platform', 'Personal', 'Other']

function today() {
  return new Date().toISOString().split('T')[0]
}

interface FormState {
  date: string
  rep_name: string
  // Community
  c_active_members: string
  c_new_members: string
  c_at_risk: string
  c_churn: string
  c_reactivated: string
  c_notas: string
  // Content & Activity
  a_posts: string
  a_comments: string
  a_lives: string
  a_engagement: string
  a_notas: string
  // Retention
  r_requests: string
  r_saved: string
  r_churn: string
  r_cancel_reasons: string[]
  r_notas: string
  // Closeout
  e_wins: string
  e_risks: string
  e_action1: string
  e_action2: string
  e_action3: string
  e_performance: string
}

const initialState: FormState = {
  date: today(),
  rep_name: 'Ana Sofía',
  c_active_members: '', c_new_members: '', c_at_risk: '', c_churn: '', c_reactivated: '', c_notas: '',
  a_posts: '', a_comments: '', a_lives: '', a_engagement: 'High', a_notas: '',
  r_requests: '', r_saved: '', r_churn: '', r_cancel_reasons: [], r_notas: '',
  e_wins: '', e_risks: '', e_action1: '', e_action2: '', e_action3: '', e_performance: '7',
}

function n(v: string) { return parseInt(v) || 0 }
function pct(num: number, den: number) {
  return den > 0 ? `${((num / den) * 100).toFixed(0)}%` : '—'
}

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
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <input
      type="number"
      min={0}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
    />
  )
}

function TextArea({ value, onChange, placeholder }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={3}
      className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none"
    />
  )
}

function TextInput({ value, onChange, placeholder }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
    />
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

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const liveKPIs = useMemo(() => ({
    rescate: pct(n(form.r_saved), n(form.r_requests)),
    churn: n(form.c_churn) + n(form.r_churn),
    engagement: form.a_engagement,
    posts: n(form.a_posts),
    performance: form.e_performance || '—',
  }), [form.r_saved, form.r_requests, form.c_churn, form.r_churn, form.a_engagement, form.a_posts, form.e_performance])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.date || !form.rep_name) {
      toast.error('Date and rep name are required')
      return
    }
    setSubmitting(true)
    const { error } = await supabase.from('spc_reports').insert({
      date: form.date,
      rep_name: form.rep_name,
      c_active_members: n(form.c_active_members),
      c_new_members: n(form.c_new_members),
      c_at_risk: n(form.c_at_risk),
      c_churn: n(form.c_churn),
      c_reactivated: n(form.c_reactivated),
      c_notas: form.c_notas || null,
      a_posts: n(form.a_posts),
      a_comments: n(form.a_comments),
      a_lives: n(form.a_lives),
      a_engagement: form.a_engagement,
      a_notas: form.a_notas || null,
      r_requests: n(form.r_requests),
      r_saved: n(form.r_saved),
      r_churn: n(form.r_churn),
      r_cancel_reasons: form.r_cancel_reasons.length ? form.r_cancel_reasons : null,
      r_notas: form.r_notas || null,
      e_wins: form.e_wins || null,
      e_risks: form.e_risks || null,
      e_action1: form.e_action1 || null,
      e_action2: form.e_action2 || null,
      e_action3: form.e_action3 || null,
      e_performance: n(form.e_performance) || 5,
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
        {/* Header */}
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

        {/* Live KPI bar */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-6">
          {[
            { label: 'Rescue Rate', value: liveKPIs.rescate },
            { label: 'Daily Churn', value: String(liveKPIs.churn) },
            { label: 'Engagement', value: liveKPIs.engagement },
            { label: 'Posts Today', value: String(liveKPIs.posts) },
            { label: 'Performance', value: `${liveKPIs.performance}/10` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2.5 text-center">
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-0.5">{label}</p>
              <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-0">
          {/* Meta */}
          <SectionCard>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Date</FieldLabel>
                <input
                  type="date"
                  value={form.date}
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
                  {REP_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
          </SectionCard>

          {/* COMMUNITY */}
          <SectionCard>
            <SectionHeader
              color="bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300"
              label="🟢 COMMUNITY"
              sub="Membership snapshot"
            />
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><FieldLabel>Active members</FieldLabel><NumberInput value={form.c_active_members} onChange={(v) => set('c_active_members', v)} /></div>
              <div><FieldLabel>New members</FieldLabel><NumberInput value={form.c_new_members} onChange={(v) => set('c_new_members', v)} /></div>
              <div><FieldLabel>Reactivated</FieldLabel><NumberInput value={form.c_reactivated} onChange={(v) => set('c_reactivated', v)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><FieldLabel>At risk</FieldLabel><NumberInput value={form.c_at_risk} onChange={(v) => set('c_at_risk', v)} /></div>
              <div><FieldLabel>Churned</FieldLabel><NumberInput value={form.c_churn} onChange={(v) => set('c_churn', v)} /></div>
            </div>
            <div>
              <FieldLabel>Notes</FieldLabel>
              <TextArea value={form.c_notas} onChange={(v) => set('c_notas', v)} placeholder="Community observations..." />
            </div>
          </SectionCard>

          {/* CONTENT & ACTIVITY */}
          <SectionCard>
            <SectionHeader
              color="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
              label="🔵 CONTENT & ACTIVITY"
              sub="Daily community engagement"
            />
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><FieldLabel>Posts published</FieldLabel><NumberInput value={form.a_posts} onChange={(v) => set('a_posts', v)} /></div>
              <div><FieldLabel>Comments / reactions</FieldLabel><NumberInput value={form.a_comments} onChange={(v) => set('a_comments', v)} /></div>
              <div><FieldLabel>Lives / calls hosted</FieldLabel><NumberInput value={form.a_lives} onChange={(v) => set('a_lives', v)} /></div>
            </div>
            <div className="mb-3">
              <FieldLabel>Overall engagement</FieldLabel>
              <SegmentedControl options={['High', 'Medium', 'Low']} value={form.a_engagement} onChange={(v) => set('a_engagement', v)} />
            </div>
            <div>
              <FieldLabel>Notes</FieldLabel>
              <TextArea value={form.a_notas} onChange={(v) => set('a_notas', v)} placeholder="Content and activity notes..." />
            </div>
          </SectionCard>

          {/* RETENTION */}
          <SectionCard>
            <SectionHeader
              color="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
              label="🔴 RETENTION"
              sub="Cancellation management"
            />
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><FieldLabel>Requests</FieldLabel><NumberInput value={form.r_requests} onChange={(v) => set('r_requests', v)} /></div>
              <div><FieldLabel>Saved</FieldLabel><NumberInput value={form.r_saved} onChange={(v) => set('r_saved', v)} /></div>
              <div><FieldLabel>Churn</FieldLabel><NumberInput value={form.r_churn} onChange={(v) => set('r_churn', v)} /></div>
            </div>
            <div className="mb-3">
              <FieldLabel>Cancellation reasons</FieldLabel>
              <ChipSelector options={CANCEL_REASONS} value={form.r_cancel_reasons} onChange={(v) => set('r_cancel_reasons', v)} color="coral" />
            </div>
            <div>
              <FieldLabel>Notes</FieldLabel>
              <TextArea value={form.r_notas} onChange={(v) => set('r_notas', v)} placeholder="Retention observations..." />
            </div>
          </SectionCard>

          {/* DAILY CLOSEOUT */}
          <SectionCard>
            <SectionHeader
              color="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
              label="🟢 DAILY CLOSEOUT"
              sub="End-of-day summary"
            />
            <div className="mb-3">
              <FieldLabel>What went well today?</FieldLabel>
              <TextArea value={form.e_wins} onChange={(v) => set('e_wins', v)} placeholder="Wins and achievements of the day..." />
            </div>
            <div className="mb-3">
              <FieldLabel>What should we watch?</FieldLabel>
              <TextArea value={form.e_risks} onChange={(v) => set('e_risks', v)} placeholder="Risks and situations to monitor..." />
            </div>
            <div className="mb-4">
              <FieldLabel>Top 3 actions for tomorrow</FieldLabel>
              <div className="space-y-2">
                <TextInput value={form.e_action1} onChange={(v) => set('e_action1', v)} placeholder="1. Priority action..." />
                <TextInput value={form.e_action2} onChange={(v) => set('e_action2', v)} placeholder="2. Priority action..." />
                <TextInput value={form.e_action3} onChange={(v) => set('e_action3', v)} placeholder="3. Priority action..." />
              </div>
            </div>
            <div>
              <FieldLabel>Performance score (1–10)</FieldLabel>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={form.e_performance}
                  onChange={(e) => set('e_performance', e.target.value)}
                  className="flex-1 accent-blue-600"
                />
                <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100 w-8 text-center">{form.e_performance}</span>
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
