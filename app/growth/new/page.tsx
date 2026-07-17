'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export const dynamic = 'force-dynamic'

const SIGNAL_OPTIONS = [
  'Feeling discouraged',
  'Overwhelmed',
  'Highly motivated',
  'Consistently implementing',
  'Struggling with implementation',
  'Emotionally disconnected',
  'Experiencing breakthroughs',
  'At retention risk',
  'Good graduate candidate',
  'Needs additional support',
]

/* ─── Styling ───────────────────────────────────────────────── */

const inputClass =
  'w-full px-3 py-2 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30'

const textareaClass =
  'w-full px-3 py-2 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30 mt-2'

/* ─── Sub-components ────────────────────────────────────────── */

function FormSection({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm">
      <div className="px-5 pt-5 pb-0 space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-zinc-200">
          <span className="flex items-center justify-center h-7 w-7 rounded-full bg-[#ffbd59] text-[#1a1a2e] text-xs font-bold">{number}</span>
          <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
        </div>
        <div className="pb-5 space-y-4">{children}</div>
      </div>
    </div>
  )
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-zinc-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}

function ScaleButtons({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
        const isSelected = value === n
        let bg = 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-400'
        if (isSelected) {
          if (n <= 3) bg = 'bg-red-500 text-white border-red-500'
          else if (n <= 6) bg = 'bg-amber-500 text-white border-amber-500'
          else bg = 'bg-emerald-500 text-white border-emerald-500'
        }
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`h-9 w-9 rounded-lg border text-sm font-semibold transition-colors ${bg}`}
          >
            {n}
          </button>
        )
      })}
    </div>
  )
}

