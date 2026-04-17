'use client'

import { useState, useMemo, useEffect } from 'react'
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

const CANCEL_REASONS = ['Financial', 'Lack of time', 'No results seen', 'Unmet expectations', 'Platform', 'Personal', 'Other']
const FRICCIONES = ['Implementation', 'Time', 'Emotional', 'Content', 'Platform']
const OPORTUNIDADES = ['Interest in 1:1', 'Interest in group', 'Interest in SPC', 'Support only']
const OBJECIONES = ['Financial', 'Time', 'Not a priority', 'No value seen', 'Other']
const TICKET_ORIGEN = ['Platform', 'Program', 'Communication', 'Expectations']

function today() {
  return new Date().toISOString().split('T')[0]
}

interface FormState {
  date: string
  csm_name: string
  r_solicitudes: string
  r_saved: string
  r_churn: string
  r_pausas: string
  r_cancel_reasons: string[]
  r_notas: string
  s_checkins: string
  s_riesgo: string
  s_wins: string
  s_dudas: string
  s_engagement: string
  s_fricciones: string[]
  s_notas: string
  g_contactados: string
  g_conversaciones: string
  g_llamadas: string
  g_seguimientos: string
  g_sin_respuesta: string
  g_referidos: string
  g_oportunidades: string[]
  g_objeciones: string[]
  g_notas: string
  t_recibidos: string
  t_resueltos: string
  t_pendientes: string
  t_escalados: string
  t_origen: string[]
  t_notas: string
  e_criticos: string
  e_coaches: string
  e_liderazgo: string
  e_resueltos: string
  e_caso_relevante: string
  c_wins: string
  c_riesgos: string
  c_accion1: string
  c_accion2: string
  c_accion3: string
}

const initialState: FormState = {
  date: today(),
  csm_name: '',
  r_solicitudes: '', r_saved: '', r_churn: '', r_pausas: '',
  r_cancel_reasons: [], r_notas: '',
  s_checkins: '', s_riesgo: '', s_wins: '', s_dudas: '',
  s_engagement: 'High', s_fricciones: [], s_notas: '',
  g_contactados: '', g_conversaciones: '', g_llamadas: '',
  g_seguimientos: '', g_sin_respuesta: '', g_referidos: '',
  g_oportunidades: [], g_objeciones: [], g_notas: '',
  t_recibidos: '', t_resueltos: '', t_pendientes: '', t_escalados: '',
  t_origen: [], t_notas: '',
  e_criticos: '', e_coaches: '', e_liderazgo: '', e_resueltos: '',
  e_caso_relevante: '',
  c_wins: '', c_riesgos: '', c_accion1: '', c_accion2: '', c_accion3: '',
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

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 mb-4', className)}>
      {children}
    </div>
  )
}

