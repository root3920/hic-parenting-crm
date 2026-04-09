'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { PageTransition } from '@/components/motion/PageTransition'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const DEFAULT_CLOSERS = ['Cali Luna', 'Marcela HIC Parenting']

function today() {
  return new Date().toISOString().split('T')[0]
}

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

const initialState: FormState = {
  date: today(),
  closer_name: DEFAULT_CLOSERS[0],
  total_meetings: '', showed_meetings: '', cancelled_meetings: '',
  no_show_meetings: '', rescheduled_meetings: '', followup_meetings: '',
  total_offers: '', offers_proposed: '', won_deals: '', lost_deals: '',
  cash_collected: '', recurrent_cash: '',
  feedback: '',
}

function n(v: string) { return parseInt(v) || 0 }
function nf(v: string) { return parseFloat(v) || 0 }

function pct(num: number, den: number) {
  return den > 0 ? `${((num / den) * 100).toFixed(1)}%` : '—'
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

export default function NuevoReporteCloserPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [form, setForm] = useState<FormState>(initialState)
  const [submitting, setSubmitting] = useState(false)
  const [closerOptions, setCloserOptions] = useState<string[]>(DEFAULT_CLOSERS)

  useEffect(() => {
    supabase
      .from('closer_daily_reports')
      .select('closer_name')
      .then(({ data }) => {
        if (data) {
          const dbNames = data.map((r: { closer_name: string }) => r.closer_name)
          const merged = Array.from(new Set([...DEFAULT_CLOSERS, ...dbNames])).sort()
          setCloserOptions(merged)
        }
      })
  }, [supabase])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const liveKPIs = useMemo(() => ({
    showRate: pct(n(form.showed_meetings), n(form.total_meetings)),
    noShowRate: pct(n(form.no_show_meetings), n(form.total_meetings)),
    offerRate: pct(n(form.offers_proposed), n(form.showed_meetings)),
    closeRate: pct(n(form.won_deals), n(form.offers_proposed)),
  }), [form.showed_meetings, form.total_meetings, form.no_show_meetings, form.offers_proposed, form.won_deals])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.date || !form.closer_name) {
      toast.error('Fecha y nombre del closer son requeridos')
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
    setSubmitting(false)
    if (error) {
      toast.error(`Error al guardar: ${error.message}`)
    } else {
      toast.success('Reporte guardado correctamente')
      router.push('/equipo/closer')
    }
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
            Volver al dashboard Closer
          </Link>
        </div>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Reporte diario — Closer</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Registro diario de actividad y resultados de cierre</p>
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
                <FieldLabel>Fecha</FieldLabel>
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
              sub="Reuniones del día"
            />
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><FieldLabel>Total meetings</FieldLabel><NumberInput value={form.total_meetings} onChange={(v) => set('total_meetings', v)} /></div>
              <div><FieldLabel>Showed</FieldLabel><NumberInput value={form.showed_meetings} onChange={(v) => set('showed_meetings', v)} /></div>
              <div><FieldLabel>Follow-up</FieldLabel><NumberInput value={form.followup_meetings} onChange={(v) => set('followup_meetings', v)} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><FieldLabel>Canceladas</FieldLabel><NumberInput value={form.cancelled_meetings} onChange={(v) => set('cancelled_meetings', v)} /></div>
              <div><FieldLabel>No-show</FieldLabel><NumberInput value={form.no_show_meetings} onChange={(v) => set('no_show_meetings', v)} /></div>
              <div><FieldLabel>Reagendadas</FieldLabel><NumberInput value={form.rescheduled_meetings} onChange={(v) => set('rescheduled_meetings', v)} /></div>
            </div>
          </SectionCard>

          {/* Section 2 — Ofertas & Cierres */}
          <SectionCard>
            <SectionHeader
              color="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
              label="Pipeline"
              sub="Ofertas & Cierres"
            />
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><FieldLabel>Total ofertas</FieldLabel><NumberInput value={form.total_offers} onChange={(v) => set('total_offers', v)} /></div>
              <div><FieldLabel>Ofertas propuestas</FieldLabel><NumberInput value={form.offers_proposed} onChange={(v) => set('offers_proposed', v)} /></div>
              <div><FieldLabel>Deals ganados</FieldLabel><NumberInput value={form.won_deals} onChange={(v) => set('won_deals', v)} /></div>
            </div>
            <div className="max-w-xs">
              <FieldLabel>Deals perdidos</FieldLabel>
              <NumberInput value={form.lost_deals} onChange={(v) => set('lost_deals', v)} />
            </div>
          </SectionCard>

          {/* Section 3 — Ingresos */}
          <SectionCard>
            <SectionHeader
              color="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              label="Cash"
              sub="Ingresos del día"
            />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Cash collected hoy</FieldLabel>
                <NumberInput value={form.cash_collected} onChange={(v) => set('cash_collected', v)} prefix="$" placeholder="0.00" />
              </div>
              <div>
                <FieldLabel>Recurrente / pipeline</FieldLabel>
                <NumberInput value={form.recurrent_cash} onChange={(v) => set('recurrent_cash', v)} prefix="$" placeholder="0.00" />
              </div>
            </div>
          </SectionCard>

          {/* Section 4 — Feedback */}
          <SectionCard>
            <SectionHeader
              color="bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
              label="Notas"
              sub="Notas & Feedback"
            />
            <textarea
              value={form.feedback}
              onChange={(e) => set('feedback', e.target.value)}
              placeholder="Detalla cada prospecto: nombre, resultado, próximo paso..."
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
              {submitting ? 'Guardando...' : 'Guardar reporte del día'}
            </button>
          </div>
        </form>
      </div>
    </PageTransition>
  )
}