function SegmentToggle({
  options,
  value,
  onChange,
  colors,
}: {
  options: string[]
  value: string
  onChange: (v: string) => void
  colors?: Record<string, string>
}) {
  return (
    <div className="inline-flex gap-1 bg-zinc-100 rounded-xl p-1">
      {options.map(opt => {
        const isActive = value === opt
        const activeColor = colors?.[opt]
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isActive
                ? activeColor
                  ? `${activeColor} text-white`
                  : 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}

function CoachCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [coaches, setCoaches] = useState<{ full_name: string }[]>([])
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState(value)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/growth/coaches')
      .then(r => r.ok ? r.json() : [])
      .then(setCoaches)
      .catch(() => {})
  }, [])

  useEffect(() => { setSearch(value) }, [value])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = useMemo(() => {
    if (!search) return coaches
    const q = search.toLowerCase()
    return coaches.filter(c => c.full_name.toLowerCase().includes(q))
  }, [coaches, search])

  function handleSelect(name: string) {
    onChange(name)
    setSearch(name)
    setOpen(false)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setSearch(v)
    onChange(v)
    if (!open) setOpen(true)
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        value={search}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        required
        className={inputClass}
        placeholder="Select or type coach name..."
        autoComplete="off"
      />

      <AnimatePresence>
        {open && filtered.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 top-full mt-1 w-full max-h-[200px] overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg"
          >
            {filtered.map(c => (
              <button
                key={c.full_name}
                type="button"
                onClick={() => handleSelect(c.full_name)}
                className="w-full text-left px-3 py-2.5 hover:bg-zinc-50 transition-colors border-b border-zinc-100 last:border-0"
              >
                <p className="text-sm font-medium text-zinc-900">{c.full_name}</p>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Client Combobox (searches active students) ────────────── */

interface ActiveStudent {
  id: string
  first_name: string
  last_name: string | null
  email: string | null
}

function ClientCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [studentOptions, setStudentOptions] = useState<ActiveStudent[]>([])
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState(value)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const searchStudents = async (query: string) => {
    if (query.length < 1) {
      setStudentOptions([])
      return
    }
    try {
      const res = await fetch(`/api/growth/students?search=${encodeURIComponent(query)}`)
      const data = await res.json()
      console.log('Students response:', data)
      setStudentOptions(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Student search error:', err)
      setStudentOptions([])
    }
  }

  useEffect(() => { setSearch(value) }, [value])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSelect(s: ActiveStudent) {
    const fullName = `${s.first_name} ${s.last_name || ''}`.trim()
    onChange(fullName)
    setSearch(fullName)
    setOpen(false)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setSearch(v)
    onChange(v)
    if (!open) setOpen(true)
    searchStudents(v)
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input
          value={search}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          required
          className={`${inputClass} pl-9`}
          placeholder="Search or type client name..."
          autoComplete="off"
        />
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 top-full mt-1 w-full max-h-[200px] overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg"
          >
            {studentOptions.length > 0 ? studentOptions.map(s => {
              const fullName = `${s.first_name} ${s.last_name || ''}`.trim()
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSelect(s)}
                  className="w-full text-left px-3 py-2.5 hover:bg-zinc-50 transition-colors border-b border-zinc-100 last:border-0"
                >
                  <p className="text-sm font-medium text-zinc-900">{fullName}</p>
                  {s.email && <p className="text-xs text-zinc-400">{s.email}</p>}
                </button>
              )
            }) : search ? (
              <div className="px-3 py-3 text-sm text-zinc-400">
                No results — custom name will be used
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Cohort Select ─────────────────────────────────────────── */

function CohortSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [cohorts, setCohorts] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/growth/students?view=cohorts')
      .then(r => r.ok ? r.json() : [])
      .then(setCohorts)
      .catch(() => {})
  }, [])

  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        required
        className={inputClass}
      >
        <option value="" disabled>Select a cohort</option>
        {cohorts.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  )
}

/* ─── Main Page ─────────────────────────────────────────────── */

export default function PublicGrowthReportPage() {
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [toast, setToast] = useState('')

  // Form state
  const [clientName, setClientName] = useState('')
  const [coachName, setCoachName] = useState('')
  const [sessionNumber, setSessionNumber] = useState('')
  const [sessionDate, setSessionDate] = useState('')
  const [coachingType, setCoachingType] = useState<'Individual' | 'Group'>('Individual')

  const [connSelfScore, setConnSelfScore] = useState<number | null>(null)
  const [connSelfNote, setConnSelfNote] = useState('')
  const [connChildScore, setConnChildScore] = useState<number | null>(null)
  const [connChildNote, setConnChildNote] = useState('')

  const [awarenessText, setAwarenessText] = useState('')
  const [awarenessScore, setAwarenessScore] = useState<number | null>(null)

  const [implTools, setImplTools] = useState('')
  const [implNotes, setImplNotes] = useState('')
  const [implScore, setImplScore] = useState<number | null>(null)

  const [growWhere, setGrowWhere] = useState('')
  const [growSigns, setGrowSigns] = useState('')
  const [growScore, setGrowScore] = useState<number | null>(null)

  const [concernLevel, setConcernLevel] = useState<'Low' | 'Medium' | 'High'>('Low')
  const [clientSignals, setClientSignals] = useState<string[]>([])
  const [coachNotes, setCoachNotes] = useState('')

  function toggleSignal(s: string) {
    setClientSignals(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const body = {
      client_name: clientName,
      coach_name: coachName,
      session_number: sessionNumber || null,
      session_date: sessionDate,
      coaching_type: coachingType,
      conn_self_score: connSelfScore,
      conn_self_note: connSelfNote || null,
      conn_child_score: connChildScore,
      conn_child_note: connChildNote || null,
      awareness_text: awarenessText || null,
      awareness_score: awarenessScore,
      impl_tools: implTools || null,
      impl_notes: implNotes || null,
      impl_score: implScore,
      grow_where: growWhere || null,
      grow_signs: growSigns || null,
      grow_score: growScore,
      concern_level: concernLevel,
      client_signals: clientSignals.length > 0 ? clientSignals : null,
      coach_notes: coachNotes || null,
    }

    try {
      const res = await fetch('/api/growth/reports/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed to save')
      }
      setSubmitted(true)
    } catch (err: unknown) {
      setToast(err instanceof Error ? err.message : 'Error saving report')
      setTimeout(() => setToast(''), 3000)
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <img src="/logo.png" alt="HIC Parenting" className="h-10 mx-auto mb-8" />
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-[#1C2B3A] mb-3">Report saved successfully!</h1>
          <p className="text-[#718096] text-base">
            Thank you. Your growth report has been submitted.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-6 py-2.5 bg-[#ffbd59] text-[#1a1a2e] text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity"
          >
            Submit another report
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="max-w-2xl mx-auto px-4 py-10 md:py-16">
        {/* Header */}
        <div className="text-center mb-10">
          <img src="/logo.png" alt="HIC Parenting" className="h-10 mx-auto mb-6" />
          <h1 className="text-2xl md:text-3xl font-bold text-[#1C2B3A] mb-2">
            Weekly Growth Report
          </h1>
          <p className="text-[#718096] text-sm">
            Submit your coaching session report below.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 01 — Session Info */}
          <FormSection number="01" title="Session information">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label={coachingType === 'Group' ? 'Cohort' : 'Client name'} required>
                {coachingType === 'Group'
                  ? <CohortSelect value={clientName} onChange={setClientName} />
                  : <ClientCombobox value={clientName} onChange={setClientName} />
                }
              </FormField>
              <FormField label="Coach name" required>
                <CoachCombobox value={coachName} onChange={setCoachName} />
              </FormField>
              <FormField label="Session number">
                <input value={sessionNumber} onChange={e => setSessionNumber(e.target.value)} className={inputClass} placeholder="e.g. 4" />
              </FormField>
              <FormField label="Session date" required>
                <input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} required className={inputClass} />
              </FormField>
            </div>
            <FormField label="Coaching type">
              <SegmentToggle
                options={['Individual', 'Group']}
                value={coachingType}
                onChange={v => { setCoachingType(v as 'Individual' | 'Group'); setClientName('') }}
              />
            </FormField>
          </FormSection>

          {/* Section 02 — Connection Scores */}
          <FormSection number="02" title="Connection scores">
            <FormField label="Connection with self">
              <ScaleButtons value={connSelfScore} onChange={setConnSelfScore} />
              <textarea value={connSelfNote} onChange={e => setConnSelfNote(e.target.value)} className={textareaClass} placeholder="What influenced this score this week?" rows={2} />
            </FormField>
            <FormField label="Connection with child">
              <ScaleButtons value={connChildScore} onChange={setConnChildScore} />
              <textarea value={connChildNote} onChange={e => setConnChildNote(e.target.value)} className={textareaClass} placeholder="What influenced this score this week?" rows={2} />
            </FormField>
          </FormSection>

          {/* Section 03 — Awareness */}
          <FormSection number="03" title="Awareness">
            <FormField label="Where did the client experience awareness this week?">
              <textarea value={awarenessText} onChange={e => setAwarenessText(e.target.value)} className={textareaClass} rows={3} />
            </FormField>
            <FormField label="Awareness score">
              <ScaleButtons value={awarenessScore} onChange={setAwarenessScore} />
              <p className="text-xs text-zinc-400 mt-1.5">1-3 early awareness &middot; 4-6 increasing awareness &middot; 7-10 strong self-awareness emerging</p>
            </FormField>
          </FormSection>

          {/* Section 04 — Implementation */}
          <FormSection number="04" title="Implementation">
            <FormField label="What skills or tools did the client attempt to implement this week?">
              <textarea value={implTools} onChange={e => setImplTools(e.target.value)} className={textareaClass} rows={3} />
            </FormField>
            <FormField label="What implementation wins or struggles appeared?">
              <textarea value={implNotes} onChange={e => setImplNotes(e.target.value)} className={textareaClass} rows={3} />
            </FormField>
            <FormField label="Implementation score">
              <ScaleButtons value={implScore} onChange={setImplScore} />
              <p className="text-xs text-zinc-400 mt-1.5">1-3 experimenting &middot; 4-6 applying with effort &middot; 7-10 becoming consistent</p>
            </FormField>
          </FormSection>

          {/* Section 05 — Integration / Growth */}
          <FormSection number="05" title="Integration / Growth">
            <FormField label="Where is growth most visible this week?">
              <textarea value={growWhere} onChange={e => setGrowWhere(e.target.value)} className={textareaClass} rows={3} />
            </FormField>
            <FormField label="What signs of integration are emerging?">
              <textarea value={growSigns} onChange={e => setGrowSigns(e.target.value)} className={textareaClass} rows={3} />
            </FormField>
            <FormField label="Growth / integration score">
              <ScaleButtons value={growScore} onChange={setGrowScore} />
              <p className="text-xs text-zinc-400 mt-1.5">1-3 early growth &middot; 4-6 noticeable growth &middot; 7-10 sustainable integration emerging</p>
            </FormField>
          </FormSection>

          {/* Section 06 — Coach Observations */}
          <FormSection number="06" title="Coach observations">
            <FormField label="Concern level">
              <SegmentToggle
                options={['Low', 'Medium', 'High']}
                value={concernLevel}
                onChange={v => setConcernLevel(v as 'Low' | 'Medium' | 'High')}
                colors={{ Low: 'bg-emerald-500', Medium: 'bg-amber-500', High: 'bg-red-500' }}
              />
            </FormField>
            <FormField label="What's true for this client right now?">
              <div className="flex flex-wrap gap-2">
                {SIGNAL_OPTIONS.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSignal(s)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      clientSignals.includes(s)
                        ? 'bg-[#ffbd59] text-[#1a1a2e] border-[#ffbd59]'
                        : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </FormField>
            <FormField label="Additional coach notes">
              <textarea value={coachNotes} onChange={e => setCoachNotes(e.target.value)} className={textareaClass} rows={3} placeholder="Any additional notes..." />
            </FormField>
          </FormSection>

          <button
            type="submit"
            disabled={submitting}
            className="w-full md:w-auto px-8 py-3 bg-[#ffbd59] text-[#1a1a2e] text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {submitting ? 'Saving...' : "Save this week's report"}
          </button>

          {/* Toast */}
          <AnimatePresence>
            {toast && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="fixed bottom-6 right-6 z-50 bg-zinc-900 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg"
              >
                {toast}
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </div>
    </div>
  )
}
