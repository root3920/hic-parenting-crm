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

export default function HtCsmNewReportPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { profile } = useProfile()

  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [repOptions, setRepOptions] = useState<string[]>([])
  const [totalGraduates, setTotalGraduates] = useState<number | null>(null)

  // Auto-fill rep name from profile
  useEffect(() => {
    if (profile?.full_name && profile.role === 'csm_ht') {
      setForm((prev) => ({ ...prev, rep_name: profile.full_name }))
    }
  }, [profile])

  // Fetch csm_ht reps from profiles (via API to bypass RLS)
  useEffect(() => {
    fetch('/api/profiles?role=csm_ht')
      .then((r) => r.json())
      .then(({ profiles }) => {
        if (Array.isArray(profiles)) {
          setRepOptions(profiles.map((p: { full_name: string }) => p.full_name))
        }
      })
      .catch(() => {})
  }, [])

  // Auto-fill total active graduates from pwu_students
  useEffect(() => {
    supabase
      .from('pwu_students')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'graduated')
      .then(({ count }) => {
        setTotalGraduates(count ?? 0)
      })
  }, [supabase])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const inputCls = 'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400'
  const readonlyCls = 'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 cursor-not-allowed'
  const labelCls = 'block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1'
  const sectionTitleCls = 'text-sm font-bold text-zinc-800 dark:text-zinc-200 mb-4'
  const sectionCls = 'bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-4'
  const dividerCls = 'text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 border-b border-zinc-100 dark:border-zinc-800 pb-1 mb-3'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.rep_name) { toast.error('Select a rep name'); return }

    setSaving(true)
    try {
      const { error } = await supabase.from('ht_csm_reports').insert({
        date: form.date,
        rep_name: form.rep_name,
        total_active_graduates: totalGraduates ?? 0,
        graduates_contacted: parseInt(form.graduates_contacted) || 0,
        graduates_responded: parseInt(form.graduates_responded) || 0,
        real_conversations: parseInt(form.real_conversations) || 0,
        ascension_invitations: parseInt(form.ascension_invitations) || 0,
        calls_scheduled: parseInt(form.calls_scheduled) || 0,
        calls_showed: parseInt(form.calls_showed) || 0,
        enrollments_closed: parseInt(form.enrollments_closed) || 0,
        total_calls_week: parseInt(form.total_calls_week) || 0,
        objection_1: form.objection_1 || null,
        objection_2: form.objection_2 || null,
        objection_3: form.objection_3 || null,
        graduate_patterns: form.graduate_patterns || null,
        leads_lost: parseInt(form.leads_lost) || 0,
        lost_reason: form.lost_reason || null,
        learning_1: form.learning_1 || null,
        learning_2: form.learning_2 || null,
        learning_3: form.learning_3 || null,
        performance_score: form.performance_score,
        improvement_notes: form.improvement_notes || null,
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
      <div className="max-w-2xl mx-auto pb-16">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/equipo/csm"
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">New HT Report</h1>
            <p className="text-xs text-zinc-400 mt-0.5">Client Success — High Ticket</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ── Section 1: General ── */}
          <div className={sectionCls}>
            <p className={sectionTitleCls}>1 — General Information</p>
            <div>
              <label className={labelCls}>Rep name</label>
              <select
                value={form.rep_name}
                onChange={(e) => set('rep_name', e.target.value)}
                className={inputCls}
                required
              >
                <option value="">Select rep…</option>
                {repOptions.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Week evaluated</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => set('date', e.target.value)}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Total active graduates</label>
              <input
                type="text"
                value={totalGraduates === null ? 'Loading…' : String(totalGraduates)}
                readOnly
                className={readonlyCls}
              />
              <p className="text-[10px] text-zinc-400 mt-1">Auto-filled from student database (status = graduated)</p>
            </div>
          </div>

          {/* ── Section 2: Outreach ── */}
          <div className={sectionCls}>
            <p className={sectionTitleCls}>2 — Outreach</p>
            <div>
              <label className={labelCls}>Graduates contacted this week</label>
              <input
                type="number"
                min="0"
                value={form.graduates_contacted}
                onChange={(e) => set('graduates_contacted', e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </div>
          </div>

          {/* ── Section 3: Response rate ── */}
          <div className={sectionCls}>
            <p className={sectionTitleCls}>3 — Response Rate</p>
            <div>
              <label className={labelCls}>Graduates who responded</label>
              <input
                type="number"
                min="0"
                value={form.graduates_responded}
                onChange={(e) => set('graduates_responded', e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Graduates who entered real conversation</label>
              <input
                type="number"
                min="0"
                value={form.real_conversations}
                onChange={(e) => set('real_conversations', e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </div>
          </div>

          {/* ── Section 4: Pitch rate ── */}
          <div className={sectionCls}>
            <p className={sectionTitleCls}>4 — Pitch Rate</p>
            <div>
              <label className={labelCls}>Real conversations held</label>
              <input
                type="text"
                value={form.real_conversations || '0'}
                readOnly
                className={readonlyCls}
              />
              <p className="text-[10px] text-zinc-400 mt-1">Pre-filled from Section 3</p>
            </div>
            <div>
              <label className={labelCls}>Ascension call invitations sent</label>
              <input
                type="number"
                min="0"
                value={form.ascension_invitations}
                onChange={(e) => set('ascension_invitations', e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </div>
          </div>

          {/* ── Section 5: Show rate ── */}
          <div className={sectionCls}>
            <p className={sectionTitleCls}>5 — Show Rate</p>
            <div>
              <label className={labelCls}>Ascension calls scheduled</label>
              <input
                type="number"
                min="0"
                value={form.calls_scheduled}
                onChange={(e) => set('calls_scheduled', e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Calls completed / showed</label>
              <input
                type="number"
                min="0"
                value={form.calls_showed}
                onChange={(e) => set('calls_showed', e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </div>
          </div>

          {/* ── Section 6: Close rate ── */}
          <div className={sectionCls}>
            <p className={sectionTitleCls}>6 — Close Rate</p>
            <div>
              <label className={labelCls}>Calls completed</label>
              <input
                type="text"
                value={form.calls_showed || '0'}
                readOnly
                className={readonlyCls}
              />
              <p className="text-[10px] text-zinc-400 mt-1">Pre-filled from Section 5</p>
            </div>
            <div>
              <label className={labelCls}>Enrollments closed</label>
              <input
                type="number"
                min="0"
                value={form.enrollments_closed}
                onChange={(e) => set('enrollments_closed', e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </div>
          </div>

          {/* ── Section 7: Calls / week ── */}
          <div className={sectionCls}>
            <p className={sectionTitleCls}>7 — Calls / Week</p>
            <div>
              <label className={labelCls}>Total ascension calls completed this week</label>
              <input
                type="number"
                min="0"
                value={form.total_calls_week}
                onChange={(e) => set('total_calls_week', e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </div>
          </div>

          {/* ── Section 8: Conversation quality ── */}
          <div className={sectionCls}>
            <p className={sectionTitleCls}>8 — Conversation Quality</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Main objection 1</label>
                <input
                  type="text"
                  value={form.objection_1}
                  onChange={(e) => set('objection_1', e.target.value)}
                  placeholder="e.g. Price too high"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Main objection 2</label>
                <input
                  type="text"
                  value={form.objection_2}
                  onChange={(e) => set('objection_2', e.target.value)}
                  placeholder="e.g. Bad timing"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Main objection 3</label>
                <input
                  type="text"
                  value={form.objection_3}
                  onChange={(e) => set('objection_3', e.target.value)}
                  placeholder="e.g. Already enrolled elsewhere"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Patterns detected in graduates</label>
                <textarea
                  value={form.graduate_patterns}
                  onChange={(e) => set('graduate_patterns', e.target.value)}
                  placeholder="Describe recurring behaviors or patterns…"
                  rows={3}
                  className={cn(inputCls, 'resize-none')}
                />
              </div>
            </div>
          </div>

          {/* ── Section 9: Lost opportunities ── */}
          <div className={sectionCls}>
            <p className={sectionTitleCls}>9 — Lost Opportunities</p>
            <div>
              <label className={labelCls}>Leads who did not advance</label>
              <input
                type="number"
                min="0"
                value={form.leads_lost}
                onChange={(e) => set('leads_lost', e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Primary reason</label>
              <select
                value={form.lost_reason}
                onChange={(e) => set('lost_reason', e.target.value)}
                className={inputCls}
              >
                <option value="">Select reason…</option>
                {LOST_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Section 10: Strategic insights ── */}
          <div className={sectionCls}>
            <p className={sectionTitleCls}>10 — Strategic Insights</p>
            <div>
              <label className={labelCls}>Key learning 1</label>
              <input
                type="text"
                value={form.learning_1}
                onChange={(e) => set('learning_1', e.target.value)}
                placeholder="What worked well this week?"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Key learning 2</label>
              <input
                type="text"
                value={form.learning_2}
                onChange={(e) => set('learning_2', e.target.value)}
                placeholder="What surprised you?"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Key learning 3</label>
              <input
                type="text"
                value={form.learning_3}
                onChange={(e) => set('learning_3', e.target.value)}
                placeholder="What will you do differently?"
                className={inputCls}
              />
            </div>
          </div>

          {/* ── Section 11: Self-assessment ── */}
          <div className={sectionCls}>
            <p className={sectionTitleCls}>11 — Performance Self-Assessment</p>
            <div>
              <label className={labelCls}>Performance score (1–10)</label>
              <div className="flex gap-1.5 flex-wrap">
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
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400'
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>What would you improve next week?</label>
              <textarea
                value={form.improvement_notes}
                onChange={(e) => set('improvement_notes', e.target.value)}
                placeholder="Describe your main focus for improvement…"
                rows={3}
                className={cn(inputCls, 'resize-none')}
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href="/equipo/csm"
              className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm rounded-lg text-white font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity"
              style={{ backgroundColor: '#185FA5' }}
            >
              {saving ? 'Saving…' : 'Save report'}
            </button>
          </div>
        </form>
      </div>
    </PageTransition>
  )
}
