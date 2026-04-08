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

const CSM_OPTIONS = ['Ana Sofía', 'Otro CSM']

const CANCEL_REASONS = ['Económica', 'Falta de tiempo', 'No ven resultados', 'Expectativas no cumplidas', 'Plataforma', 'Personal', 'Otro']
const FRICCIONES = ['Implementación', 'Tiempo', 'Emocional', 'Contenido', 'Plataforma']
const OPORTUNIDADES = ['Interés en 1:1', 'Interés en grupal', 'Interés en SPC', 'Solo soporte']
const OBJECIONES = ['Económica', 'Tiempo', 'No es prioridad', 'No ven valor', 'Otro']
const TICKET_ORIGEN = ['Plataforma', 'Programa', 'Comunicación', 'Expectativas']

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
  csm_name: 'Ana Sofía',
  r_solicitudes: '', r_saved: '', r_churn: '', r_pausas: '',
  r_cancel_reasons: [], r_notas: '',
  s_checkins: '', s_riesgo: '', s_wins: '', s_dudas: '',
  s_engagement: 'Alto', s_fricciones: [], s_notas: '',
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
      toast.error('Fecha y nombre CSM son requeridos')
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
      toast.error(`Error al guardar: ${error.message}`)
    } else {
      toast.success('Reporte guardado correctamente')
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
            Volver al dashboard CSM
          </Link>
        </div>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Cierre diario — Client Success</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Registro diario de actividad y métricas CSM</p>
        </div>

        {/* Live KPI bar */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-6">
          {[
            { label: 'Tasa de rescate', value: liveKPIs.rescate },
            { label: 'Churn del día', value: String(liveKPIs.churn) },
            { label: 'Resolución tickets', value: liveKPIs.tickets },
            { label: 'Contacto graduados', value: liveKPIs.contacto },
            { label: 'Llamadas agendadas', value: String(liveKPIs.llamadas) },
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
                <FieldLabel>Fecha</FieldLabel>
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
                  {CSM_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
          </SectionCard>

          {/* RETENCIÓN */}
          <SectionCard>
            <SectionHeader
              color="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
              label="🔴 RETENCIÓN"
              sub="Coaching programs activos"
            />
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><FieldLabel>Solicitudes</FieldLabel><NumberInput value={form.r_solicitudes} onChange={(v) => set('r_solicitudes', v)} /></div>
              <div><FieldLabel>Salvadas</FieldLabel><NumberInput value={form.r_saved} onChange={(v) => set('r_saved', v)} /></div>
              <div><FieldLabel>Churn</FieldLabel><NumberInput value={form.r_churn} onChange={(v) => set('r_churn', v)} /></div>
            </div>
            <div className="mb-3">
              <FieldLabel>Pausas / Freezes</FieldLabel>
              <NumberInput value={form.r_pausas} onChange={(v) => set('r_pausas', v)} />
            </div>
            <div className="mb-3">
              <FieldLabel>Razones de cancelación</FieldLabel>
              <ChipSelector options={CANCEL_REASONS} value={form.r_cancel_reasons} onChange={(v) => set('r_cancel_reasons', v)} color="coral" />
            </div>
            <div>
              <FieldLabel>Notas</FieldLabel>
              <TextArea value={form.r_notas} onChange={(v) => set('r_notas', v)} placeholder="Observaciones sobre retención..." />
            </div>
          </SectionCard>

          {/* SEGUIMIENTO */}
          <SectionCard>
            <SectionHeader
              color="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
              label="🔵 SEGUIMIENTO"
              sub="Estudiantes activos"
            />
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><FieldLabel>Check-ins</FieldLabel><NumberInput value={form.s_checkins} onChange={(v) => set('s_checkins', v)} /></div>
              <div><FieldLabel>En riesgo</FieldLabel><NumberInput value={form.s_riesgo} onChange={(v) => set('s_riesgo', v)} /></div>
              <div><FieldLabel>Wins / Avances</FieldLabel><NumberInput value={form.s_wins} onChange={(v) => set('s_wins', v)} /></div>
            </div>
            <div className="mb-3">
              <FieldLabel>Dudas resueltas</FieldLabel>
              <NumberInput value={form.s_dudas} onChange={(v) => set('s_dudas', v)} />
            </div>
            <div className="mb-3">
              <FieldLabel>Engagement general</FieldLabel>
              <SegmentedControl options={['Alto', 'Medio', 'Bajo']} value={form.s_engagement} onChange={(v) => set('s_engagement', v)} />
            </div>
            <div className="mb-3">
              <FieldLabel>Fricciones detectadas</FieldLabel>
              <ChipSelector options={FRICCIONES} value={form.s_fricciones} onChange={(v) => set('s_fricciones', v)} color="blue" />
            </div>
            <div>
              <FieldLabel>Notas</FieldLabel>
              <TextArea value={form.s_notas} onChange={(v) => set('s_notas', v)} placeholder="Observaciones sobre seguimiento..." />
            </div>
          </SectionCard>

          {/* GRADUADOS */}
          <SectionCard>
            <SectionHeader
              color="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
              label="🟣 GRADUADOS"
              sub="Reactivación & seguimiento"
            />
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><FieldLabel>Contactados</FieldLabel><NumberInput value={form.g_contactados} onChange={(v) => set('g_contactados', v)} /></div>
              <div><FieldLabel>Conversaciones</FieldLabel><NumberInput value={form.g_conversaciones} onChange={(v) => set('g_conversaciones', v)} /></div>
              <div><FieldLabel>Llamadas agend.</FieldLabel><NumberInput value={form.g_llamadas} onChange={(v) => set('g_llamadas', v)} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><FieldLabel>Seguimientos</FieldLabel><NumberInput value={form.g_seguimientos} onChange={(v) => set('g_seguimientos', v)} /></div>
              <div><FieldLabel>Sin respuesta</FieldLabel><NumberInput value={form.g_sin_respuesta} onChange={(v) => set('g_sin_respuesta', v)} /></div>
              <div><FieldLabel>Referidos</FieldLabel><NumberInput value={form.g_referidos} onChange={(v) => set('g_referidos', v)} /></div>
            </div>
            <div className="mb-3">
              <FieldLabel>Oportunidades detectadas</FieldLabel>
              <ChipSelector options={OPORTUNIDADES} value={form.g_oportunidades} onChange={(v) => set('g_oportunidades', v)} color="purple" />
            </div>
            <div className="mb-3">
              <FieldLabel>Objeciones encontradas</FieldLabel>
              <ChipSelector options={OBJECIONES} value={form.g_objeciones} onChange={(v) => set('g_objeciones', v)} color="coral" />
            </div>
            <div>
              <FieldLabel>Notas</FieldLabel>
              <TextArea value={form.g_notas} onChange={(v) => set('g_notas', v)} placeholder="Observaciones sobre graduados..." />
            </div>
          </SectionCard>

          {/* SOPORTE */}
          <SectionCard>
            <SectionHeader
              color="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              label="🟡 SOPORTE"
              sub="Tickets"
            />
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><FieldLabel>Recibidos</FieldLabel><NumberInput value={form.t_recibidos} onChange={(v) => set('t_recibidos', v)} /></div>
              <div><FieldLabel>Resueltos</FieldLabel><NumberInput value={form.t_resueltos} onChange={(v) => set('t_resueltos', v)} /></div>
              <div><FieldLabel>Pendientes</FieldLabel><NumberInput value={form.t_pendientes} onChange={(v) => set('t_pendientes', v)} /></div>
            </div>
            <div className="mb-3">
              <FieldLabel>Escalados</FieldLabel>
              <NumberInput value={form.t_escalados} onChange={(v) => set('t_escalados', v)} />
            </div>
            <div className="mb-3">
              <FieldLabel>Origen de tickets</FieldLabel>
              <ChipSelector options={TICKET_ORIGEN} value={form.t_origen} onChange={(v) => set('t_origen', v)} color="amber" />
            </div>
            <div>
              <FieldLabel>Notas</FieldLabel>
              <TextArea value={form.t_notas} onChange={(v) => set('t_notas', v)} placeholder="Observaciones sobre tickets..." />
            </div>
          </SectionCard>

          {/* ESCALAMIENTOS */}
          <SectionCard>
            <SectionHeader
              color="bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
              label="⚫ ESCALAMIENTOS"
              sub="Casos críticos"
            />
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><FieldLabel>Críticos</FieldLabel><NumberInput value={form.e_criticos} onChange={(v) => set('e_criticos', v)} /></div>
              <div><FieldLabel>A coaches</FieldLabel><NumberInput value={form.e_coaches} onChange={(v) => set('e_coaches', v)} /></div>
              <div><FieldLabel>A liderazgo</FieldLabel><NumberInput value={form.e_liderazgo} onChange={(v) => set('e_liderazgo', v)} /></div>
            </div>
            <div className="mb-3">
              <FieldLabel>Resueltos</FieldLabel>
              <NumberInput value={form.e_resueltos} onChange={(v) => set('e_resueltos', v)} />
            </div>
            <div>
              <FieldLabel>Caso relevante del día</FieldLabel>
              <TextArea value={form.e_caso_relevante} onChange={(v) => set('e_caso_relevante', v)} placeholder="Descripción del caso más relevante..." />
            </div>
          </SectionCard>

          {/* CIERRE DEL DÍA */}
          <SectionCard>
            <SectionHeader
              color="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
              label="🟢 CIERRE DEL DÍA"
              sub="Resumen"
            />
            <div className="mb-3">
              <FieldLabel>¿Qué salió bien hoy?</FieldLabel>
              <TextArea value={form.c_wins} onChange={(v) => set('c_wins', v)} placeholder="Victorias y logros del día..." />
            </div>
            <div className="mb-4">
              <FieldLabel>¿Qué hay que vigilar?</FieldLabel>
              <TextArea value={form.c_riesgos} onChange={(v) => set('c_riesgos', v)} placeholder="Riesgos y situaciones a monitorear..." />
            </div>
            <FieldLabel>Top 3 acciones para mañana</FieldLabel>
            <div className="space-y-2">
              <TextInput value={form.c_accion1} onChange={(v) => set('c_accion1', v)} placeholder="1. Acción prioritaria..." />
              <TextInput value={form.c_accion2} onChange={(v) => set('c_accion2', v)} placeholder="2. Acción prioritaria..." />
              <TextInput value={form.c_accion3} onChange={(v) => set('c_accion3', v)} placeholder="3. Acción prioritaria..." />
            </div>
          </SectionCard>

          <div className="pt-2 pb-8">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: '#1D9E75' }}
            >
              {submitting ? 'Guardando...' : 'Guardar cierre del día'}
            </button>
          </div>
        </form>
      </div>
    </PageTransition>
  )
}
