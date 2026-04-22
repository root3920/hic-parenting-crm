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

const LOST_REASONS = ['Lack of interest', 'Price', 'Timing', 'Not qualified', 'Other']

function today() {
  return new Date().toISOString().split('T')[0]
}

interface FormState {
  rep_name: string
  date: string
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

const EMPTY: FormState = {
  rep_name: '',
  date: today(),
  graduates_contacted: '',
  graduates_responded: '',
  real_conversations: '',
  ascension_invitations: '',
  calls_scheduled: '',
  calls_showed: '',
  enrollments_closed: '',
  total_calls_week: '',
  objection_1: '',
  objection_2: '',
  objection_3: '',
  graduate_patterns: '',
  leads_lost: '',
  lost_reason: '',
  learning_1: '',
  learning_2: '',
  learning_3: '',
  performance_score: 5,
  improvement_notes: '',
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

const inputCls = 'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400'
const readonlyCls = 'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 font-medium'

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
  const [totalGraduates, setTotalGraduates] = useState<number | null>(null)

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

  useEffect(() => {
    supabase
      .from('pwu_students')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'graduated')
      .then(({ count }) => setTotalGraduates(count ?? 0))
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.rep_name) { toast.error('Select a rep name'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('ht_csm_reports').insert({
        date: form.date,
        rep_name: form.rep_name,
        total_active_graduates: totalGraduates ?? 0,
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
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Graduate ascension activity log</p>
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
            <div>
              <FieldLabel>Total active graduates (auto)</FieldLabel>
              <div className={readonlyCls}>
                {totalGraduates === null ? 'Loading…' : totalGraduates}
              </div>
            </div>
          </SectionCard>

          {/* ── Outreach ── */}
          <SectionCard>
            <SectionHeader
              label="Outreach"
              color="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
            />
            <div>
              <FieldLabel>Graduates contacted today</FieldLabel>
              <NumberInput value={form.graduates_contacted} onChange={(v) => set('graduates_contacted', v)} />
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
                <FieldLabel>Graduates who responded</FieldLabel>
                <NumberInput value={form.graduates_responded} onChange={(v) => set('graduates_responded', v)} />
              </div>
              <div>
                <FieldLabel>Entered real conversation</FieldLabel>
                <NumberInput value={form.real_conversations} onChange={(v) => set('real_conversations', v)} />
              </div>
            </div>
          </SectionCard>

          {/* ── Pitch Rate ── */}
          <SectionCard>
            <SectionHeader
              label="Pitch Rate"
              color="bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300"
            />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Real conversations held</FieldLabel>
                <div className={readonlyCls}>{form.real_conversations || '0'}</div>
              </div>
              <div>
                <FieldLabel>Ascension call invitations sent</FieldLabel>
                <NumberInput value={form.ascension_invitations} onChange={(v) => set('ascension_invitations', v)} />
              </div>
            </div>
          </SectionCard>

          {/* ── Show Rate ── */}
          <SectionCard>
            <SectionHeader
              label="Show Rate"
              color="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
            />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Calls scheduled</FieldLabel>
                <NumberInput value={form.calls_scheduled} onChange={(v) => set('calls_scheduled', v)} />
              </div>
              <div>
                <FieldLabel>Calls completed / showed</FieldLabel>
                <NumberInput value={form.calls_showed} onChange={(v) => set('calls_showed', v)} />
              </div>
            </div>
          </SectionCard>

          {/* ── Close Rate ── */}
          <SectionCard>
            <SectionHeader
              label="Close Rate"
              color="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
            />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Calls completed</FieldLabel>
                <div className={readonlyCls}>{form.calls_showed || '0'}</div>
              </div>
              <div>
                <FieldLabel>Enrollments closed</FieldLabel>
                <NumberInput value={form.enrollments_closed} onChange={(v) => set('enrollments_closed', v)} />
              </div>
            </div>
          </SectionCard>

          {/* ── Calls / Week ── */}
          <SectionCard>
            <SectionHeader
              label="Calls Today"
              color="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
            />
            <div>
              <FieldLabel>Calls today</FieldLabel>
              <NumberInput value={form.total_calls_week} onChange={(v) => set('total_calls_week', v)} />
            </div>
          </SectionCard>

          {/* ── Conversation Quality ── */}
          <SectionCard>
            <SectionHeader
              label="Conversation Quality"
              color="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
            />
            <div className="grid grid-cols-3 gap-4 mb-4">
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
            <div>
              <FieldLabel>Patterns detected in graduates</FieldLabel>
              <textarea
                value={form.graduate_patterns}
                onChange={(e) => set('graduate_patterns', e.target.value)}
                placeholder="Describe recurring behaviors or patterns…"
                rows={3}
                className={cn(inputCls, 'resize-none')}
              />
            </div>
          </SectionCard>

          {/* ── Lost Opportunities ── */}
          <SectionCard>
            <SectionHeader
              label="Lost Opportunities"
              color="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
            />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Leads who did not advance</FieldLabel>
                <NumberInput value={form.leads_lost} onChange={(v) => set('leads_lost', v)} />
              </div>
              <div>
                <FieldLabel>Primary reason</FieldLabel>
                <select value={form.lost_reason} onChange={(e) => set('lost_reason', e.target.value)} className={inputCls}>
                  <option value="">Select reason…</option>
                  {LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
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
                style={{ backgroundColor: '#185FA5' }}
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
