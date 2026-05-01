'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { PageTransition } from '@/components/motion/PageTransition'
import { ArrowLeft, Video } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { formatTimeInTimezone } from '@/lib/timezones'
import { useUserTimezone } from '@/hooks/useUserTimezone'
import { useProfile } from '@/hooks/useProfile'

export const dynamic = 'force-dynamic'

function today() {
  return new Date().toISOString().split('T')[0]
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormState {
  date: string
  closer_name: string
  total_meetings: string
  showed_meetings: string
  cancelled_meetings: string
  no_show_meetings: string
  rescheduled_meetings: string
  followup_meetings: string
  total_offers: string
  offers_proposed: string
  won_deals: string
  lost_deals: string
  cash_collected: string
  recurrent_cash: string
  feedback: string
}

interface DayCall {
  id: string
  start_date: string
  full_name: string
  email: string | null
  phone: string | null
  meeting_url: string | null
  status: string
  call_type: string | null
  notes: string | null
  call_status: string | null
  next_step: string | null
  call_summary: string | null
}

interface CallReport {
  call_id: string
  call_status: 'No Show' | 'Showed Up' | 'Cancelled' | 'Rescheduled' | ''
  call_type: 'Qualified' | 'Disqualified' | 'Onboarding' | 'Interview' | ''
  next_step: 'Follow Up' | 'Cancelled' | 'Rescheduled' | ''
  call_summary: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CALL_TYPE_STYLES: Record<string, string> = {
  'Qualified':    'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Disqualified': 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'Onboarding':   'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  'Interview':    'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
}

const initialState: FormState = {
  date: today(),
  closer_name: '',
  total_meetings: '', showed_meetings: '', cancelled_meetings: '',
  no_show_meetings: '', rescheduled_meetings: '', followup_meetings: '',
  total_offers: '', offers_proposed: '', won_deals: '', lost_deals: '',
  cash_collected: '', recurrent_cash: '',
  feedback: '',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function n(v: string) { return parseInt(v) || 0 }
function nf(v: string) { return parseFloat(v) || 0 }

function pct(num: number, den: number) {
  return den > 0 ? `${((num / den) * 100).toFixed(1)}%` : '—'
}

function formatTime(dateStr: string, timezone: string) {
  return formatTimeInTimezone(dateStr, timezone)
}

function mapStatusToCallStatus(status: string): CallReport['call_status'] {
  if (status === 'Showed Up')   return 'Showed Up'
  if (status === 'No show')     return 'No Show'
  if (status === 'Cancelled')   return 'Cancelled'
  if (status === 'Rescheduled') return 'Rescheduled'
  return ''
}

function mapCallStatusToStatus(callStatus: string): string {
  if (callStatus === 'Showed Up')   return 'Showed Up'
  if (callStatus === 'No Show')     return 'No show'
  if (callStatus === 'Cancelled')   return 'Cancelled'
  if (callStatus === 'Rescheduled') return 'Rescheduled'
  return 'Scheduled'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function NumberInput({ value, onChange, placeholder = '0', prefix }: {
  value: string; onChange: (v: string) => void; placeholder?: string; prefix?: string
}) {
  return (
    <div className="relative">
      {prefix && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400 dark:text-zinc-500 pointer-events-none">
          {prefix}
        </span>
      )}
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400',
          prefix ? 'pl-7 pr-3' : 'px-3'
        )}
      />
    </div>
  )
}

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 mb-4', className)}>
      {children}
    </div>
  )
}

