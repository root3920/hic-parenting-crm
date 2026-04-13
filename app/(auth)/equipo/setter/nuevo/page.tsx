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
import { useProfile } from '@/hooks/useProfile'

export const dynamic = 'force-dynamic'

const DEFAULT_SETTERS = ['Valentina Llano']

const DISQUAL_REASONS = ['Económica', 'Tire kicker', 'No es el decisor', 'Mala actitud', 'No fit', 'Otro']
const HIGHS_OPTIONS = ['Propuesta de llamada', 'Filtro de leads', 'Empatía', 'Seguimiento', 'Manejo de objeciones', 'Velocidad de respuesta', 'Cierre']
const LOWS_OPTIONS = ['Tire kickers', 'Seguimiento tardío', 'Calificación', 'Manejo del tiempo', 'Comunicación', 'Outbound bajo']

function today() {
  return new Date().toISOString().split('T')[0]
}

interface FormState {
  date: string
  setter_name: string
  hours_worked: string
  // Conversaciones
  total_convos: string
  followups: string
  inbound: string
  outbound: string
  no_reply: string
  new_leads: string
  // Pipeline
  calls_proposed: string
  calls_booked: string
  calls_no_reply: string
  calls_followup: string
  // Calificación
  qual_apps: string
  disqual_apps: string
  waiting: string
  requalified: string
  disqual_reasons: string[]
  // SPC
  spc_invites: string
  spc_new: string
  spc_interested: string
  // Autoevaluación
  performance_score: number
  highs: string[]
  lows: string[]
  notas: string
}

const initialState: FormState = {
  date: today(),
  setter_name: DEFAULT_SETTERS[0],
  hours_worked: '8',
  total_convos: '', followups: '', inbound: '', outbound: '', no_reply: '', new_leads: '',
  calls_proposed: '', calls_booked: '', calls_no_reply: '', calls_followup: '',
  qual_apps: '', disqual_apps: '', waiting: '', requalified: 'N/A', disqual_reasons: [],
  spc_invites: '', spc_new: '', spc_interested: '',
  performance_score: 7, highs: [], lows: [], notas: '',
}

function n(v: string) { return parseInt(v) || 0 }
function pct(num: number, den: number) {
  return den > 0 ? `${((num / den) * 100).toFixed(1)}%` : '—'
}
function dec(num: number, den: number) {
  return den > 0 ? (num / den).toFixed(1) : '—'
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

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 mb-4', className)}>
      {children}
    </div>
  )
}