export default function NuevoReporteCsmPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [form, setForm] = useState<FormState>(initialState)
  const [submitting, setSubmitting] = useState(false)
  const [csmOptions, setCsmOptions] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/profiles?role=csm_ht')
      .then((r) => r.json())
      .then(({ profiles }) => {
        if (profiles) {
          const names = (profiles as { full_name: string | null; email: string | null }[])
            .map((p) => p.full_name || p.email || '')
            .filter(Boolean)
          setCsmOptions(names)
          if (names.length > 0) {
            setForm((prev) => ({ ...prev, csm_name: prev.csm_name || names[0] }))
          }
        }
      })
  }, [])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // Live KPIs
  const liveKPIs = useMemo(() => ({
    rescate: pct(n(form.r_saved), n(form.r_solicitudes)),
    churn: n(form.r_churn),
    tickets: pct(n(form.t_resueltos), n(form.t_recibidos)),
    contacto: pct(n(form.g_conversaciones), n(form.g_contactados)),
    llamadas: n(form.g_llamadas),
  }), [form.r_saved, form.r_solicitudes, form.r_churn, form.t_resueltos, form.t_recibidos, form.g_conversaciones, form.g_contactados, form.g_llamadas])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.date || !form.csm_name) {
      toast.error('Date and CSM name are required')
      return
    }
    setSubmitting(true)
    const { error } = await supabase.from('csm_reports').insert({
      date: form.date,
      csm_name: form.csm_name,
      r_solicitudes: n(form.r_solicitudes), r_saved: n(form.r_saved),
      r_churn: n(form.r_churn), r_pausas: n(form.r_pausas),
      r_cancel_reasons: form.r_cancel_reasons.length ? form.r_cancel_reasons : null,
      r_notas: form.r_notas || null,
      s_checkins: n(form.s_checkins), s_riesgo: n(form.s_riesgo),
      s_wins: n(form.s_wins), s_dudas: n(form.s_dudas),
      s_engagement: form.s_engagement,
      s_fricciones: form.s_fricciones.length ? form.s_fricciones : null,
      s_notas: form.s_notas || null,
      g_contactados: n(form.g_contactados), g_conversaciones: n(form.g_conversaciones),
      g_llamadas: n(form.g_llamadas), g_seguimientos: n(form.g_seguimientos),
      g_sin_respuesta: n(form.g_sin_respuesta), g_referidos: n(form.g_referidos),
      g_oportunidades: form.g_oportunidades.length ? form.g_oportunidades : null,
      g_objeciones: form.g_objeciones.length ? form.g_objeciones : null,
      g_notas: form.g_notas || null,
      t_recibidos: n(form.t_recibidos), t_resueltos: n(form.t_resueltos),
      t_pendientes: n(form.t_pendientes), t_escalados: n(form.t_escalados),
      t_origen: form.t_origen.length ? form.t_origen : null,
      t_notas: form.t_notas || null,
      e_criticos: n(form.e_criticos), e_coaches: n(form.e_coaches),
      e_liderazgo: n(form.e_liderazgo), e_resueltos: n(form.e_resueltos),
      e_caso_relevante: form.e_caso_relevante || null,
      c_wins: form.c_wins || null, c_riesgos: form.c_riesgos || null,
      c_accion1: form.c_accion1 || null, c_accion2: form.c_accion2 || null,
      c_accion3: form.c_accion3 || null,
    })
    setSubmitting(false)
    if (error) {
      toast.error(`Error saving: ${error.message}`)
    } else {
      toast.success('Report saved successfully')
      router.push('/equipo/csm')
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
            Back to CSM Dashboard
          </Link>
        </div>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Daily Closeout — Client Success</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Daily activity log and CSM metrics</p>
        </div>

        {/* Live KPI bar */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-6">
          {[
            { label: 'Rescue Rate', value: liveKPIs.rescate },
            { label: 'Daily Churn', value: String(liveKPIs.churn) },
            { label: 'Ticket Resolution', value: liveKPIs.tickets },
            { label: 'Graduate Contact', value: liveKPIs.contacto },
            { label: 'Scheduled Calls', value: String(liveKPIs.llamadas) },
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
                <FieldLabel>CSM</FieldLabel>
                <select
                  value={form.csm_name}
                  onChange={(e) => set('csm_name', e.target.value)}
                  className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                >
                  <option value="">Select CSM...</option>
                  {csmOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
          </SectionCard>

          {/* RETENCIÓN */}
          <SectionCard>
            <SectionHeader
              color="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
              label="🔴 RETENTION"
              sub="Active coaching programs"
            />
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><FieldLabel>Requests</FieldLabel><NumberInput value={form.r_solicitudes} onChange={(v) => set('r_solicitudes', v)} /></div>
              <div><FieldLabel>Saved</FieldLabel><NumberInput value={form.r_saved} onChange={(v) => set('r_saved', v)} /></div>
              <div><FieldLabel>Churn</FieldLabel><NumberInput value={form.r_churn} onChange={(v) => set('r_churn', v)} /></div>
            </div>
            <div className="mb-3">
              <FieldLabel>Pauses / Freezes</FieldLabel>
              <NumberInput value={form.r_pausas} onChange={(v) => set('r_pausas', v)} />
            </div>
            <div className="mb-3">
              <FieldLabel>Cancellation reasons</FieldLabel>
              <ChipSelector options={CANCEL_REASONS} value={form.r_cancel_reasons} onChange={(v) => set('r_cancel_reasons', v)} color="coral" />
            </div>
            <div>
              <FieldLabel>Notes</FieldLabel>
              <TextArea value={form.r_notas} onChange={(v) => set('r_notas', v)} placeholder="Observations on retention..." />
            </div>
          </SectionCard>

          {/* SEGUIMIENTO */}
          <SectionCard>
            <SectionHeader
              color="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
              label="🔵 FOLLOW-UP"
              sub="Active students"
            />
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><FieldLabel>Check-ins</FieldLabel><NumberInput value={form.s_checkins} onChange={(v) => set('s_checkins', v)} /></div>
              <div><FieldLabel>At risk</FieldLabel><NumberInput value={form.s_riesgo} onChange={(v) => set('s_riesgo', v)} /></div>
              <div><FieldLabel>Wins / Progress</FieldLabel><NumberInput value={form.s_wins} onChange={(v) => set('s_wins', v)} /></div>
            </div>
            <div className="mb-3">
              <FieldLabel>Resolved questions</FieldLabel>
              <NumberInput value={form.s_dudas} onChange={(v) => set('s_dudas', v)} />
            </div>
            <div className="mb-3">
              <FieldLabel>Overall engagement</FieldLabel>
              <SegmentedControl options={['High', 'Medium', 'Low']} value={form.s_engagement} onChange={(v) => set('s_engagement', v)} />
            </div>
            <div className="mb-3">
              <FieldLabel>Detected frictions</FieldLabel>
              <ChipSelector options={FRICCIONES} value={form.s_fricciones} onChange={(v) => set('s_fricciones', v)} color="blue" />
            </div>
            <div>
              <FieldLabel>Notes</FieldLabel>
              <TextArea value={form.s_notas} onChange={(v) => set('s_notas', v)} placeholder="Observations on follow-up..." />
            </div>
          </SectionCard>

          {/* GRADUADOS */}
          <SectionCard>
            <SectionHeader
              color="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
              label="🟣 GRADUATES"
              sub="Reactivation & follow-up"
            />
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><FieldLabel>Contacted</FieldLabel><NumberInput value={form.g_contactados} onChange={(v) => set('g_contactados', v)} /></div>
              <div><FieldLabel>Conversations</FieldLabel><NumberInput value={form.g_conversaciones} onChange={(v) => set('g_conversaciones', v)} /></div>
              <div><FieldLabel>Sched. calls</FieldLabel><NumberInput value={form.g_llamadas} onChange={(v) => set('g_llamadas', v)} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><FieldLabel>Follow-ups</FieldLabel><NumberInput value={form.g_seguimientos} onChange={(v) => set('g_seguimientos', v)} /></div>
              <div><FieldLabel>No reply</FieldLabel><NumberInput value={form.g_sin_respuesta} onChange={(v) => set('g_sin_respuesta', v)} /></div>
              <div><FieldLabel>Referrals</FieldLabel><NumberInput value={form.g_referidos} onChange={(v) => set('g_referidos', v)} /></div>
            </div>
            <div className="mb-3">
              <FieldLabel>Detected opportunities</FieldLabel>
              <ChipSelector options={OPORTUNIDADES} value={form.g_oportunidades} onChange={(v) => set('g_oportunidades', v)} color="purple" />
            </div>
            <div className="mb-3">
              <FieldLabel>Found objections</FieldLabel>
              <ChipSelector options={OBJECIONES} value={form.g_objeciones} onChange={(v) => set('g_objeciones', v)} color="coral" />
            </div>
            <div>
              <FieldLabel>Notes</FieldLabel>
              <TextArea value={form.g_notas} onChange={(v) => set('g_notas', v)} placeholder="Observations on graduates..." />
            </div>
          </SectionCard>

          {/* SOPORTE */}
          <SectionCard>
            <SectionHeader
              color="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              label="🟡 SUPPORT"
              sub="Tickets"
            />
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><FieldLabel>Received</FieldLabel><NumberInput value={form.t_recibidos} onChange={(v) => set('t_recibidos', v)} /></div>
              <div><FieldLabel>Resolved</FieldLabel><NumberInput value={form.t_resueltos} onChange={(v) => set('t_resueltos', v)} /></div>
              <div><FieldLabel>Pending</FieldLabel><NumberInput value={form.t_pendientes} onChange={(v) => set('t_pendientes', v)} /></div>
            </div>
            <div className="mb-3">
              <FieldLabel>Escalated</FieldLabel>
              <NumberInput value={form.t_escalados} onChange={(v) => set('t_escalados', v)} />
            </div>
            <div className="mb-3">
              <FieldLabel>Ticket origin</FieldLabel>
              <ChipSelector options={TICKET_ORIGEN} value={form.t_origen} onChange={(v) => set('t_origen', v)} color="amber" />
            </div>
            <div>
              <FieldLabel>Notes</FieldLabel>
              <TextArea value={form.t_notas} onChange={(v) => set('t_notas', v)} placeholder="Observations on tickets..." />
            </div>
          </SectionCard>

          {/* ESCALAMIENTOS */}
          <SectionCard>
            <SectionHeader
              color="bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
              label="⚫ ESCALATIONS"
              sub="Critical cases"
            />
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><FieldLabel>Critical</FieldLabel><NumberInput value={form.e_criticos} onChange={(v) => set('e_criticos', v)} /></div>
              <div><FieldLabel>To coaches</FieldLabel><NumberInput value={form.e_coaches} onChange={(v) => set('e_coaches', v)} /></div>
              <div><FieldLabel>To leadership</FieldLabel><NumberInput value={form.e_liderazgo} onChange={(v) => set('e_liderazgo', v)} /></div>
            </div>
            <div className="mb-3">
              <FieldLabel>Resolved</FieldLabel>
              <NumberInput value={form.e_resueltos} onChange={(v) => set('e_resueltos', v)} />
            </div>
            <div>
              <FieldLabel>Key case of the day</FieldLabel>
              <TextArea value={form.e_caso_relevante} onChange={(v) => set('e_caso_relevante', v)} placeholder="Description of the most relevant case..." />
            </div>
          </SectionCard>

          {/* CIERRE DEL DÍA */}
          <SectionCard>
            <SectionHeader
              color="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
              label="🟢 DAILY CLOSEOUT"
              sub="Summary"
            />
            <div className="mb-3">
              <FieldLabel>What went well today?</FieldLabel>
              <TextArea value={form.c_wins} onChange={(v) => set('c_wins', v)} placeholder="Wins and achievements of the day..." />
            </div>
            <div className="mb-4">
              <FieldLabel>What should we watch?</FieldLabel>
              <TextArea value={form.c_riesgos} onChange={(v) => set('c_riesgos', v)} placeholder="Risks and situations to monitor..." />
            </div>
            <FieldLabel>Top 3 actions for tomorrow</FieldLabel>
            <div className="space-y-2">
              <TextInput value={form.c_accion1} onChange={(v) => set('c_accion1', v)} placeholder="1. Priority action..." />
              <TextInput value={form.c_accion2} onChange={(v) => set('c_accion2', v)} placeholder="2. Priority action..." />
              <TextInput value={form.c_accion3} onChange={(v) => set('c_accion3', v)} placeholder="3. Priority action..." />
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