function CallReportCard({ call, report, onUpdate, index, timezone }: {
  call: DayCall
  report: CallReport | undefined
  onUpdate: (field: keyof Omit<CallReport, 'call_id'>, value: string) => void
  index: number
  timezone: string
}) {
  const callStatus = report?.call_status ?? ''
  const borderColor =
    callStatus === 'Showed Up'   ? 'border-l-[#3B6D11]' :
    callStatus === 'No Show'     ? 'border-l-[#A32D2D]' :
    callStatus === 'Cancelled'   ? 'border-l-[#A32D2D]' :
    callStatus === 'Rescheduled' ? 'border-l-[#534AB7]' :
    'border-l-zinc-300 dark:border-l-zinc-600'

  const hasExistingStatus = call.status !== 'Scheduled'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07 }}
      className={cn(
        'bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 border-l-4 p-4 hover:shadow-md transition-shadow',
        borderColor
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs text-zinc-400 dark:text-zinc-500">{formatTime(call.start_date, timezone)}</span>
            {call.call_type && (
              <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', CALL_TYPE_STYLES[call.call_type] ?? 'bg-zinc-100 text-zinc-600')}>
                {call.call_type}
              </span>
            )}
            {hasExistingStatus && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                Current status: {call.status}
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{call.full_name}</p>
          {call.email && <p className="text-xs text-zinc-400 dark:text-zinc-500">{call.email}</p>}
        </div>
        {call.meeting_url && (
          <a
            href={call.meeting_url}
            target="_blank"
            rel="noopener noreferrer"
            title="Join call"
            className="p-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors shrink-0"
          >
            <Video className="h-4 w-4" />
          </a>
        )}
      </div>

      {/* Form fields */}
      <div className="space-y-2.5">
        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            Call status <span className="text-red-400">*</span>
          </label>
          <select
            value={report?.call_status ?? ''}
            onChange={(e) => onUpdate('call_status', e.target.value)}
            className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          >
            <option value="">── Select ──</option>
            <option value="Showed Up">Showed Up</option>
            <option value="No Show">No Show</option>
            <option value="Cancelled">Cancelled</option>
            <option value="Rescheduled">Rescheduled</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Call type</label>
          <select
            value={report?.call_type ?? ''}
            onChange={(e) => onUpdate('call_type', e.target.value)}
            className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          >
            <option value="">── Select ──</option>
            <option value="Qualified">Qualified</option>
            <option value="Disqualified">Disqualified</option>
            <option value="Onboarding">Onboarding</option>
            <option value="Interview">Interview</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Next step</label>
          <select
            value={report?.next_step ?? ''}
            onChange={(e) => onUpdate('next_step', e.target.value)}
            className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          >
            <option value="">── Select ──</option>
            <option value="Follow Up">Follow Up</option>
            <option value="Cancelled">Cancelled</option>
            <option value="Rescheduled">Rescheduled</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Call summary</label>
          <textarea
            value={report?.call_summary ?? ''}
            onChange={(e) => onUpdate('call_summary', e.target.value)}
            placeholder="Describe what happened in this call..."
            rows={2}
            className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-y"
          />
        </div>
      </div>
    </motion.div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NuevoReporteCloserPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { timezone } = useUserTimezone()
  const [form, setForm] = useState<FormState>(initialState)
  const [submitting, setSubmitting] = useState(false)
  const [closerOptions, setCloserOptions] = useState<string[]>([])
  const { profile } = useProfile()

  // Pre-fill closer name from profile when available
  useEffect(() => {
    if (profile?.closer_name) {
      setForm((prev) => ({ ...prev, closer_name: profile.closer_name! }))
    }
  }, [profile])

  // Llamadas del día
  const [dayCalls, setDayCalls] = useState<DayCall[]>([])
  const [callsLoading, setCallsLoading] = useState(false)
  const [callReports, setCallReports] = useState<Record<string, CallReport>>({})

  // Load closer options from profiles table (via API to bypass RLS)
  useEffect(() => {
    fetch('/api/profiles?role=closer')
      .then((r) => r.json())
      .then(({ profiles }) => {
        if (profiles) {
          const names = (profiles as { closer_name: string | null; full_name: string | null; email: string | null }[])
            .map((p) => p.closer_name || p.full_name || p.email || '')
            .filter(Boolean)
            .sort()
          setCloserOptions(names)
        }
      })
  }, [])

  // Fetch calls for selected date + closer
  useEffect(() => {
    if (!form.date || !form.closer_name) return
    setCallsLoading(true)
    setCallReports({})
    supabase
      .from('calls')
      .select('id, start_date, full_name, email, phone, meeting_url, status, call_type, notes, call_status, next_step, call_summary')
      .eq('closer_name', form.closer_name)
      .gte('start_date', `${form.date}T00:00:00`)
      .lte('start_date', `${form.date}T23:59:59`)
      .order('start_date', { ascending: true })
      .then(({ data }) => {
        const calls = data ?? []
        setDayCalls(calls)
        const initialReports: Record<string, CallReport> = {}
        for (const call of calls) {
          // Rescheduled calls must start with a blank form — previous report
          // data belongs to the old occurrence, not this new one.
          const wasRescheduled =
            (call.call_status ?? '').toLowerCase() === 'rescheduled' ||
            (call.status ?? '').toLowerCase() === 'rescheduled'

          if (wasRescheduled) {
            initialReports[call.id] = {
              call_id: call.id,
              call_status: '',
              call_type: '',
              next_step: '',
              call_summary: '',
            }
            continue
          }

          const validNextSteps: Array<CallReport['next_step']> = ['Follow Up', 'Cancelled', 'Rescheduled', '']
          const rawNext = call.next_step ?? ''
          const validCallTypes: Array<CallReport['call_type']> = ['Qualified', 'Disqualified', 'Onboarding', 'Interview', '']
          const rawType = call.call_type ?? ''
          initialReports[call.id] = {
            call_id: call.id,
            call_status: mapStatusToCallStatus(call.status),
            call_type: validCallTypes.includes(rawType as CallReport['call_type']) ? (rawType as CallReport['call_type']) : '',
            next_step: validNextSteps.includes(rawNext as CallReport['next_step']) ? (rawNext as CallReport['next_step']) : '',
            call_summary: call.call_summary ?? '',
          }
        }
        setCallReports(initialReports)
        setCallsLoading(false)
      })
  }, [supabase, form.date, form.closer_name])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function updateCallReport(callId: string, field: keyof Omit<CallReport, 'call_id'>, value: string) {
    setCallReports(prev => ({
      ...prev,
      [callId]: { ...prev[callId], call_id: callId, [field]: value }
    }))
  }

  const liveKPIs = useMemo(() => ({
    showRate: pct(n(form.showed_meetings), n(form.total_meetings)),
    noShowRate: pct(n(form.no_show_meetings), n(form.total_meetings)),
    offerRate: pct(n(form.offers_proposed), n(form.showed_meetings)),
    closeRate: pct(n(form.won_deals), n(form.offers_proposed)),
  }), [form.showed_meetings, form.total_meetings, form.no_show_meetings, form.offers_proposed, form.won_deals])

  const allReported = dayCalls.length > 0 && dayCalls.every(c => callReports[c.id]?.call_status)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.date || !form.closer_name) {
      toast.error('Date and closer name are required')
      return
    }
    setSubmitting(true)

    const { error } = await supabase.from('closer_daily_reports').insert({
      date: form.date,
      closer_name: form.closer_name,
      total_meetings: n(form.total_meetings),
      showed_meetings: n(form.showed_meetings),
      cancelled_meetings: n(form.cancelled_meetings),
      no_show_meetings: n(form.no_show_meetings),
      rescheduled_meetings: n(form.rescheduled_meetings),
      followup_meetings: n(form.followup_meetings),
      total_offers: n(form.total_offers),
      offers_proposed: n(form.offers_proposed),
      won_deals: n(form.won_deals),
      lost_deals: n(form.lost_deals),
      cash_collected: nf(form.cash_collected),
      recurrent_cash: nf(form.recurrent_cash),
      feedback: form.feedback || null,
      source: 'form',
    })

    if (error) {
      setSubmitting(false)
      toast.error(`Error saving: ${error.message}`)
      return
    }

    // Update calls in parallel
    const reportsToUpdate = Object.values(callReports).filter(r => r.call_status)
    if (reportsToUpdate.length > 0) {
      const now = new Date().toISOString()
      await Promise.all(
        reportsToUpdate.map(r =>
          supabase.from('calls').update({
            call_status:  r.call_status,
            call_type:    r.call_type || null,
            next_step:    r.next_step || null,
            call_summary: r.call_summary || null,
            reported_at:  now,
            reported_by:  form.closer_name,
            status: mapCallStatusToStatus(r.call_status),
          }).eq('id', r.call_id)
        )
      )
    }

    setSubmitting(false)
    toast.success('Report saved successfully')
    router.push('/equipo/closer')
  }

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/equipo/closer"
            className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Closer Dashboard
          </Link>
        </div>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Daily Report — Closer</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Daily activity log and closing results</p>
        </div>

        {/* Live KPI bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
          {[
            { label: 'Show Rate', value: liveKPIs.showRate },
            { label: 'No-Show Rate', value: liveKPIs.noShowRate },
            { label: 'Offer Rate', value: liveKPIs.offerRate },
            { label: 'Close Rate', value: liveKPIs.closeRate },
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
                <FieldLabel>Closer</FieldLabel>
                <select
                  value={form.closer_name}
                  onChange={(e) => set('closer_name', e.target.value)}
                  className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                >
                  <option value="">Select closer...</option>
                  {closerOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
          </SectionCard>

          {/* Section 1 — Reuniones */}
          <SectionCard>
            <SectionHeader
              color="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
              label="Meetings"
              sub="Day's meetings"
            />
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><FieldLabel>Total meetings</FieldLabel><NumberInput value={form.total_meetings} onChange={(v) => set('total_meetings', v)} /></div>
              <div><FieldLabel>Showed</FieldLabel><NumberInput value={form.showed_meetings} onChange={(v) => set('showed_meetings', v)} /></div>
              <div><FieldLabel>Follow-up</FieldLabel><NumberInput value={form.followup_meetings} onChange={(v) => set('followup_meetings', v)} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><FieldLabel>Cancelled</FieldLabel><NumberInput value={form.cancelled_meetings} onChange={(v) => set('cancelled_meetings', v)} /></div>
              <div><FieldLabel>No-show</FieldLabel><NumberInput value={form.no_show_meetings} onChange={(v) => set('no_show_meetings', v)} /></div>
              <div><FieldLabel>Rescheduled</FieldLabel><NumberInput value={form.rescheduled_meetings} onChange={(v) => set('rescheduled_meetings', v)} /></div>
            </div>
          </SectionCard>

          {/* Section — Llamadas del día */}
          <SectionCard>
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold tracking-wide bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                Calls
              </span>
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                Day's calls
                {!callsLoading && dayCalls.length > 0 && (
                  <span className="ml-1">
                    ({dayCalls.length})
                    {allReported && <span className="ml-1 text-green-500">✓</span>}
                  </span>
                )}
              </span>
            </div>

            {callsLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-36 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-xl" />
                ))}
              </div>
            ) : dayCalls.length === 0 ? (
              <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center py-4">
                No calls found for this day
              </p>
            ) : (
              <div className="space-y-3">
                {dayCalls.map((call, i) => (
                  <CallReportCard
                    key={call.id}
                    call={call}
                    report={callReports[call.id]}
                    onUpdate={(field, value) => updateCallReport(call.id, field, value)}
                    index={i}
                    timezone={timezone}
                  />
                ))}
              </div>
            )}
          </SectionCard>

          {/* Section 2 — Ofertas & Cierres */}
          <SectionCard>
            <SectionHeader
              color="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
              label="Pipeline"
              sub="Offers & Closes"
            />
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><FieldLabel>Total offers</FieldLabel><NumberInput value={form.total_offers} onChange={(v) => set('total_offers', v)} /></div>
              <div><FieldLabel>Proposed offers</FieldLabel><NumberInput value={form.offers_proposed} onChange={(v) => set('offers_proposed', v)} /></div>
              <div><FieldLabel>Won deals</FieldLabel><NumberInput value={form.won_deals} onChange={(v) => set('won_deals', v)} /></div>
            </div>
            <div className="max-w-xs">
              <FieldLabel>Lost deals</FieldLabel>
              <NumberInput value={form.lost_deals} onChange={(v) => set('lost_deals', v)} />
            </div>
          </SectionCard>

          {/* Section 3 — Ingresos */}
          <SectionCard>
            <SectionHeader
              color="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              label="Cash"
              sub="Day's revenue"
            />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Cash collected today</FieldLabel>
                <NumberInput value={form.cash_collected} onChange={(v) => set('cash_collected', v)} prefix="$" placeholder="0.00" />
              </div>
              <div>
                <FieldLabel>Recurring / pipeline</FieldLabel>
                <NumberInput value={form.recurrent_cash} onChange={(v) => set('recurrent_cash', v)} prefix="$" placeholder="0.00" />
              </div>
            </div>
          </SectionCard>

          {/* Section 4 — Feedback */}
          <SectionCard>
            <SectionHeader
              color="bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
              label="Notas"
              sub="Notes & Feedback"
            />
            <textarea
              value={form.feedback}
              onChange={(e) => set('feedback', e.target.value)}
              placeholder="Detail each prospect: name, result, next step..."
              rows={5}
              style={{ minHeight: '120px' }}
              className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-y"
            />
          </SectionCard>

          <div className="pt-2 pb-8">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: '#185FA5' }}
            >
              {submitting ? 'Saving...' : 'Save daily report'}
            </button>
          </div>
        </form>
      </div>
    </PageTransition>
  )
}