export default function NuevoReporteSetterPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [form, setForm] = useState<FormState>(initialState)
  const [submitting, setSubmitting] = useState(false)
  const [setterOptions, setSetterOptions] = useState<string[]>(DEFAULT_SETTERS)
  const { profile } = useProfile()

  // Pre-fill setter name from profile when available
  useEffect(() => {
    if (profile?.setter_name) {
      setForm((prev) => ({ ...prev, setter_name: profile.setter_name! }))
    }
  }, [profile])

  // Fetch distinct setter names from DB and merge with defaults
  useEffect(() => {
    supabase
      .from('setter_daily_reports')
      .select('setter_name')
      .then(({ data }) => {
        if (data) {
          const dbNames = data.map((r: { setter_name: string }) => r.setter_name)
          const merged = Array.from(new Set([...DEFAULT_SETTERS, ...dbNames]))
          setSetterOptions(merged)
        }
      })
  }, [supabase])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // Live KPIs
  const liveKPIs = useMemo(() => ({
    convRate: pct(n(form.calls_booked), n(form.total_convos)),
    bookingRate: pct(n(form.calls_booked), n(form.calls_proposed)),
    qualRate: pct(n(form.qual_apps), n(form.qual_apps) + n(form.disqual_apps)),
    convosPerHora: dec(n(form.total_convos), n(form.hours_worked)),
    spcConvRate: pct(n(form.spc_new), n(form.spc_invites)),
  }), [form.calls_booked, form.total_convos, form.calls_proposed, form.qual_apps, form.disqual_apps, form.hours_worked, form.spc_new, form.spc_invites])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.date || !form.setter_name) {
      toast.error('Fecha y nombre del setter son requeridos')
      return
    }
    setSubmitting(true)
    const { error } = await supabase.from('setter_daily_reports').insert({
      date: form.date,
      setter_name: form.setter_name,
      hours_worked: n(form.hours_worked),
      total_convos: n(form.total_convos),
      followups: n(form.followups),
      inbound: n(form.inbound),
      outbound: n(form.outbound),
      no_reply: n(form.no_reply),
      new_leads: n(form.new_leads),
      calls_proposed: n(form.calls_proposed),
      calls_booked: n(form.calls_booked),
      calls_no_reply: n(form.calls_no_reply),
      calls_followup: n(form.calls_followup),
      qual_apps: n(form.qual_apps),
      disqual_apps: n(form.disqual_apps),
      waiting: n(form.waiting),
      requalified: form.requalified,
      disqual_reasons: form.disqual_reasons.length ? form.disqual_reasons : null,
      spc_invites: n(form.spc_invites),
      spc_new: n(form.spc_new),
      spc_interested: n(form.spc_interested),
      performance_score: form.performance_score,
      highs: form.highs.length ? form.highs : null,
      lows: form.lows.length ? form.lows : null,
      notas: form.notas || null,
    })
    setSubmitting(false)
    if (error) {
      toast.error(`Error al guardar: ${error.message}`)
    } else {
      toast.success('Reporte guardado correctamente')
      router.push('/equipo/setter')
    }
  }

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/equipo/setter"
            className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver al dashboard Setter
          </Link>
        </div>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Reporte diario — Setting Team</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Registro diario de actividad y métricas setter</p>
        </div>

        {/* Live KPI bar */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-6">
          {[
            { label: 'Conv Rate', value: liveKPIs.convRate },
            { label: 'Tasa agendamiento', value: liveKPIs.bookingRate },
            { label: '% Calificados', value: liveKPIs.qualRate },
            { label: 'Convos/hora', value: liveKPIs.convosPerHora },
            { label: 'Conv SPC', value: liveKPIs.spcConvRate },
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
            <div className="grid grid-cols-3 gap-4">
              <div>
                <FieldLabel>Fecha</FieldLabel>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => set('date', e.target.value)}
                  className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                />
              </div>
              <div>
                <FieldLabel>Setter</FieldLabel>
                <select
                  value={form.setter_name}
                  onChange={(e) => set('setter_name', e.target.value)}
                  className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                >
                  {setterOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel>Horas trabajadas</FieldLabel>
                <NumberInput value={form.hours_worked} onChange={(v) => set('hours_worked', v)} placeholder="8" />
              </div>
            </div>
          </SectionCard>

          {/* SECTION 1 — Conversaciones */}
          <SectionCard>
            <SectionHeader
              color="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
              label="Actividad"
              sub="Conversaciones del día"
            />
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><FieldLabel>Total convos</FieldLabel><NumberInput value={form.total_convos} onChange={(v) => set('total_convos', v)} /></div>
              <div><FieldLabel>Followups</FieldLabel><NumberInput value={form.followups} onChange={(v) => set('followups', v)} /></div>
              <div><FieldLabel>Inbound</FieldLabel><NumberInput value={form.inbound} onChange={(v) => set('inbound', v)} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><FieldLabel>Outbound</FieldLabel><NumberInput value={form.outbound} onChange={(v) => set('outbound', v)} /></div>
              <div><FieldLabel>Sin respuesta</FieldLabel><NumberInput value={form.no_reply} onChange={(v) => set('no_reply', v)} /></div>
              <div><FieldLabel>Nuevos leads</FieldLabel><NumberInput value={form.new_leads} onChange={(v) => set('new_leads', v)} /></div>
            </div>
          </SectionCard>

          {/* SECTION 2 — Pipeline de llamadas */}
          <SectionCard>
            <SectionHeader
              color="bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300"
              label="Llamadas"
              sub="Pipeline de llamadas"
            />
            <div className="grid grid-cols-2 gap-3">
              <div><FieldLabel>Llamadas propuestas</FieldLabel><NumberInput value={form.calls_proposed} onChange={(v) => set('calls_proposed', v)} /></div>
              <div><FieldLabel>Llamadas agendadas</FieldLabel><NumberInput value={form.calls_booked} onChange={(v) => set('calls_booked', v)} /></div>
              <div><FieldLabel>Propuestas sin respuesta</FieldLabel><NumberInput value={form.calls_no_reply} onChange={(v) => set('calls_no_reply', v)} /></div>
              <div><FieldLabel>En seguimiento</FieldLabel><NumberInput value={form.calls_followup} onChange={(v) => set('calls_followup', v)} /></div>
            </div>
          </SectionCard>

          {/* SECTION 3 — Leads calificados */}
          <SectionCard>
            <SectionHeader
              color="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
              label="Calificación"
              sub="Leads calificados"
            />
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div><FieldLabel>Calificados</FieldLabel><NumberInput value={form.qual_apps} onChange={(v) => set('qual_apps', v)} /></div>
              <div><FieldLabel>Descalificados</FieldLabel><NumberInput value={form.disqual_apps} onChange={(v) => set('disqual_apps', v)} /></div>
              <div><FieldLabel>En espera</FieldLabel><NumberInput value={form.waiting} onChange={(v) => set('waiting', v)} /></div>
            </div>
            <div className="mb-4">
              <FieldLabel>Recalificado</FieldLabel>
              <SegmentedControl options={['Sí', 'No', 'N/A']} value={form.requalified} onChange={(v) => set('requalified', v)} />
            </div>
            <div>
              <FieldLabel>Razones de descalificación</FieldLabel>
              <ChipSelector options={DISQUAL_REASONS} value={form.disqual_reasons} onChange={(v) => set('disqual_reasons', v)} color="coral" />
            </div>
          </SectionCard>

          {/* SECTION 4 — SPC */}
          <SectionCard className="border-purple-300 dark:border-purple-700 border-l-4 border-l-purple-500">
            <SectionHeader
              color="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
              label="SPC"
              sub="Secure Parent Collective"
            />
            <div className="grid grid-cols-3 gap-3">
              <div><FieldLabel>Invitaciones</FieldLabel><NumberInput value={form.spc_invites} onChange={(v) => set('spc_invites', v)} /></div>
              <div><FieldLabel>Nuevos miembros</FieldLabel><NumberInput value={form.spc_new} onChange={(v) => set('spc_new', v)} /></div>
              <div><FieldLabel>Interesados</FieldLabel><NumberInput value={form.spc_interested} onChange={(v) => set('spc_interested', v)} /></div>
            </div>
          </SectionCard>

          {/* SECTION 5 — Autoevaluación */}
          <SectionCard>
            <SectionHeader
              color="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              label="Rendimiento"
              sub="Autoevaluación del día"
            />
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <FieldLabel>Performance del día</FieldLabel>
                <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{form.performance_score}/10</span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={form.performance_score}
                onChange={(e) => set('performance_score', Number(e.target.value))}
                className="w-full accent-amber-500"
              />
              <div className="flex justify-between text-xs text-zinc-400 mt-1">
                <span>1</span><span>5</span><span>10</span>
              </div>
            </div>
            <div className="mb-4">
              <FieldLabel>¿Qué salió bien?</FieldLabel>
              <ChipSelector options={HIGHS_OPTIONS} value={form.highs} onChange={(v) => set('highs', v)} color="teal" />
            </div>
            <div className="mb-4">
              <FieldLabel>¿Qué hay que mejorar?</FieldLabel>
              <ChipSelector options={LOWS_OPTIONS} value={form.lows} onChange={(v) => set('lows', v)} color="amber" />
            </div>
            <div>
              <FieldLabel>Notas del día</FieldLabel>
              <TextArea value={form.notas} onChange={(v) => set('notas', v)} placeholder="Observaciones, aprendizajes del día..." />
            </div>
          </SectionCard>

          <div className="pt-2 pb-8">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: '#185FA5' }}
            >
              {submitting ? 'Guardando...' : 'Guardar reporte del día'}
            </button>
          </div>
        </form>
      </div>
    </PageTransition>
  )
}
