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

interface FormState {
  rep_name: string
  date: string
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

const EMPTY: FormState = {
  rep_name: '',
  date: today(),
  real_conversations: '',
  objection_1: '',
  objection_2: '',
  objection_3: '',
  learning_1: '',
  learning_2: '',
  learning_3: '',
  performance_score: 5,
  improvement_notes: '',
  client_retention_rate: '',
  completion_rate: '',
  engagement_score: '',
  upsell_renewal_rate: '',
  avg_resolution_time_hours: '',
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

const inputCls = 'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30 focus:border-[#ffbd59]'

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">{children}</label>
}

function NumberInput({ value, onChange, placeholder = '0' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="number"
      min={0}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={inputCls}
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

function SectionHeader({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold tracking-wide', color)}>
        {label}
      </span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HtCsmNewReportPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { profile } = useProfile()

  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [repOptions, setRepOptions] = useState<string[]>([])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  useEffect(() => {
    if (profile?.full_name && profile.role === 'csm_ht') {
      set('rep_name', profile.full_name)
    }
  }, [profile])

  useEffect(() => {
    fetch('/api/profiles?role=csm_ht')
      .then((r) => r.json())
      .then(({ profiles }) => {
        if (Array.isArray(profiles)) {
          setRepOptions(profiles.map((p: { full_name: string }) => p.full_name).filter(Boolean))
        }
      })
      .catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.rep_name) { toast.error('Select a rep name'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('ht_csm_reports').insert({
        date: form.date,
        rep_name: form.rep_name,
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
      if (error) { toast.error(`Failed to save: ${error.message}`); return }
      toast.success('Report saved successfully')
      router.push('/equipo/csm')
    } catch (err) {
      toast.error(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

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
            Back to HT dashboard
          </Link>
        </div>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Daily Report — Client Success HT</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Daily client success activity log</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-0">

          {/* ── General Information ── */}
          <SectionCard>
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-4">General Information</p>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <FieldLabel>Rep name</FieldLabel>
                <select
                  value={form.rep_name}
                  onChange={(e) => set('rep_name', e.target.value)}
                  className={inputCls}
                  required
                >
                  <option value="">Select rep…</option>
                  {repOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel>Date</FieldLabel>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => set('date', e.target.value)}
                  className={inputCls}
                  required
                />
              </div>
            </div>
          </SectionCard>

          {/* ── Response Rate ── */}
          <SectionCard>
            <SectionHeader
              label="Response Rate"
              color="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
            />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Real conversations</FieldLabel>
                <NumberInput value={form.real_conversations} onChange={(v) => set('real_conversations', v)} />
              </div>
            </div>
          </SectionCard>

          {/* ── Conversation Quality ── */}
          <SectionCard>
            <SectionHeader
              label="Conversation Quality"
              color="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
            />
            <div className="grid grid-cols-3 gap-4">
              <div>
                <FieldLabel>Main objection 1</FieldLabel>
                <input type="text" value={form.objection_1} onChange={(e) => set('objection_1', e.target.value)} placeholder="e.g. Price" className={inputCls} />
              </div>
              <div>
                <FieldLabel>Main objection 2</FieldLabel>
                <input type="text" value={form.objection_2} onChange={(e) => set('objection_2', e.target.value)} placeholder="e.g. Timing" className={inputCls} />
              </div>
              <div>
                <FieldLabel>Main objection 3</FieldLabel>
                <input type="text" value={form.objection_3} onChange={(e) => set('objection_3', e.target.value)} placeholder="e.g. Not a priority" className={inputCls} />
              </div>
            </div>
          </SectionCard>

          {/* ── Strategic Insights ── */}
          <SectionCard>
            <SectionHeader
              label="Strategic Insights"
              color="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
            />
            <div className="space-y-3">
              <div>
                <FieldLabel>Key learning 1</FieldLabel>
                <input type="text" value={form.learning_1} onChange={(e) => set('learning_1', e.target.value)} placeholder="What worked well today?" className={inputCls} />
              </div>
              <div>
                <FieldLabel>Key learning 2</FieldLabel>
                <input type="text" value={form.learning_2} onChange={(e) => set('learning_2', e.target.value)} placeholder="What surprised you?" className={inputCls} />
              </div>
              <div>
                <FieldLabel>Key learning 3</FieldLabel>
                <input type="text" value={form.learning_3} onChange={(e) => set('learning_3', e.target.value)} placeholder="What will you do differently?" className={inputCls} />
              </div>
            </div>
          </SectionCard>

          {/* ── Success Metrics ── */}
          <SectionCard>
            <SectionHeader
              label="Success Metrics"
              color="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
            />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Client Retention Rate (%)</FieldLabel>
                <p className="text-[10px] text-zinc-400 mb-1">% of clients who stayed active this week</p>
                <NumberInput value={form.client_retention_rate} onChange={(v) => set('client_retention_rate', v)} />
              </div>
              <div>
                <FieldLabel>Completion Rate of Program Components (%)</FieldLabel>
                <p className="text-[10px] text-zinc-400 mb-1">% of assigned program components completed by clients</p>
                <NumberInput value={form.completion_rate} onChange={(v) => set('completion_rate', v)} />
              </div>
              <div>
                <FieldLabel>Engagement Score (%)</FieldLabel>
                <p className="text-[10px] text-zinc-400 mb-1">Based on attendance + participation this week</p>
                <NumberInput value={form.engagement_score} onChange={(v) => set('engagement_score', v)} />
              </div>
              <div>
                <FieldLabel>% Upsells or Renewals Closed</FieldLabel>
                <p className="text-[10px] text-zinc-400 mb-1">% of upsell or renewal opportunities that closed</p>
                <NumberInput value={form.upsell_renewal_rate} onChange={(v) => set('upsell_renewal_rate', v)} />
              </div>
              <div>
                <FieldLabel>Avg Resolution Time (hours)</FieldLabel>
                <p className="text-[10px] text-zinc-400 mb-1">Average time to resolve a client concern this week</p>
                <NumberInput value={form.avg_resolution_time_hours} onChange={(v) => set('avg_resolution_time_hours', v)} />
              </div>
            </div>
          </SectionCard>

          {/* ── Performance Self-Assessment ── */}
          <SectionCard>
            <SectionHeader
              label="Performance Self-Assessment"
              color="bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300"
            />
            <div className="mb-4">
              <FieldLabel>Performance score (1–10)</FieldLabel>
              <div className="flex gap-1.5 flex-wrap mt-1">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => set('performance_score', n)}
                    className={cn(
                      'w-9 h-9 rounded-lg text-sm font-bold border-2 transition-all',
                      form.performance_score === n
                        ? n >= 8
                          ? 'bg-green-500 border-green-500 text-white'
                          : n >= 5
                            ? 'bg-amber-400 border-amber-400 text-white'
                            : 'bg-red-500 border-red-500 text-white'
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 hover:border-zinc-400 hover:text-zinc-600'
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <FieldLabel>What would you improve tomorrow?</FieldLabel>
              <textarea
                value={form.improvement_notes}
                onChange={(e) => set('improvement_notes', e.target.value)}
                placeholder="Describe your main focus for improvement…"
                rows={3}
                className={cn(inputCls, 'resize-none')}
              />
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
                {saving ? 'Saving…' : 'Save report'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </PageTransition>
  )
}
