'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/PageHeader'
import { PageTransition } from '@/components/motion/PageTransition'
import { EmptyState } from '@/components/shared/EmptyState'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import {
  Plus, Download, X, GraduationCap, Search,
  Pencil, FileText, PauseCircle, Trash2,
  Phone, Mail, Calendar, Clock, MessageSquare, ExternalLink,
  CreditCard, List, LayoutGrid, Table2, ArrowUpDown,
  Users, CheckCircle2, AlertCircle, DollarSign, TrendingUp, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, Video, XCircle, UserX, Circle,
} from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { getCanonicalProduct } from '@/lib/products'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { PwuStudent, StudentNote, Transaction, StudentPaymentPlan, CoachingSession } from '@/types'

export const dynamic = 'force-dynamic'

// ─── Pipeline Types ─────────────────────────────────────────────────────────

interface PipelineRecord {
  id: string
  student_id: string
  coach: string | null
  enrollment_date: string | null
  notes: string | null
  step1_status: string; step1_date: string | null
  step2_status: string; step2_date: string | null
  step3_status: string; step3_date: string | null
  step4_status: string; step4_date: string | null
  step5_status: string; step5_date: string | null
  step6_status: string; step6_date: string | null
  current_step: number
  created_at: string
  updated_at: string
}

const STEP_NAMES: Record<number, string> = {
  1: 'Welcome Message',
  2: 'Message Video 1:1 or Group',
  3: 'Q & A Meeting',
  4: 'Contract + Form',
  5: 'Matching Cohort',
  6: 'Session 1',
}

const STEP_COLORS: Record<number, string> = {
  1: '#ffbd59', 2: '#89bcef', 3: '#ffbd59', 4: '#b9d496', 5: '#89bcef', 6: '#b9d496',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sortCohorts(cohorts: string[]): string[] {
  return [...cohorts].sort((a, b) => {
    if (a === '1:1') return 1
    if (b === '1:1') return -1
    return Number(b) - Number(a)
  })
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function fullName(s: PwuStudent) {
  return [s.first_name, s.last_name].filter(Boolean).join(' ')
}

function initials(s: PwuStudent) {
  return [s.first_name?.[0], s.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?'
}

// ─── Sub-components ──────────────────────────────────────────────────────────

type StudentStatus = 'active' | 'graduated' | 'paused' | 'refund'

function StatusBadge({ status }: { status: StudentStatus }) {
  const map: Record<StudentStatus, { label: string; cls: string }> = {
    active:    { label: 'Active',       cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
    graduated: { label: 'Graduated 🎓', cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
    paused:    { label: 'Paused',       cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
    refund:    { label: 'Refund',       cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  }
  const { label, cls } = map[status]
  return (
    <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap', cls)}>
      {label}
    </span>
  )
}

function LastContactBadge({ ts }: { ts: string | null }) {
  if (!ts) return <span className="text-xs text-zinc-400">Never</span>

  const diffMs = Date.now() - new Date(ts).getTime()
  const days = diffMs / (1000 * 60 * 60 * 24)
  const label = formatDistanceToNow(new Date(ts), { addSuffix: true })

  const cls =
    days > 30 ? 'text-red-500 dark:text-red-400' :
    days > 14 ? 'text-amber-500 dark:text-amber-400' :
                'text-green-600 dark:text-green-400'

  return <span className={cn('text-xs whitespace-nowrap', cls)}>{label}</span>
}

const STATUS_ORDER: StudentStatus[] = ['active', 'graduated', 'paused', 'refund']

function sortStudents(students: PwuStudent[]) {
  return [...students].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
}

function ActionBtn({ children, title, onClick, className }: {
  children: React.ReactNode
  title: string
  onClick: () => void
  className?: string
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn('p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors', className)}
    >
      {children}
    </button>
  )
}

// ─── Modal shell ─────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide = false }: {
  title: string
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={cn(
        'relative bg-white dark:bg-zinc-900 rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto border border-zinc-200 dark:border-zinc-700 w-full',
        wide ? 'max-w-4xl' : 'max-w-md'
      )}>
        <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30 focus:border-[#ffbd59]'

// ─── Transaction Status Badge ─────────────────────────────────────────────────

function TxStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    refunded:  'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    failed:    'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
    recovered: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  }
  return (
    <span className={cn('inline-flex px-1.5 py-0.5 rounded-full text-xs font-semibold capitalize', map[status] ?? map.completed)}>
      {status}
    </span>
  )
}

// ─── Payment Plan Form Data ───────────────────────────────────────────────────

interface PaymentPlanFormData {
  total_installments: number
  amount_per_installment: number
  currency: string
  start_date: string
  notes: string
}

// ─── Onboarding Pipeline Section ──────────────────────────────────────────────

const ONBOARDING_STEPS = [
  { num: 1, name: 'Welcome Message' },
  { num: 2, name: 'Message Video 1:1 or Group' },
  { num: 3, name: 'Q & A Meeting' },
  { num: 4, name: 'Contract + Form' },
  { num: 5, name: 'Matching Cohort' },
  { num: 6, name: 'Session 1' },
]

function OnboardingPipelineSection({ studentId }: { studentId: string }) {
  const [pipeline, setPipeline] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [coaches, setCoaches] = useState<{ full_name: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [localNotes, setLocalNotes] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const res = await fetch('/api/client-success/pipeline')
      if (res.ok) {
        const all = await res.json()
        const match = all.find((r: Record<string, unknown>) => r.student_id === studentId)
        if (match) {
          setPipeline(match)
          setLocalNotes(match.notes ?? '')
        }
      }
      setLoading(false)
    }
    load()
    fetch('/api/growth/coaches').then((r) => r.json()).then(setCoaches).catch(() => {})
  }, [studentId])

  const handleCreate = useCallback(async () => {
    setCreating(true)
    const res = await fetch('/api/client-success/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: studentId }),
    })
    if (res.ok) {
      const created = await res.json()
      setPipeline(created)
      setLocalNotes('')
      toast.success('Added to onboarding pipeline')
    } else {
      toast.error('Failed to create pipeline record')
    }
    setCreating(false)
  }, [studentId])

  const patchField = useCallback(async (updates: Record<string, unknown>) => {
    if (!pipeline) return
    setSaving(true)
    const res = await fetch(`/api/client-success/pipeline/${pipeline.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (res.ok) {
      const updated = await res.json()
      setPipeline((prev) => prev ? { ...prev, ...updated } : prev)
    } else {
      toast.error('Failed to save pipeline')
    }
    setSaving(false)
  }, [pipeline])

  const handleStepStatusChange = useCallback(async (stepNum: number, newStatus: string) => {
    if (!pipeline) return
    const updates: Record<string, unknown> = { [`step${stepNum}_status`]: newStatus }
    if (newStatus === 'completed' && stepNum <= 5) {
      const nextStatus = pipeline[`step${stepNum + 1}_status`] as string
      if (nextStatus === 'pending') updates.current_step = stepNum + 1
    }
    await patchField(updates)
  }, [pipeline, patchField])

  if (loading) return null

  const sLabel = 'text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3'

  if (!pipeline) {
    return (
      <div>
        <p className={sLabel}>Onboarding Pipeline</p>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border border-dashed border-zinc-300 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400 hover:border-[#ffbd59] hover:text-[#89bcef] dark:hover:text-[#89bcef] transition-colors disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          {creating ? 'Adding...' : 'Add to Onboarding Pipeline'}
        </button>
      </div>
    )
  }

  return (
    <div>
      <p className={sLabel}>Onboarding Pipeline</p>
      <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3 space-y-1">
        {ONBOARDING_STEPS.map((step) => {
          const status = (pipeline[`step${step.num}_status`] as string) ?? 'pending'
          const date = pipeline[`step${step.num}_date`] as string | null
          const isCurrent = pipeline.current_step === step.num

          return (
            <div
              key={step.num}
              className={cn(
                'flex items-center gap-3 py-2 px-2.5 rounded-lg border-l-[3px]',
                status === 'completed' && 'border-l-[#b9d496] bg-green-50/50 dark:bg-green-900/10',
                status === 'waiting' && 'border-l-[#ffbd59] bg-amber-50/50 dark:bg-amber-900/10',
                status === 'pending' && 'border-l-zinc-200 dark:border-l-zinc-700',
                isCurrent && status === 'pending' && 'bg-white dark:bg-zinc-800',
              )}
            >
              <div className="shrink-0">
                {status === 'completed' && <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />}
                {status === 'waiting' && <Clock className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />}
                {status === 'pending' && <Circle className="h-3.5 w-3.5 text-zinc-300 dark:text-zinc-600" />}
              </div>
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 flex-1 min-w-0">
                {step.num}. {step.name}
              </span>
              <input
                type="date"
                value={date ?? ''}
                onChange={(e) => patchField({ [`step${step.num}_date`]: e.target.value || null })}
                className="text-[11px] border border-zinc-200 dark:border-zinc-700 rounded px-1.5 py-0.5 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 w-[105px] focus:outline-none focus:ring-1 focus:ring-[#ffbd59]/30"
              />
              <select
                value={status}
                onChange={(e) => handleStepStatusChange(step.num, e.target.value)}
                className={cn(
                  'text-[11px] font-medium rounded px-1.5 py-0.5 border-0 focus:outline-none cursor-pointer',
                  status === 'completed' && 'bg-[#b9d496]/30 text-green-700 dark:text-green-400',
                  status === 'waiting' && 'bg-[#ffbd59]/30 text-amber-700 dark:text-amber-400',
                  status === 'pending' && 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400',
                )}
              >
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="waiting">Waiting</option>
              </select>
            </div>
          )
        })}
      </div>
      {/* Coach, enrollment date, notes */}
      <div className="grid grid-cols-2 gap-3 mt-3">
        <div>
          <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-0.5">Coach</label>
          <select
            value={(pipeline.coach as string) ?? ''}
            onChange={(e) => patchField({ coach: e.target.value || null })}
            className="w-full text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#ffbd59]/30"
          >
            <option value="">—</option>
            {coaches.map((c) => (
              <option key={c.full_name} value={c.full_name}>{c.full_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-0.5">Enrollment Date</label>
          <input
            type="date"
            value={(pipeline.enrollment_date as string) ?? ''}
            onChange={(e) => patchField({ enrollment_date: e.target.value || null })}
            className="w-full text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#ffbd59]/30"
          />
        </div>
      </div>
      <div className="mt-2">
        <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-0.5">Notes</label>
        <textarea
          value={localNotes}
          onChange={(e) => setLocalNotes(e.target.value)}
          onBlur={() => patchField({ notes: localNotes })}
          rows={2}
          className="w-full text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#ffbd59]/30 resize-none"
        />
      </div>
      {saving && <p className="text-[10px] text-[#ffbd59] animate-pulse mt-1">Saving...</p>}
    </div>
  )
}

// ─── Student Profile Modal ────────────────────────────────────────────────────

function SessionStatusBadge({ status }: { status: CoachingSession['status'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    scheduled:  { label: 'Scheduled',  cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
    completed:  { label: 'Completed',  cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
    cancelled:  { label: 'Cancelled',  cls: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400' },
    no_show:    { label: 'No Show',    cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  }
  const { label, cls } = map[status] ?? map.scheduled
  return (
    <span className={cn('inline-flex px-1.5 py-0.5 rounded-full text-xs font-semibold', cls)}>
      {label}
    </span>
  )
}

function StudentProfileModal({
  student,
  notes,
  transactions,
  paymentPlan,
  sessions,
  onClose,
  onEdit,
  onGraduate,
  onPause,
  onDelete,
  onAddNote,
  onCohortDateChange,
  onStudentUpdate,
  onSavePaymentPlan,
  onSessionsChange,
}: {
  student: PwuStudent
  notes: StudentNote[]
  transactions: Transaction[]
  paymentPlan: StudentPaymentPlan | null
  sessions: CoachingSession[]
  onClose: () => void
  onEdit: (s: PwuStudent) => void
  onGraduate: (s: PwuStudent) => void
  onPause: (s: PwuStudent) => void
  onDelete: (s: PwuStudent) => void
  onAddNote: (text: string) => Promise<void>
  onCohortDateChange: (date: string) => Promise<void>
  onStudentUpdate: (updated: PwuStudent) => void
  onSavePaymentPlan: (data: PaymentPlanFormData) => Promise<void>
  onSessionsChange: () => void
}) {
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [showSessionForm, setShowSessionForm] = useState(false)
  const [sessionForm, setSessionForm] = useState({ date: '', time: '10:00', duration: 60, type: 'individual' as 'individual' | 'group', notes: '' })
  const [savingSession, setSavingSession] = useState(false)
  const [showPlanForm, setShowPlanForm] = useState(false)
  const [planForm, setPlanForm] = useState<PaymentPlanFormData>(() => ({
    total_installments: paymentPlan?.total_installments ?? 6,
    amount_per_installment: paymentPlan?.amount_per_installment ?? 0,
    currency: paymentPlan?.currency ?? 'USD',
    start_date: paymentPlan?.start_date ?? '',
    notes: paymentPlan?.notes ?? '',
  }))
  const [savingPlan, setSavingPlan] = useState(false)

  async function handleAddNote() {
    if (!newNote.trim()) return
    setAddingNote(true)
    await onAddNote(newNote.trim())
    setNewNote('')
    setAddingNote(false)
  }

  async function handleSubmitPlan(e: React.FormEvent) {
    e.preventDefault()
    if (!planForm.start_date) { toast.error('Start date is required'); return }
    setSavingPlan(true)
    await onSavePaymentPlan(planForm)
    setSavingPlan(false)
    setShowPlanForm(false)
  }

  async function handleScheduleSession(e: React.FormEvent) {
    e.preventDefault()
    if (!sessionForm.date) { toast.error('Date is required'); return }
    setSavingSession(true)
    const sessionDate = new Date(`${sessionForm.date}T${sessionForm.time}:00`).toISOString()
    const res = await fetch('/api/students/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: student.id,
        session_date: sessionDate,
        duration_minutes: sessionForm.duration,
        session_type: sessionForm.type,
        notes: sessionForm.notes,
      }),
    })
    setSavingSession(false)
    if (!res.ok) { toast.error('Failed to schedule session'); return }
    toast.success('Session scheduled')
    setShowSessionForm(false)
    setSessionForm({ date: '', time: '10:00', duration: 60, type: 'individual', notes: '' })
    onSessionsChange()
  }

  async function handleSessionAction(sessionId: string, action: 'completed' | 'no_show' | 'cancelled' | 'delete') {
    if (action === 'delete') {
      const res = await fetch(`/api/students/sessions/${sessionId}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed to delete session'); return }
      toast.success('Session deleted')
    } else {
      const res = await fetch(`/api/students/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action }),
      })
      if (!res.ok) { toast.error('Failed to update session'); return }
      toast.success('Session updated')
    }
    onSessionsChange()
  }

  const now = new Date()
  const nextSession = sessions
    .filter((s) => s.status === 'scheduled' && new Date(s.session_date) >= now)
    .sort((a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime())[0] ?? null
  const pastSessions = sessions
    .filter((s) => s.status !== 'scheduled' || new Date(s.session_date) < now)
    .sort((a, b) => new Date(b.session_date).getTime() - new Date(a.session_date).getTime())
  const upcomingSessions = sessions
    .filter((s) => s.status === 'scheduled' && new Date(s.session_date) >= now && s.id !== nextSession?.id)
    .sort((a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime())

  const paidCount = transactions.filter((t) => t.status === 'completed').length
  const remaining = paymentPlan ? Math.max(0, paymentPlan.total_installments - paidCount) : 0
  const progressPct = paymentPlan && paymentPlan.total_installments > 0
    ? Math.min(100, Math.round((paidCount / paymentPlan.total_installments) * 100))
    : 0

  function estimateEndDate(startDate: string, months: number) {
    const d = new Date(startDate + 'T12:00:00')
    d.setMonth(d.getMonth() + months)
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }

  const sectionLabel = 'text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3'
  const rowLabel = 'text-xs text-zinc-500 dark:text-zinc-400'
  const rowValue = 'text-xs font-medium text-zinc-800 dark:text-zinc-200 text-right'

  return (
    <Modal title="" onClose={onClose} wide>
      {/* Header */}
      <div className="flex items-start gap-4 mb-6 -mt-1">
        <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-lg font-bold text-blue-600 dark:text-blue-300 shrink-0">
          {initials(student)}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 leading-tight">{fullName(student)}</h2>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {student.email && (
              <span className="flex items-center gap-1 text-xs text-zinc-400">
                <Mail className="h-3 w-3" />{student.email}
              </span>
            )}
            {student.phone && (
              <span className="flex items-center gap-1 text-xs text-zinc-400">
                <Phone className="h-3 w-3" />{student.phone}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <StatusBadge status={student.status} />
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
              {student.type === 'individual' ? 'Individual 1:1' : 'Group'}
            </span>
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              {student.type === 'individual' ? '1:1' : `Cohort ${student.cohort}`}
            </span>
          </div>
        </div>
        {/* Quick actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => { onClose(); setTimeout(() => onEdit(student), 50) }}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </button>
          {student.status === 'active' && (
            <button
              onClick={() => { onClose(); setTimeout(() => onGraduate(student), 50) }}
              className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
              title="Graduate"
            >
              <GraduationCap className="h-4 w-4" />
            </button>
          )}
          {student.status === 'active' && (
            <button
              onClick={() => { onClose(); setTimeout(() => onPause(student), 50) }}
              className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
              title="Pause"
            >
              <PauseCircle className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => { onClose(); setTimeout(() => onDelete(student), 50) }}
            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ── LEFT ── */}
        <div className="space-y-6">

          {/* Key Dates */}
          <div>
            <p className={sectionLabel}>Key Dates</p>
            {(() => {
              const completed = transactions.filter((t) => t.status === 'completed')
              const totalPaid = completed.reduce((sum, t) => sum + (Number(t.cost) || 0), 0)
              const oldestDate = completed.length > 0
                ? completed.reduce((oldest, t) => t.date < oldest ? t.date : oldest, completed[0].date)
                : null
              return (
            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className={rowLabel}>Payment Date</span>
                <span className={rowValue}>{formatDate(oldestDate ?? student.payment_date)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={rowLabel}>Payment Amount</span>
                <span className={cn(rowValue, totalPaid > 0 ? 'text-green-600 dark:text-green-400' : '')}>
                  {totalPaid > 0
                    ? `$${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : student.payment_amount ? `$${student.payment_amount.toLocaleString()}` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className={rowLabel}>Installments Paid</span>
                <span className={rowValue}>
                  {completed.length > 0 ? `${completed.length} ${completed.length === 1 ? 'payment' : 'payments'}` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className={rowLabel}>Cohort Assigned</span>
                <input
                  type="date"
                  value={student.cohort_assigned_at ?? ''}
                  onChange={(e) => onCohortDateChange(e.target.value)}
                  className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className={rowLabel}>Last Contacted</span>
                <span className={rowValue}>
                  {student.last_contacted_at
                    ? formatDistanceToNow(new Date(student.last_contacted_at), { addSuffix: true })
                    : 'Never'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className={rowLabel}>Enrolled</span>
                <span className={rowValue}>{formatDate(student.created_at)}</span>
              </div>
            </div>
              )
            })()}
          </div>

          {/* Transactions */}
          <div>
            <p className={sectionLabel}>Transactions</p>
            {!student.email ? (
              <div className="bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-center">
                <p className="text-xs text-zinc-400">No email on record — cannot match transactions</p>
              </div>
            ) : transactions.length === 0 ? (
              <div className="bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-center">
                <p className="text-xs text-zinc-400">No transactions found for {student.email}</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {transactions.map((tx) => (
                  <div key={tx.id} className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200 leading-tight flex-1 min-w-0 truncate">
                        {tx.offer_title}
                      </span>
                      <span className="text-xs font-semibold text-green-700 dark:text-green-400 whitespace-nowrap">
                        ${Number(tx.cost).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TxStatusBadge status={tx.status ?? 'completed'} />
                        <span className="text-xs text-zinc-400 flex items-center gap-0.5">
                          <Calendar className="h-3 w-3" />{formatDate(tx.date)}
                        </span>
                      </div>
                      <a
                        href={`/sales?email=${encodeURIComponent(student.email!)}`}
                        className="text-xs text-[#89bcef] dark:text-[#89bcef] hover:underline flex items-center gap-0.5"
                        onClick={onClose}
                      >
                        View in Sales <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payment Plan */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className={cn(sectionLabel, 'mb-0 flex items-center gap-1.5')}>
                <CreditCard className="h-3.5 w-3.5" /> Payment Plan
              </p>
              {paymentPlan && !showPlanForm && (
                <button
                  onClick={() => {
                    setPlanForm({
                      total_installments: paymentPlan.total_installments,
                      amount_per_installment: paymentPlan.amount_per_installment,
                      currency: paymentPlan.currency,
                      start_date: paymentPlan.start_date,
                      notes: paymentPlan.notes ?? '',
                    })
                    setShowPlanForm(true)
                  }}
                  className="text-xs text-[#89bcef] dark:text-[#89bcef] hover:underline"
                >
                  Edit
                </button>
              )}
            </div>

            {!paymentPlan && !showPlanForm && (
              <button
                onClick={() => setShowPlanForm(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border border-dashed border-zinc-300 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400 hover:border-[#ffbd59] hover:text-[#89bcef] dark:hover:text-[#89bcef] transition-colors"
              >
                <CreditCard className="h-3.5 w-3.5" /> Configure Payment Plan
              </button>
            )}

            {showPlanForm && (
              <form onSubmit={handleSubmitPlan} className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Total installments</label>
                    <input
                      type="number" min={1} max={12} required
                      value={planForm.total_installments}
                      onChange={(e) => setPlanForm((p) => ({ ...p, total_installments: Number(e.target.value) }))}
                      className={cn(inputCls, 'text-xs')}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Amount / installment</label>
                    <input
                      type="number" min={0} step="0.01" required
                      value={planForm.amount_per_installment}
                      onChange={(e) => setPlanForm((p) => ({ ...p, amount_per_installment: Number(e.target.value) }))}
                      className={cn(inputCls, 'text-xs')}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Start date</label>
                    <input
                      type="date" required
                      value={planForm.start_date}
                      onChange={(e) => setPlanForm((p) => ({ ...p, start_date: e.target.value }))}
                      className={cn(inputCls, 'text-xs')}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Currency</label>
                    <input
                      type="text"
                      value={planForm.currency}
                      onChange={(e) => setPlanForm((p) => ({ ...p, currency: e.target.value }))}
                      className={cn(inputCls, 'text-xs')}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Notes (optional)</label>
                  <input
                    type="text"
                    value={planForm.notes}
                    onChange={(e) => setPlanForm((p) => ({ ...p, notes: e.target.value }))}
                    className={cn(inputCls, 'text-xs')}
                    placeholder="e.g. 6 monthly payments"
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPlanForm(false)}
                    className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingPlan}
                    className="px-3 py-1.5 text-xs rounded-lg text-white font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity"
                    style={{ backgroundColor: '#ffbd59' }}
                  >
                    {savingPlan ? 'Saving…' : 'Save Plan'}
                  </button>
                </div>
              </form>
            )}

            {paymentPlan && !showPlanForm && (
              <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className={rowLabel}>Total installments</span>
                  <span className={rowValue}>{paymentPlan.total_installments}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={rowLabel}>Paid</span>
                  <span className="text-xs font-medium text-green-600 dark:text-green-400">{paidCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={rowLabel}>Remaining</span>
                  <span className={rowValue}>{remaining}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={rowLabel}>Amount / installment</span>
                  <span className={rowValue}>
                    {paymentPlan.currency} ${Number(paymentPlan.amount_per_installment).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={rowLabel}>Est. end date</span>
                  <span className={rowValue}>{estimateEndDate(paymentPlan.start_date, paymentPlan.total_installments)}</span>
                </div>
                <div>
                  <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden mt-1">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">{progressPct}% paid</p>
                </div>
                {paymentPlan.notes && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 italic">{paymentPlan.notes}</p>
                )}
              </div>
            )}
          </div>

          {/* Coaching Sessions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className={cn(sectionLabel, 'mb-0 flex items-center gap-1.5')}>
                <Video className="h-3.5 w-3.5" /> Coaching Sessions
              </p>
              {!showSessionForm && (
                <button
                  onClick={() => setShowSessionForm(true)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#89bcef] dark:text-[#89bcef] hover:underline"
                >
                  <Plus className="h-3 w-3" /> Schedule Session
                </button>
              )}
            </div>

            {/* Next session */}
            {nextSession ? (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 mb-3">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">Next Session</p>
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  {new Date(nextSession.session_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  {' at '}
                  {new Date(nextSession.session_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </p>
                <p className="text-xs text-[#89bcef] dark:text-[#89bcef] mt-0.5">
                  {nextSession.duration_minutes} min · {nextSession.session_type === 'individual' ? 'Individual' : 'Group'}
                </p>
              </div>
            ) : (
              <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3 mb-3 text-center">
                <p className="text-xs text-zinc-400">No session scheduled</p>
              </div>
            )}

            {/* Schedule form */}
            {showSessionForm && (
              <form onSubmit={handleScheduleSession} className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3 space-y-3 mb-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Date</label>
                    <input
                      type="date" required
                      value={sessionForm.date}
                      onChange={(e) => setSessionForm((f) => ({ ...f, date: e.target.value }))}
                      className={cn(inputCls, 'text-xs')}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Time</label>
                    <input
                      type="time" required
                      value={sessionForm.time}
                      onChange={(e) => setSessionForm((f) => ({ ...f, time: e.target.value }))}
                      className={cn(inputCls, 'text-xs')}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Duration</label>
                    <select
                      value={sessionForm.duration}
                      onChange={(e) => setSessionForm((f) => ({ ...f, duration: Number(e.target.value) }))}
                      className={cn(inputCls, 'text-xs')}
                    >
                      <option value={30}>30 min</option>
                      <option value={45}>45 min</option>
                      <option value={60}>60 min</option>
                      <option value={90}>90 min</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Type</label>
                    <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-700 rounded-lg p-0.5">
                      {(['individual', 'group'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setSessionForm((f) => ({ ...f, type: t }))}
                          className={cn(
                            'flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors',
                            sessionForm.type === t
                              ? 'bg-white dark:bg-zinc-600 text-zinc-900 dark:text-zinc-100 shadow-sm'
                              : 'text-zinc-500 dark:text-zinc-400'
                          )}
                        >
                          {t === 'individual' ? 'Individual' : 'Group'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Notes (optional)</label>
                  <textarea
                    value={sessionForm.notes}
                    onChange={(e) => setSessionForm((f) => ({ ...f, notes: e.target.value }))}
                    className={cn(inputCls, 'text-xs resize-none')}
                    rows={2}
                    placeholder="Session topic, agenda..."
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSessionForm(false)}
                    className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingSession}
                    className="px-3 py-1.5 text-xs rounded-lg text-white font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity"
                    style={{ backgroundColor: '#ffbd59' }}
                  >
                    {savingSession ? 'Saving…' : 'Schedule'}
                  </button>
                </div>
              </form>
            )}

            {/* Upcoming sessions */}
            {upcomingSessions.length > 0 && (
              <div className="space-y-1.5 mb-3">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Upcoming</p>
                {upcomingSessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2">
                    <div>
                      <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                        {new Date(s.session_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {' · '}
                        {new Date(s.session_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </p>
                      <p className="text-xs text-zinc-400">{s.duration_minutes} min · {s.session_type === 'individual' ? 'Individual' : 'Group'}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleSessionAction(s.id, 'cancelled')} className="p-1 rounded text-zinc-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20" title="Cancel">
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleSessionAction(s.id, 'delete')} className="p-1 rounded text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Session history */}
            {pastSessions.length > 0 && (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Session History</p>
                {pastSessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                          {new Date(s.session_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {' · '}
                          {new Date(s.session_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </p>
                        <SessionStatusBadge status={s.status} />
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5">{s.duration_minutes} min · {s.session_type === 'individual' ? 'Individual' : 'Group'}</p>
                      {s.notes && <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate italic">{s.notes}</p>}
                    </div>
                    {s.status === 'scheduled' && (
                      <div className="flex items-center gap-0.5 ml-2 shrink-0">
                        <button onClick={() => handleSessionAction(s.id, 'completed')} className="p-1 rounded text-zinc-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20" title="Mark Completed">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleSessionAction(s.id, 'no_show')} className="p-1 rounded text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" title="Mark No Show">
                          <UserX className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleSessionAction(s.id, 'cancelled')} className="p-1 rounded text-zinc-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20" title="Mark Cancelled">
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleSessionAction(s.id, 'delete')} className="p-1 rounded text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Onboarding Pipeline */}
          <OnboardingPipelineSection studentId={student.id} />

          {/* Notes field */}
          {student.notes && (
            <div>
              <p className={sectionLabel}>Notes</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3 whitespace-pre-wrap">
                {student.notes}
              </p>
            </div>
          )}
        </div>

        {/* ── RIGHT: Contact Notes Timeline ── */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="h-3.5 w-3.5 text-zinc-400" />
            <p className={cn(sectionLabel, 'mb-0')}>Contact Notes</p>
          </div>

          {/* Timeline */}
          <div className="flex-1 space-y-2 max-h-72 overflow-y-auto pr-1 mb-4">
            {notes.length === 0 ? (
              <div className="text-center py-10 text-zinc-400 text-xs">
                No notes yet. Add the first contact note below.
              </div>
            ) : (
              notes.map((note) => (
                <div key={note.id} className="bg-zinc-50 dark:bg-zinc-800/60 rounded-xl p-3 border-l-4 border-blue-400">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-[#89bcef] dark:text-[#89bcef]">{note.created_by}</span>
                    <span className="text-xs text-zinc-400 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDateTime(note.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">{note.note}</p>
                </div>
              ))
            )}
          </div>

          {/* Add note */}
          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4">
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddNote()
              }}
              placeholder="Add a contact note… (⌘+Enter to save)"
              rows={3}
              className={cn(inputCls, 'resize-none text-xs')}
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={handleAddNote}
                disabled={!newNote.trim() || addingNote}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: '#ffbd59' }}
              >
                <MessageSquare className="h-3 w-3" />
                {addingNote ? 'Saving…' : 'Add Note'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ─── Student Form Modal ───────────────────────────────────────────────────────

interface StudentFormData {
  first_name: string
  last_name: string
  email: string
  phone: string
  type: 'group' | 'individual'
  cohort: string
  cohortNew: string
  status: StudentStatus
  notes: string
}

const emptyForm: StudentFormData = {
  first_name: '', last_name: '', email: '', phone: '',
  type: 'group', cohort: '', cohortNew: '', status: 'active', notes: '',
}

function StudentFormModal({
  title, initial, existingCohorts, onClose, onSave,
}: {
  title: string
  initial: StudentFormData
  existingCohorts: string[]
  onClose: () => void
  onSave: (data: StudentFormData) => Promise<void>
}) {
  const [form, setForm] = useState<StudentFormData>(initial)
  const [saving, setSaving] = useState(false)

  function set<K extends keyof StudentFormData>(k: K, v: StudentFormData[K]) {
    setForm((p) => ({ ...p, [k]: v }))
  }

  const groupCohorts = useMemo(() => sortCohorts(existingCohorts.filter((c) => c !== '1:1')), [existingCohorts])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.first_name.trim()) { toast.error('First name is required'); return }
    if (form.type === 'group' && !form.cohort && !form.cohortNew.trim()) {
      toast.error('Select or enter a cohort'); return
    }
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First Name *">
            <input className={inputCls} value={form.first_name} onChange={(e) => set('first_name', e.target.value)} required />
          </Field>
          <Field label="Last Name">
            <input className={inputCls} value={form.last_name} onChange={(e) => set('last_name', e.target.value)} />
          </Field>
        </div>
        <Field label="Email">
          <input className={inputCls} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Phone">
          <input className={inputCls} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Type *">
          <select className={inputCls} value={form.type} onChange={(e) => set('type', e.target.value as 'group' | 'individual')}>
            <option value="group">Group</option>
            <option value="individual">Individual 1:1</option>
          </select>
        </Field>
        {form.type === 'group' && (
          <Field label="Cohort *">
            <div className="space-y-2">
              <select
                className={inputCls}
                value={form.cohort}
                onChange={(e) => set('cohort', e.target.value)}
              >
                <option value="">— select existing —</option>
                {groupCohorts.map((c) => <option key={c} value={c}>Cohort {c}</option>)}
                <option value="__new__">+ New cohort number…</option>
              </select>
              {form.cohort === '__new__' && (
                <input
                  className={inputCls}
                  type="number"
                  min={1}
                  placeholder="e.g. 49"
                  value={form.cohortNew}
                  onChange={(e) => set('cohortNew', e.target.value)}
                />
              )}
            </div>
          </Field>
        )}
        <Field label="Status">
          <select className={inputCls} value={form.status} onChange={(e) => set('status', e.target.value as StudentStatus)}>
            <option value="active">Active</option>
            <option value="graduated">Graduated</option>
            <option value="paused">Paused</option>
            <option value="refund">Refund</option>
          </select>
        </Field>
        <Field label="Notes">
          <textarea className={inputCls} rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} style={{ resize: 'none' }} />
        </Field>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-xs rounded-lg text-white font-semibold transition-opacity hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: '#ffbd59' }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── New Cohort Modal ─────────────────────────────────────────────────────────

function NewCohortModal({
  nextSuggested, onClose, onCreated,
}: {
  nextSuggested: number
  onClose: () => void
  onCreated: (cohort: string) => Promise<boolean>
}) {
  const [num, setNum] = useState(String(nextSuggested))
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const n = num.trim()
    if (!n || isNaN(Number(n))) { toast.error('Enter a valid cohort number'); return }
    setSaving(true)
    const ok = await onCreated(n)
    setSaving(false)
    if (ok) {
      toast.success(`Cohort C${n} created`)
      onClose()
    }
  }

  return (
    <Modal title="New Cohort" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={`Cohort number (suggested: ${nextSuggested})`}>
          <input className={inputCls} type="number" min={1} value={num} onChange={(e) => setNum(e.target.value)} required />
        </Field>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-xs rounded-lg text-white font-semibold hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: '#ffbd59' }}>
            {saving ? 'Creating...' : 'Create Cohort'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Notes Modal (legacy quick notes) ────────────────────────────────────────

function NotesModal({
  student, onClose, onSave,
}: {
  student: PwuStudent
  onClose: () => void
  onSave: (notes: string) => Promise<void>
}) {
  const [notes, setNotes] = useState(student.notes ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await onSave(notes)
    setSaving(false)
  }

  return (
    <Modal title={`Notes — ${fullName(student)}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          className={inputCls}
          rows={5}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add notes..."
          style={{ resize: 'none' }}
        />
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-xs rounded-lg text-white font-semibold hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: '#ffbd59' }}>
            {saving ? 'Saving...' : 'Save Notes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────

function ConfirmModal({
  title, message, confirmLabel, danger = false, onClose, onConfirm,
}: {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [loading, setLoading] = useState(false)

  async function handle() {
    setLoading(true)
    await onConfirm()
    setLoading(false)
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={handle}
            disabled={loading}
            className={cn('px-4 py-2 text-xs rounded-lg text-white font-semibold hover:opacity-90 disabled:opacity-60', danger ? 'bg-red-600' : 'bg-green-600')}
          >
            {loading ? 'Loading...' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'all' | 'group' | 'individual' | 'graduated' | 'paused' | 'sessions'
type ViewMode = 'list' | 'card' | 'table'

interface StudentActions {
  onEdit: (s: PwuStudent) => void
  onNotes: (s: PwuStudent) => void
  onGraduate: (s: PwuStudent) => void
  onPause: (s: PwuStudent) => void
  onDelete: (s: PwuStudent) => void
  onStatusChange: (s: PwuStudent, status: StudentStatus) => void
  onSelect: (s: PwuStudent) => void
  pipelineRecords: Record<string, PipelineRecord>
}

// ─── Payment Plans Types ─────────────────────────────────────────────────────

interface PaymentPlanStudent {
  id: string
  studentId: string
  name: string
  email: string | null
  amountPerInstallment: number
  currency: string
  startDate: string
  totalInstallments: number
  paid: number
  remaining: number
  collected: number
  pending: number
  progressPct: number
  monthsElapsed: number
  actualPaidCount: number
  overdueInstallments: number
  isOverdue: boolean
  lastPaymentDate: string | null
  lastPaymentAmount: number | null
}

interface PaymentPlanData {
  students: PaymentPlanStudent[]
  totals: {
    studentsWithPlan: number
    totalPaid: number
    totalRemaining: number
    totalCollected: number
    totalPending: number
    totalOverdue: number
  }
}

type PpFilter = 'all' | 'at_risk' | 'on_track'

// ─── Payment Plans Chart Tooltip ─────────────────────────────────────────────

function PaymentChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-md px-3 py-2">
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">{label}</p>
        {payload.map((entry, i) => (
          <p key={i} className="text-xs" style={{ color: entry.color }}>
            {entry.name}: {formatCurrency(entry.value)}
          </p>
        ))}
      </div>
    )
  }
  return null
}

// ─── Payment Plans Dashboard ─────────────────────────────────────────────────

function PaymentPlansDashboard({ data, loading }: { data: PaymentPlanData | null; loading: boolean }) {
  const [expanded, setExpanded] = useState(true)
  const [ppFilter, setPpFilter] = useState<PpFilter>('all')

  if (loading) {
    return (
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Payment Plans
          </h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (!data || data.students.length === 0) return null

  const { totals, students: allStudents } = data

  // Filter students based on selected tab
  const filteredStudents = allStudents.filter((s) => {
    if (ppFilter === 'at_risk') return s.isOverdue
    if (ppFilter === 'on_track') return !s.isOverdue
    return true
  })

  // Sort: overdue students first (by overdue count desc), then by name
  const sortedStudents = [...filteredStudents].sort((a, b) => {
    if (a.overdueInstallments !== b.overdueInstallments) return b.overdueInstallments - a.overdueInstallments
    return a.name.localeCompare(b.name)
  })

  const atRiskCount = allStudents.filter((s) => s.isOverdue).length
  const onTrackCount = allStudents.filter((s) => !s.isOverdue).length

  const chartData = sortedStudents.map((s) => ({
    label: s.name.length > 15 ? s.name.slice(0, 15) + '…' : s.name,
    collected: s.collected,
    pending: s.pending,
  }))

  const ppTabs: { key: PpFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: allStudents.length },
    { key: 'at_risk', label: 'At Risk', count: atRiskCount },
    { key: 'on_track', label: 'On Track', count: onTrackCount },
  ]

  return (
    <div className="mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full mb-3 group"
      >
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-[#ffbd59]" /> Payment Plans
          <span className="text-xs font-normal text-zinc-400">({totals.studentsWithPlan} students)</span>
          {totals.totalOverdue > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
              {totals.totalOverdue} overdue
            </span>
          )}
        </h3>
        {expanded
          ? <ChevronUp className="h-4 w-4 text-zinc-400 group-hover:text-zinc-600 transition-colors" />
          : <ChevronDown className="h-4 w-4 text-zinc-400 group-hover:text-zinc-600 transition-colors" />
        }
      </button>

      {expanded && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
            {[
              { label: 'Students w/ Plan', value: totals.studentsWithPlan, icon: <Users className="h-4 w-4" />, fmt: false, danger: false },
              { label: 'Installments Paid', value: totals.totalPaid, icon: <CheckCircle2 className="h-4 w-4" />, fmt: false, danger: false },
              { label: 'Installments Remaining', value: totals.totalRemaining, icon: <AlertCircle className="h-4 w-4" />, fmt: false, danger: false },
              { label: 'Overdue Installments', value: totals.totalOverdue, icon: <AlertCircle className="h-4 w-4" />, fmt: false, danger: true },
              { label: 'Total Collected', value: totals.totalCollected, icon: <DollarSign className="h-4 w-4" />, fmt: true, danger: false },
              { label: 'Total Pending', value: totals.totalPending, icon: <TrendingUp className="h-4 w-4" />, fmt: true, danger: false },
            ].map(({ label, value, icon, fmt, danger }) => (
              <div
                key={label}
                className={cn(
                  'rounded-xl border p-4',
                  danger && value > 0
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
                )}
              >
                <div className="flex items-start justify-between mb-1">
                  <p className={cn(
                    'text-xs font-semibold uppercase tracking-wide',
                    danger && value > 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-500 dark:text-zinc-400'
                  )}>{label}</p>
                  <div className={danger && value > 0 ? 'text-red-500 dark:text-red-400' : 'text-zinc-400 dark:text-zinc-500'}>{icon}</div>
                </div>
                <p className={cn(
                  'text-2xl font-bold',
                  danger && value > 0 ? 'text-red-700 dark:text-red-300' : 'text-zinc-900 dark:text-zinc-100'
                )}>
                  {fmt ? formatCurrency(value) : value}
                </p>
              </div>
            ))}
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1 mb-4 w-fit">
            {ppTabs.map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setPpFilter(key)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5',
                  ppFilter === key
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                )}
              >
                {label}
                <span className={cn(
                  'text-xs px-1.5 py-0.5 rounded-full font-semibold',
                  ppFilter === key
                    ? key === 'at_risk' && count > 0
                      ? 'bg-red-100 dark:bg-red-800/60 text-red-700 dark:text-red-300'
                      : 'bg-blue-100 dark:bg-blue-800/60 text-blue-700 dark:text-blue-300'
                    : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'
                )}>
                  {count}
                </span>
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden mb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                    <th className="text-left px-4 py-2.5 font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Student</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">$/Installment</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Start Date</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Last Payment</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Last Amount</th>
                    <th className="text-center px-4 py-2.5 font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Paid / Total</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider min-w-[140px]">Progress</th>
                    <th className="text-center px-4 py-2.5 font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Status</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStudents.map((s) => (
                    <tr key={s.id} className={cn(
                      'border-b border-zinc-50 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors',
                      s.isOverdue && 'bg-red-50/50 dark:bg-red-900/10'
                    )}>
                      <td className="px-4 py-3 font-medium text-zinc-800 dark:text-zinc-200">{s.name}</td>
                      <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400">{formatCurrency(s.amountPerInstallment)}</td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {new Date(s.startDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {s.lastPaymentDate
                          ? new Date(s.lastPaymentDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400">
                        {s.lastPaymentAmount != null ? formatCurrency(s.lastPaymentAmount) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold',
                          s.paid === s.totalInstallments
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                        )}>
                          {s.paid} / {s.totalInstallments}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all',
                                s.progressPct === 100 ? 'bg-green-500' : s.isOverdue ? 'bg-red-500' : 'bg-blue-500'
                              )}
                              style={{ width: `${s.progressPct}%` }}
                            />
                          </div>
                          <span className="text-xs text-zinc-500 dark:text-zinc-400 w-8 text-right">{s.progressPct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {s.isOverdue ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                            <AlertCircle className="h-3 w-3" /> Overdue ({s.overdueInstallments})
                          </span>
                        ) : s.paid === s.totalInstallments ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                            Complete
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            On Track
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-zinc-700 dark:text-zinc-300">
                        {s.pending > 0 ? formatCurrency(s.pending) : <span className="text-green-600 dark:text-green-400">Paid</span>}
                      </td>
                    </tr>
                  ))}
                  {sortedStudents.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-zinc-400 dark:text-zinc-500">
                        No students match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Stacked Bar Chart */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-3">Collected vs Pending per Student</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: sortedStudents.length > 4 ? 40 : 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={sortedStudents.length > 4
                    ? { fontSize: 10, fill: '#71717a', textAnchor: 'end' as const }
                    : { fontSize: 11, fill: '#71717a' }
                  }
                  angle={sortedStudents.length > 4 ? -40 : 0}
                  interval={0}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#71717a' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  width={45}
                />
                <Tooltip content={<PaymentChartTooltip />} cursor={{ fill: '#f4f4f5' }} />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  iconType="circle"
                  iconSize={8}
                />
                <Bar dataKey="collected" name="Collected" stackId="a" fill="#1D9E75" radius={[0, 0, 0, 0]} maxBarSize={48} />
                <Bar dataKey="pending" name="Pending" stackId="a" fill="#ffbd59" radius={[3, 3, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Calendar helpers (shared with sessions tab) ────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDow = firstDay.getDay()
  const days: { date: Date; current: boolean }[] = []
  for (let i = startDow - 1; i >= 0; i--) days.push({ date: new Date(year, month, -i), current: false })
  for (let d = 1; d <= lastDay.getDate(); d++) days.push({ date: new Date(year, month, d), current: true })
  while (days.length < 42) {
    const next = new Date(days[days.length - 1].date)
    next.setDate(next.getDate() + 1)
    days.push({ date: next, current: false })
  }
  return days
}

function calDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function calIsToday(d: Date) {
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

const SESSION_STATUS_COLORS: Record<string, string> = {
  scheduled: '#3B82F6',
  completed: '#10B981',
  cancelled: '#71717A',
  no_show:   '#EF4444',
}

// ─── Sessions Calendar Content ──────────────────────────────────────────────

type CalSession = CoachingSession & { student: { id: string; first_name: string; last_name: string | null; email: string | null } | null }

function SessionsCalendarContent({
  year, month, sessions, loading,
  onPrevMonth, onNextMonth, onToday,
  onSelectSession, onSelectStudent,
}: {
  year: number
  month: number
  sessions: CalSession[]
  loading: boolean
  onPrevMonth: () => void
  onNextMonth: () => void
  onToday: () => void
  onSelectSession: (s: CalSession) => void
  onSelectStudent: (s: { id: string }) => void
}) {
  const days = useMemo(() => getMonthDays(year, month), [year, month])

  const sessionsByDate = useMemo(() => {
    const map: Record<string, CalSession[]> = {}
    for (const s of sessions) {
      const d = new Date(s.session_date)
      const key = calDateStr(d)
      if (!map[key]) map[key] = []
      map[key].push(s)
    }
    return map
  }, [sessions])

  // KPI calculations
  const kpis = useMemo(() => {
    const scheduled = sessions.filter((s) => s.status === 'scheduled').length
    const completed = sessions.filter((s) => s.status === 'completed').length
    const cancelled = sessions.filter((s) => s.status === 'cancelled').length
    const noShow = sessions.filter((s) => s.status === 'no_show').length
    const denom = completed + noShow + cancelled
    const rate = denom > 0 ? Math.round((completed / denom) * 100) : 0
    return { scheduled, completed, cancelled, noShow, rate }
  }, [sessions])

  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Scheduled', value: kpis.scheduled, color: 'text-[#89bcef] dark:text-[#89bcef]' },
          { label: 'Completed', value: kpis.completed, color: 'text-green-600 dark:text-green-400' },
          { label: 'Cancelled', value: kpis.cancelled, color: 'text-zinc-500 dark:text-zinc-400' },
          { label: 'No Shows', value: kpis.noShow, color: kpis.noShow > 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-500 dark:text-zinc-400' },
          { label: 'Completion Rate', value: `${kpis.rate}%`, color: 'text-zinc-900 dark:text-zinc-100' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">{label}</p>
            <p className={cn('text-2xl font-bold', color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button onClick={onPrevMonth} className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 w-40 text-center">
            {MONTH_NAMES[month]} {year}
          </span>
          <button onClick={onNextMonth} className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button onClick={onToday} className="text-xs text-[#89bcef] dark:text-[#89bcef] hover:underline">
          Today
        </button>
      </div>

      {/* Calendar grid */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-zinc-100 dark:border-zinc-800">
          {DAY_NAMES.map((d) => (
            <div key={d} className="py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {d}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-7">
            {[...Array(42)].map((_, i) => (
              <div key={i} className="h-24 border-b border-r border-zinc-50 dark:border-zinc-800/50 p-1">
                <div className="h-4 w-4 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {days.map(({ date, current }, i) => {
              const key = calDateStr(date)
              const daySessions = sessionsByDate[key] ?? []
              const today = calIsToday(date)

              return (
                <div
                  key={i}
                  className={cn(
                    'min-h-[96px] border-b border-r border-zinc-50 dark:border-zinc-800/50 p-1 transition-colors',
                    !current && 'bg-zinc-50/50 dark:bg-zinc-800/20',
                  )}
                >
                  <span className={cn(
                    'inline-flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full mb-0.5',
                    today
                      ? 'bg-[#ffbd59] text-[#1a1a2e]'
                      : current
                        ? 'text-zinc-700 dark:text-zinc-300'
                        : 'text-zinc-300 dark:text-zinc-600',
                  )}>
                    {date.getDate()}
                  </span>
                  <div className="space-y-0.5">
                    {daySessions.slice(0, 3).map((s) => {
                      const color = SESSION_STATUS_COLORS[s.status] ?? '#6B7280'
                      const name = s.student
                        ? [s.student.first_name, s.student.last_name].filter(Boolean).join(' ')
                        : 'Unknown'
                      const time = new Date(s.session_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                      return (
                        <button
                          key={s.id}
                          onClick={() => onSelectSession(s)}
                          className="w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium truncate leading-tight transition-opacity hover:opacity-80"
                          style={{ backgroundColor: `${color}20`, color }}
                          title={`${name} · ${time}`}
                        >
                          {name} · {time}
                        </button>
                      )
                    })}
                    {daySessions.length > 3 && (
                      <p className="text-[9px] text-zinc-400 px-1">+{daySessions.length - 3} more</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StudentsPage() {
  const supabase = useMemo(() => createClient(), [])
  const [students, setStudents] = useState<PwuStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('all')

  // Search & filters
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterCohort, setFilterCohort] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')

  // View mode & sidebar
  const [view, setView] = useState<ViewMode>('list')
  const [sidebarCohort, setSidebarCohort] = useState<string>('all')

  // Modals
  const [addOpen, setAddOpen] = useState(false)
  const [cohortOpen, setCohortOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<PwuStudent | null>(null)
  const [notesTarget, setNotesTarget] = useState<PwuStudent | null>(null)
  const [graduateTarget, setGraduateTarget] = useState<PwuStudent | null>(null)
  const [pauseTarget, setPauseTarget] = useState<PwuStudent | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PwuStudent | null>(null)

  // Profile modal
  const [selectedStudent, setSelectedStudent] = useState<PwuStudent | null>(null)
  const [profileNotes, setProfileNotes] = useState<StudentNote[]>([])
  const [profileTransactions, setProfileTransactions] = useState<Transaction[]>([])
  const [profilePaymentPlan, setProfilePaymentPlan] = useState<StudentPaymentPlan | null>(null)
  const [profileSessions, setProfileSessions] = useState<CoachingSession[]>([])

  // Pipeline data
  const [pipelineRecords, setPipelineRecords] = useState<Record<string, PipelineRecord>>({})

  // Registered cohorts (from pwu_cohorts table)
  const [registeredCohorts, setRegisteredCohorts] = useState<string[]>([])

  // Payment plans dashboard
  const [ppData, setPpData] = useState<PaymentPlanData | null>(null)
  const [ppLoading, setPpLoading] = useState(true)

  // Sessions calendar
  const [calYear, setCalYear] = useState(() => new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth())
  const [calSessions, setCalSessions] = useState<(CoachingSession & { student: { id: string; first_name: string; last_name: string | null; email: string | null } | null })[]>([])
  const [calLoading, setCalLoading] = useState(false)
  const [calDetailSession, setCalDetailSession] = useState<typeof calSessions[number] | null>(null)

  const fetchPaymentPlans = useCallback(async () => {
    setPpLoading(true)
    try {
      const res = await fetch('/api/students/payment-plans')
      if (res.ok) {
        const json = await res.json()
        setPpData(json)
      }
    } catch {
      // silent — non-critical section
    }
    setPpLoading(false)
  }, [])

  const fetchCohorts = useCallback(async () => {
    try {
      const res = await fetch('/api/students/cohorts')
      if (res.ok) setRegisteredCohorts(await res.json())
    } catch { /* silent */ }
  }, [])

  const fetchStudents = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('pwu_students')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) toast.error(`Error loading students: ${error.message}`)
    setStudents(data ?? [])
    setLoading(false)
  }, [supabase])

  const fetchPipeline = useCallback(async () => {
    try {
      const res = await fetch('/api/client-success/pipeline')
      if (res.ok) {
        const data: PipelineRecord[] = await res.json()
        const map: Record<string, PipelineRecord> = {}
        data.forEach((r) => { map[r.student_id] = r })
        setPipelineRecords(map)
      }
    } catch { /* silent */ }
  }, [])

  const calMonthKey = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`
  const fetchCalSessions = useCallback(async () => {
    setCalLoading(true)
    try {
      const res = await fetch(`/api/students/sessions/all?month=${calMonthKey}`)
      if (res.ok) setCalSessions(await res.json())
    } catch { /* silent */ }
    setCalLoading(false)
  }, [calMonthKey])

  useEffect(() => { fetchStudents(); fetchPaymentPlans(); fetchCohorts(); fetchPipeline() }, [fetchStudents, fetchPaymentPlans, fetchCohorts, fetchPipeline])
  useEffect(() => { if (tab === 'sessions') fetchCalSessions() }, [tab, fetchCalSessions])

  // Fetch notes, transactions, and payment plan when a student profile is opened
  useEffect(() => {
    if (!selectedStudent) {
      setProfileNotes([])
      setProfileTransactions([])
      setProfilePaymentPlan(null)
      setProfileSessions([])
      return
    }

    supabase
      .from('student_notes')
      .select('*')
      .eq('student_id', selectedStudent.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setProfileNotes(data ?? []))

    fetch(`/api/students/sessions?student_id=${selectedStudent.id}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setProfileSessions(data))
      .catch(() => setProfileSessions([]))

    if (selectedStudent.email) {
      supabase
        .from('transactions')
        .select('*')
        .eq('buyer_email', selectedStudent.email)
        .order('date', { ascending: false })
        .then(({ data }) => {
          const pwu = (data ?? []).filter((tx) =>
            getCanonicalProduct(tx.offer_title).startsWith('Parenting With Understanding')
          )
          setProfileTransactions(pwu)
        })
    } else {
      setProfileTransactions([])
    }

    supabase
      .from('student_payment_plans')
      .select('*')
      .eq('student_id', selectedStudent.id)
      .maybeSingle()
      .then(({ data }) => setProfilePaymentPlan(data ?? null))
  }, [selectedStudent, supabase])

  // Derived
  const allCohorts = useMemo(() => {
    const s = new Set(students.map((s) => s.cohort))
    for (const c of registeredCohorts) s.add(c)
    return sortCohorts(Array.from(s))
  }, [students, registeredCohorts])

  const groupCohorts = useMemo(() => allCohorts.filter((c) => {
    const lower = c.toLowerCase()
    return (
      c !== '1:1' &&
      lower !== 'refund' &&
      lower !== 'unknown' &&
      lower !== 'pausado' &&
      !isNaN(Number(c))
    )
  }), [allCohorts])

  const nextSuggested = useMemo(() => {
    const nums = groupCohorts.map(Number).filter((n) => !isNaN(n))
    return nums.length > 0 ? Math.max(...nums) + 1 : 1
  }, [groupCohorts])

  // KPIs
  const kpis = useMemo(() => {
    const active = students.filter((s) => s.status === 'active').length
    const graduated = students.filter((s) => s.status === 'graduated').length
    const total = students.filter((s) => s.status === 'active' || s.status === 'graduated').length
    const cohortCount = new Set(students.map((s) => s.cohort)).size
    return { total, graduated, active, cohortCount, gradPct: total > 0 ? Math.round((graduated / total) * 100) : 0 }
  }, [students])

  // Filtered students
  const filtered = useMemo(() => {
    let list = students
    if (tab === 'group') list = list.filter((s) => s.type === 'group')
    else if (tab === 'individual') list = list.filter((s) => s.type === 'individual')
    else if (tab === 'graduated') list = list.filter((s) => s.status === 'graduated')
    else if (tab === 'paused') list = list.filter((s) => s.status === 'paused' || s.status === 'refund')

    if (filterStatus !== 'all') list = list.filter((s) => s.status === filterStatus)
    if (filterCohort !== 'all') list = list.filter((s) => s.cohort === filterCohort)
    if (filterType !== 'all') list = list.filter((s) => s.type === filterType)

    const q = search.toLowerCase().trim()
    if (q) list = list.filter((s) =>
      fullName(s).toLowerCase().includes(q) || (s.email ?? '').toLowerCase().includes(q)
    )
    return list
  }, [students, tab, filterStatus, filterCohort, filterType, search])

  // Students to display — respects sidebar cohort selection for group tab
  const displayStudents = useMemo(() => {
    if (tab === 'group' && sidebarCohort !== 'all') {
      return filtered.filter((s) => s.cohort === sidebarCohort)
    }
    return filtered
  }, [filtered, tab, sidebarCohort])

  // ─── Actions ───────────────────────────────────────────────────────────────

  async function handleAdd(form: StudentFormData) {
    const cohort = form.type === 'individual'
      ? '1:1'
      : form.cohort === '__new__' ? form.cohortNew.trim() : form.cohort

    const { error } = await supabase.from('pwu_students').insert({
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      type: form.type,
      cohort,
      status: form.status,
      notes: form.notes.trim() || null,
    })
    if (error) { toast.error(`Error: ${error.message}`); return }
    toast.success('Student added')
    setAddOpen(false)
    fetchStudents()
  }

  async function handleEdit(form: StudentFormData) {
    if (!editTarget) return
    const cohort = form.type === 'individual'
      ? '1:1'
      : form.cohort === '__new__' ? form.cohortNew.trim() : form.cohort

    const { error } = await supabase.from('pwu_students').update({
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      type: form.type,
      cohort,
      status: form.status,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', editTarget.id)
    if (error) { toast.error(`Error: ${error.message}`); return }
    toast.success('Student updated')
    setEditTarget(null)
    fetchStudents()
  }

  async function handleSaveNotes(notes: string) {
    if (!notesTarget) return
    const { error } = await supabase.from('pwu_students')
      .update({ notes: notes.trim() || null, updated_at: new Date().toISOString() })
      .eq('id', notesTarget.id)
    if (error) { toast.error(`Error: ${error.message}`); return }
    toast.success('Notes saved')
    setNotesTarget(null)
    fetchStudents()
  }

  async function handleGraduate() {
    if (!graduateTarget) return
    const { error } = await supabase.from('pwu_students')
      .update({ status: 'graduated', graduated_at: new Date().toISOString().split('T')[0], updated_at: new Date().toISOString() })
      .eq('id', graduateTarget.id)
    if (error) { toast.error(`Error: ${error.message}`); return }
    toast.success(`${fullName(graduateTarget)} graduated 🎓`)
    setGraduateTarget(null)
    fetchStudents()
  }

  async function handlePause() {
    if (!pauseTarget) return
    const { error } = await supabase.from('pwu_students')
      .update({ status: 'paused', updated_at: new Date().toISOString() })
      .eq('id', pauseTarget.id)
    if (error) { toast.error(`Error: ${error.message}`); return }
    toast.success(`${fullName(pauseTarget)} paused`)
    setPauseTarget(null)
    fetchStudents()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const { error } = await supabase.from('pwu_students').delete().eq('id', deleteTarget.id)
    if (error) { toast.error(`Error: ${error.message}`); return }
    toast.success('Student deleted')
    setDeleteTarget(null)
    fetchStudents()
  }

  async function handleStatusChange(student: PwuStudent, status: StudentStatus) {
    const updates: Partial<PwuStudent> & { updated_at: string } = {
      status,
      updated_at: new Date().toISOString(),
    }
    if (status === 'graduated' && !student.graduated_at) {
      updates.graduated_at = new Date().toISOString().split('T')[0]
    }
    const { error } = await supabase.from('pwu_students').update(updates).eq('id', student.id)
    if (error) { toast.error(`Error: ${error.message}`); return }
    toast.success('Status updated')
    fetchStudents()
  }

  async function handleAddNote(text: string) {
    if (!selectedStudent) return

    const { data: { user } } = await supabase.auth.getUser()
    let authorName = 'Admin'
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single()
      if (profile?.full_name) authorName = profile.full_name
    }

    const now = new Date().toISOString()

    const { data: noteData, error } = await supabase
      .from('student_notes')
      .insert({ student_id: selectedStudent.id, note: text, created_by: authorName })
      .select()
      .single()
    if (error) { toast.error(`Error: ${error.message}`); return }

    // Update last_contacted_at
    await supabase
      .from('pwu_students')
      .update({ last_contacted_at: now, updated_at: now })
      .eq('id', selectedStudent.id)

    if (noteData) {
      setProfileNotes((prev) => [noteData, ...prev])
    }

    // Update local students list + selectedStudent
    setStudents((prev) => prev.map((s) =>
      s.id === selectedStudent.id ? { ...s, last_contacted_at: now } : s
    ))
    setSelectedStudent((prev) => prev ? { ...prev, last_contacted_at: now } : null)

    toast.success('Note added')
  }

  async function handleCohortDateChange(date: string) {
    if (!selectedStudent) return
    const { error } = await supabase
      .from('pwu_students')
      .update({ cohort_assigned_at: date || null, updated_at: new Date().toISOString() })
      .eq('id', selectedStudent.id)
    if (error) { toast.error(`Error: ${error.message}`); return }
    setSelectedStudent((prev) => prev ? { ...prev, cohort_assigned_at: date || null } : null)
    setStudents((prev) => prev.map((s) =>
      s.id === selectedStudent.id ? { ...s, cohort_assigned_at: date || null } : s
    ))
  }

  async function handleSavePaymentPlan(form: PaymentPlanFormData) {
    if (!selectedStudent) return
    if (profilePaymentPlan) {
      const { error } = await supabase
        .from('student_payment_plans')
        .update(form)
        .eq('id', profilePaymentPlan.id)
      if (error) { toast.error(`Error: ${error.message}`); return }
      setProfilePaymentPlan({ ...profilePaymentPlan, ...form })
      toast.success('Payment plan updated')
    } else {
      const { data, error } = await supabase
        .from('student_payment_plans')
        .insert({ student_id: selectedStudent.id, ...form })
        .select()
        .single()
      if (error) { toast.error(`Error: ${error.message}`); return }
      setProfilePaymentPlan(data)
      toast.success('Payment plan saved')
    }
  }

  function exportCSV() {
    const rows = [
      ['First Name', 'Last Name', 'Email', 'Phone', 'Cohort', 'Type', 'Status', 'Payment Date', 'Payment Amount', 'Last Contacted', 'Notes', 'Created'],
      ...students.map((s) => [
        s.first_name,
        s.last_name ?? '',
        s.email ?? '',
        s.phone ?? '',
        s.cohort,
        s.type,
        s.status,
        s.payment_date ?? '',
        s.payment_amount ?? '',
        s.last_contacted_at ? s.last_contacted_at.split('T')[0] : '',
        s.notes ?? '',
        s.created_at.split('T')[0],
      ]),
    ]
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'pwu_students.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const actions: StudentActions = {
    onEdit: setEditTarget,
    onNotes: setNotesTarget,
    onGraduate: setGraduateTarget,
    onPause: setPauseTarget,
    onDelete: setDeleteTarget,
    onStatusChange: handleStatusChange,
    onSelect: setSelectedStudent,
    pipelineRecords,
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const tabs: { key: Tab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'group', label: 'Group Cohorts' },
    { key: 'individual', label: 'Individual 1:1' },
    { key: 'graduated', label: 'Graduated' },
    { key: 'paused', label: 'Paused / Refund' },
    { key: 'sessions', label: 'Sessions' },
  ]

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto">
        <PageHeader title="PWU Students" description="Parenting With Understanding program management">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90 transition-opacity"
              style={{ backgroundColor: '#ffbd59' }}
            >
              <Plus className="h-3.5 w-3.5" /> Add Student
            </button>
            <button
              onClick={() => setCohortOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90 transition-opacity"
              style={{ backgroundColor: '#1D9E75' }}
            >
              <Plus className="h-3.5 w-3.5" /> New Cohort
            </button>
            <button
              onClick={exportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          </div>
        </PageHeader>

        {/* Payment Plans Dashboard */}
        <PaymentPlansDashboard data={ppData} loading={ppLoading} />

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total Students', value: kpis.total, sub: 'active + graduated' },
            { label: 'Graduated', value: kpis.graduated, sub: `${kpis.gradPct}% of total` },
            { label: 'Active', value: kpis.active, sub: 'currently enrolled' },
            { label: 'Cohorts', value: kpis.cohortCount, sub: 'unique cohorts' },
          ].map(({ label, value, sub }) => (
            <div key={label} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">{label}</p>
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        {/* Tabs bar — always visible */}
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1 overflow-x-auto">
            {tabs.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => { setTab(key); setSidebarCohort('all') }}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors',
                  tab === key
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {tab !== 'sessions' && (
            <div className="flex items-center gap-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1 shrink-0">
              {([
                { v: 'list' as ViewMode, Icon: List, title: 'List view' },
                { v: 'card' as ViewMode, Icon: LayoutGrid, title: 'Card view' },
                { v: 'table' as ViewMode, Icon: Table2, title: 'Table view' },
              ]).map(({ v, Icon, title }) => (
                <button
                  key={v}
                  title={title}
                  onClick={() => setView(v)}
                  className={cn(
                    'p-1.5 rounded-md transition-colors',
                    view === v
                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tab content */}
        {tab === 'sessions' ? (
          <SessionsCalendarContent
            year={calYear}
            month={calMonth}
            sessions={calSessions}
            loading={calLoading}
            onPrevMonth={() => { if (calMonth === 0) { setCalYear(calYear - 1); setCalMonth(11) } else setCalMonth(calMonth - 1) }}
            onNextMonth={() => { if (calMonth === 11) { setCalYear(calYear + 1); setCalMonth(0) } else setCalMonth(calMonth + 1) }}
            onToday={() => { setCalYear(new Date().getFullYear()); setCalMonth(new Date().getMonth()) }}
            onSelectSession={setCalDetailSession}
            onSelectStudent={(s) => {
              const found = students.find((st) => st.id === s.id)
              if (found) setSelectedStudent(found)
            }}
          />
        ) : (
        <div className={cn('flex gap-4', tab === 'group' ? 'items-start' : '')}>

          {/* ── Cohort Sidebar (group tab only) ── */}
          {tab === 'group' && (
            <div className="w-[220px] shrink-0 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden sticky top-4 self-start">
              <div className="px-3 py-2.5 border-b border-zinc-100 dark:border-zinc-800">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Cohorts</p>
              </div>
              <div className="overflow-y-auto max-h-[calc(100vh-320px)]">
                <button
                  onClick={() => setSidebarCohort('all')}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium transition-colors',
                    sidebarCohort === 'all'
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                  )}
                >
                  <span>All Cohorts</span>
                  <span className={cn(
                    'text-xs px-1.5 py-0.5 rounded-full font-semibold',
                    sidebarCohort === 'all'
                      ? 'bg-blue-100 dark:bg-blue-800/60 text-blue-700 dark:text-blue-300'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                  )}>
                    {filtered.length}
                  </span>
                </button>
                {groupCohorts.map((cohort) => {
                  const count = filtered.filter((s) => s.cohort === cohort).length
                  const isSelected = sidebarCohort === cohort
                  return (
                    <button
                      key={cohort}
                      onClick={() => setSidebarCohort(cohort)}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium transition-colors',
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                      )}
                    >
                      <span>Cohort {cohort}</span>
                      <span className={cn(
                        'text-xs px-1.5 py-0.5 rounded-full font-semibold',
                        isSelected
                          ? 'bg-blue-100 dark:bg-blue-800/60 text-blue-700 dark:text-blue-300'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                      )}>
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Main Panel ── */}
          <div className="flex-1 min-w-0">

            {/* Search & filters */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                <input
                  className="w-full pl-8 pr-3 py-2 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30"
                  placeholder="Search by name or email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {tab !== 'group' && tab !== 'individual' && (
                <select
                  className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-2 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                >
                  <option value="all">All types</option>
                  <option value="group">Group</option>
                  <option value="individual">Individual</option>
                </select>
              )}
              {tab !== 'graduated' && tab !== 'paused' && tab !== 'group' && (
                <select
                  className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-2 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="graduated">Graduated</option>
                  <option value="paused">Paused</option>
                  <option value="refund">Refund</option>
                </select>
              )}
              {tab !== 'group' && (
                <select
                  className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-2 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                  value={filterCohort}
                  onChange={(e) => setFilterCohort(e.target.value)}
                >
                  <option value="all">All cohorts</option>
                  {allCohorts.map((c) => <option key={c} value={c}>{c === '1:1' ? '1:1' : `Cohort ${c}`}</option>)}
                </select>
              )}
            </div>

            {/* Graduated banner */}
            {tab === 'graduated' && displayStudents.length > 0 && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3 text-sm text-green-700 dark:text-green-300 font-medium mb-4">
                {displayStudents.length} {displayStudents.length === 1 ? 'student has' : 'students have'} completed the program 🎓
              </div>
            )}

            {/* Content */}
            {loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-14 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-xl" />
                ))}
              </div>
            ) : displayStudents.length === 0 ? (
              <EmptyState
                title="No students found"
                description={tab === 'group' ? 'Add group students using the button above.' : 'Add students using the button above.'}
                icon={<GraduationCap className="h-10 w-10" />}
              />
            ) : view === 'card' ? (
              <CardView
                students={tab === 'graduated'
                  ? [...displayStudents].sort((a, b) => (b.graduated_at ?? '').localeCompare(a.graduated_at ?? ''))
                  : sortStudents(displayStudents)}
                actions={actions}
                showCohort={tab !== 'individual'}
              />
            ) : view === 'table' ? (
              <TableView
                students={displayStudents}
                actions={actions}
                showCohort={tab !== 'individual'}
                showType={tab === 'all'}
              />
            ) : (
              <ListView
                students={tab === 'graduated'
                  ? [...displayStudents].sort((a, b) => (b.graduated_at ?? '').localeCompare(a.graduated_at ?? ''))
                  : sortStudents(displayStudents)}
                actions={actions}
                showCohort={tab !== 'individual'}
              />
            )}
          </div>
        </div>
        )}
      </div>

      {/* ── Session Detail Modal ── */}
      {calDetailSession && (
        <Modal title="Session Details" onClose={() => setCalDetailSession(null)}>
          <div className="space-y-4">
            {calDetailSession.student && (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-sm font-bold text-blue-600 dark:text-blue-300">
                  {[calDetailSession.student.first_name?.[0], calDetailSession.student.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?'}
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {[calDetailSession.student.first_name, calDetailSession.student.last_name].filter(Boolean).join(' ')}
                  </p>
                  {calDetailSession.student.email && (
                    <p className="text-xs text-zinc-400">{calDetailSession.student.email}</p>
                  )}
                </div>
              </div>
            )}
            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Date & Time</span>
                <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  {new Date(calDetailSession.session_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  {' at '}
                  {new Date(calDetailSession.session_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Duration</span>
                <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{calDetailSession.duration_minutes} min</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Type</span>
                <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{calDetailSession.session_type === 'individual' ? 'Individual' : 'Group'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Status</span>
                <select
                  value={calDetailSession.status}
                  onChange={async (e) => {
                    const newStatus = e.target.value
                    const res = await fetch(`/api/students/sessions/${calDetailSession.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status: newStatus }),
                    })
                    if (res.ok) {
                      toast.success('Status updated')
                      setCalDetailSession({ ...calDetailSession, status: newStatus as CoachingSession['status'] })
                      fetchCalSessions()
                    } else toast.error('Failed to update')
                  }}
                  className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="no_show">No Show</option>
                </select>
              </div>
            </div>
            {calDetailSession.notes && (
              <div>
                <p className="text-xs text-zinc-500 mb-1">Notes</p>
                <p className="text-xs text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2 whitespace-pre-wrap">{calDetailSession.notes}</p>
              </div>
            )}
            {calDetailSession.student && (
              <button
                onClick={() => {
                  const found = students.find((s) => s.id === calDetailSession.student!.id)
                  if (found) { setCalDetailSession(null); setSelectedStudent(found) }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <ExternalLink className="h-3 w-3" /> View Student
              </button>
            )}
          </div>
        </Modal>
      )}

      {/* ── Modals ── */}

      {selectedStudent && (
        <StudentProfileModal
          student={selectedStudent}
          notes={profileNotes}
          transactions={profileTransactions}
          paymentPlan={profilePaymentPlan}
          sessions={profileSessions}
          onClose={() => setSelectedStudent(null)}
          onEdit={(s) => { setSelectedStudent(null); setEditTarget(s) }}
          onGraduate={(s) => { setSelectedStudent(null); setGraduateTarget(s) }}
          onPause={(s) => { setSelectedStudent(null); setPauseTarget(s) }}
          onDelete={(s) => { setSelectedStudent(null); setDeleteTarget(s) }}
          onAddNote={handleAddNote}
          onCohortDateChange={handleCohortDateChange}
          onStudentUpdate={(updated) => {
            setStudents((prev) => prev.map((s) => s.id === updated.id ? updated : s))
            setSelectedStudent(updated)
          }}
          onSavePaymentPlan={handleSavePaymentPlan}
          onSessionsChange={() => {
            if (selectedStudent) {
              fetch(`/api/students/sessions?student_id=${selectedStudent.id}`)
                .then((r) => r.ok ? r.json() : [])
                .then((data) => setProfileSessions(data))
            }
          }}
        />
      )}

      {addOpen && (
        <StudentFormModal
          title="Add Student"
          initial={emptyForm}
          existingCohorts={allCohorts}
          onClose={() => setAddOpen(false)}
          onSave={handleAdd}
        />
      )}
      {editTarget && (
        <StudentFormModal
          title="Edit Student"
          initial={{
            first_name: editTarget.first_name,
            last_name: editTarget.last_name ?? '',
            email: editTarget.email ?? '',
            phone: editTarget.phone ?? '',
            type: editTarget.type,
            cohort: editTarget.cohort === '1:1' ? '' : editTarget.cohort,
            cohortNew: '',
            status: editTarget.status,
            notes: editTarget.notes ?? '',
          }}
          existingCohorts={allCohorts}
          onClose={() => setEditTarget(null)}
          onSave={handleEdit}
        />
      )}
      {cohortOpen && (
        <NewCohortModal
          nextSuggested={nextSuggested}
          onClose={() => setCohortOpen(false)}
          onCreated={async (cohort) => {
            const res = await fetch('/api/students/cohorts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cohort_number: cohort }),
            })
            if (!res.ok) {
              const body = await res.json().catch(() => ({ error: 'Failed to create cohort' }))
              toast.error(body.error ?? 'Failed to create cohort')
              return false
            }
            await fetchCohorts()
            return true
          }}
        />
      )}
      {notesTarget && (
        <NotesModal student={notesTarget} onClose={() => setNotesTarget(null)} onSave={handleSaveNotes} />
      )}
      {graduateTarget && (
        <ConfirmModal
          title="Graduate Student"
          message={`Mark ${fullName(graduateTarget)} as graduated?`}
          confirmLabel="Graduate 🎓"
          onClose={() => setGraduateTarget(null)}
          onConfirm={handleGraduate}
        />
      )}
      {pauseTarget && (
        <ConfirmModal
          title="Pause Student"
          message={`Mark ${fullName(pauseTarget)} as paused?`}
          confirmLabel="Pause"
          onClose={() => setPauseTarget(null)}
          onConfirm={handlePause}
        />
      )}
      {deleteTarget && (
        <ConfirmModal
          title="Delete Student"
          message={`Permanently delete ${fullName(deleteTarget)}? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}
    </PageTransition>
  )
}

// ─── Pipeline Step Badge ─────────────────────────────────────────────────────

function StepBadge({ pipeline }: { pipeline?: PipelineRecord }) {
  if (!pipeline) return <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>

  const step = pipeline.current_step
  const statusKey = `step${step}_status` as keyof PipelineRecord
  const status = (pipeline[statusKey] as string) ?? 'pending'
  const name = STEP_NAMES[step] ?? ''

  return (
    <div className="flex items-center gap-1.5 group/step relative">
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white shrink-0"
        style={{ backgroundColor: STEP_COLORS[step] ?? '#94a3b8' }}
      >
        {step}
      </span>
      <span
        className={cn(
          'inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap',
          status === 'completed' && 'bg-[#b9d496]/30 text-green-700 dark:text-green-400',
          status === 'waiting' && 'bg-[#ffbd59]/30 text-amber-700 dark:text-amber-400',
          status === 'pending' && 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400',
        )}
      >
        {status === 'completed' ? 'Done' : status === 'waiting' ? 'Wait' : 'Pending'}
      </span>
      {/* Tooltip */}
      <div className="absolute bottom-full left-0 mb-1 hidden group-hover/step:block z-30 pointer-events-none">
        <div className="px-2 py-1 rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[10px] font-medium whitespace-nowrap shadow-lg">
          Step {step} — {name}
        </div>
      </div>
    </div>
  )
}

// ─── View Components ─────────────────────────────────────────────────────────

function ListView({ students, actions, showCohort = true }: {
  students: PwuStudent[]
  actions: StudentActions
  showCohort?: boolean
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800">
      {students.map((s) => (
        <div
          key={s.id}
          onClick={() => actions.onSelect(s)}
          className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 cursor-pointer group transition-colors"
        >
          {/* Avatar */}
          <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-300 shrink-0">
            {initials(s)}
          </div>

          {/* Name + email — flex-1, takes remaining space */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate leading-tight">{fullName(s)}</p>
            <p className="text-xs text-zinc-400 truncate mt-0.5">{s.email ?? '—'}</p>
          </div>

          {/* Cohort — fixed 80px, always present (invisible when not applicable) */}
          <div className="hidden sm:flex w-20 justify-end shrink-0">
            {showCohort && (
              <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                {s.type === 'individual' ? '1:1' : `C${s.cohort}`}
              </span>
            )}
          </div>

          {/* Pipeline Step — fixed 120px, hidden on small */}
          {s.status === 'active' && (
            <div className="hidden md:flex w-[120px] justify-end shrink-0">
              <StepBadge pipeline={actions.pipelineRecords[s.id]} />
            </div>
          )}

          {/* Status — fixed 160px */}
          <div className="w-40 flex justify-end shrink-0">
            <StatusBadge status={s.status} />
          </div>

          {/* Last contacted — fixed 160px, hidden on small screens */}
          <div className="hidden lg:flex w-40 justify-end shrink-0">
            <LastContactBadge ts={s.last_contacted_at} />
          </div>

          {/* Actions — fixed 80px, always occupy space, visible on hover */}
          <div
            className="w-20 flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <ActionBtn title="Edit" onClick={() => actions.onEdit(s)}>
              <Pencil className="h-3.5 w-3.5" />
            </ActionBtn>
            <ActionBtn
              title="Graduate"
              onClick={() => actions.onGraduate(s)}
              className={cn('text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20', s.status !== 'active' && 'invisible pointer-events-none')}
            >
              <GraduationCap className="h-3.5 w-3.5" />
            </ActionBtn>
            <ActionBtn
              title="Pause"
              onClick={() => actions.onPause(s)}
              className={cn('text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20', s.status !== 'active' && 'invisible pointer-events-none')}
            >
              <PauseCircle className="h-3.5 w-3.5" />
            </ActionBtn>
            <ActionBtn title="Delete" onClick={() => actions.onDelete(s)} className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
              <Trash2 className="h-3.5 w-3.5" />
            </ActionBtn>
          </div>
        </div>
      ))}
    </div>
  )
}

function CardView({ students, actions, showCohort = true }: {
  students: PwuStudent[]
  actions: StudentActions
  showCohort?: boolean
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {students.map((s) => (
        <div
          key={s.id}
          onClick={() => actions.onSelect(s)}
          className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm cursor-pointer transition-all group"
        >
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-sm font-bold text-blue-600 dark:text-blue-300 shrink-0">
              {initials(s)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate leading-tight">{fullName(s)}</p>
              <p className="text-xs text-zinc-400 truncate mt-0.5">{s.email ?? '—'}</p>
            </div>
            <StatusBadge status={s.status} />
          </div>
          <div className="flex items-center gap-2 flex-wrap mb-3">
            {showCohort && (
              <span className="px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {s.type === 'individual' ? '1:1' : `Cohort ${s.cohort}`}
              </span>
            )}
            <span className="flex items-center gap-1 text-xs">
              <Clock className="h-3 w-3 text-zinc-400 shrink-0" />
              <LastContactBadge ts={s.last_contacted_at} />
            </span>
          </div>
          {s.status === 'active' && actions.pipelineRecords[s.id] && (
            <div className="mb-2">
              <StepBadge pipeline={actions.pipelineRecords[s.id]} />
            </div>
          )}
          <div
            className="flex items-center gap-0.5 pt-2 border-t border-zinc-100 dark:border-zinc-800 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <ActionBtn title="Edit" onClick={() => actions.onEdit(s)}><Pencil className="h-3.5 w-3.5" /></ActionBtn>
            <ActionBtn title="Notes" onClick={() => actions.onNotes(s)}><FileText className="h-3.5 w-3.5" /></ActionBtn>
            {s.status === 'active' && (
              <ActionBtn title="Graduate" onClick={() => actions.onGraduate(s)} className="text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20">
                <GraduationCap className="h-3.5 w-3.5" />
              </ActionBtn>
            )}
            {s.status === 'active' && (
              <ActionBtn title="Pause" onClick={() => actions.onPause(s)} className="text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20">
                <PauseCircle className="h-3.5 w-3.5" />
              </ActionBtn>
            )}
            <ActionBtn title="Delete" onClick={() => actions.onDelete(s)} className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
              <Trash2 className="h-3.5 w-3.5" />
            </ActionBtn>
          </div>
        </div>
      ))}
    </div>
  )
}

type SortKey = 'name' | 'email' | 'status' | 'cohort' | 'last_contacted'

function TableView({ students, actions, showCohort = true, showType = false }: {
  students: PwuStudent[]
  actions: StudentActions
  showCohort?: boolean
  showType?: boolean
}) {
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [statusOpen, setStatusOpen] = useState<string | null>(null)

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const sorted = useMemo(() => {
    return [...students].sort((a, b) => {
      let av = '', bv = ''
      if (sortKey === 'name') { av = fullName(a).toLowerCase(); bv = fullName(b).toLowerCase() }
      else if (sortKey === 'email') { av = a.email ?? ''; bv = b.email ?? '' }
      else if (sortKey === 'status') { av = String(STATUS_ORDER.indexOf(a.status)); bv = String(STATUS_ORDER.indexOf(b.status)) }
      else if (sortKey === 'cohort') { av = a.cohort; bv = b.cohort }
      else if (sortKey === 'last_contacted') { av = a.last_contacted_at ?? ''; bv = b.last_contacted_at ?? '' }
      const c = av.localeCompare(bv)
      return sortDir === 'asc' ? c : -c
    })
  }, [students, sortKey, sortDir])

  const thBase = 'px-4 py-3 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide whitespace-nowrap select-none'
  const thSort = cn(thBase, 'cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors')
  const sortIcon = (key: SortKey) => (
    <ArrowUpDown className={cn('h-3 w-3 inline ml-1 -mt-0.5', sortKey === key ? 'text-[#ffbd59]' : 'text-zinc-300 dark:text-zinc-600')} />
  )

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
            <th onClick={() => toggleSort('name')} className={thSort}>Name {sortIcon('name')}</th>
            <th onClick={() => toggleSort('email')} className={thSort}>Email {sortIcon('email')}</th>
            <th className={thBase}>Phone</th>
            {showCohort && <th onClick={() => toggleSort('cohort')} className={thSort}>Cohort {sortIcon('cohort')}</th>}
            {showType && <th className={thBase}>Type</th>}
            <th className={thBase}>Step</th>
            <th onClick={() => toggleSort('status')} className={thSort}>Status {sortIcon('status')}</th>
            <th onClick={() => toggleSort('last_contacted')} className={thSort}>Last Contacted {sortIcon('last_contacted')}</th>
            <th className={thBase}>Notes</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {sorted.map((s) => (
            <tr
              key={s.id}
              onClick={() => actions.onSelect(s)}
              className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 cursor-pointer group transition-colors"
            >
              <td className="px-4 py-3 whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-300 shrink-0">
                    {initials(s)}
                  </div>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">{fullName(s)}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">{s.email ?? '—'}</td>
              <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{s.phone ?? '—'}</td>
              {showCohort && (
                <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                  {s.type === 'individual' ? '1:1' : `Cohort ${s.cohort}`}
                </td>
              )}
              {showType && (
                <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400 capitalize whitespace-nowrap">
                  {s.type === 'individual' ? 'Individual' : 'Group'}
                </td>
              )}
              <td className="px-4 py-3 whitespace-nowrap">
                <StepBadge pipeline={actions.pipelineRecords[s.id]} />
              </td>
              <td className="px-4 py-3 relative" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setStatusOpen(statusOpen === s.id ? null : s.id)}>
                  <StatusBadge status={s.status} />
                </button>
                {statusOpen === s.id && (
                  <div className="absolute z-20 top-full left-0 mt-1 w-40 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden">
                    {STATUS_ORDER.map((st) => (
                      <button
                        key={st}
                        onClick={() => { actions.onStatusChange(s, st); setStatusOpen(null) }}
                        className={cn('w-full text-left px-3 py-2 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors', s.status === st && 'font-semibold')}
                      >
                        <StatusBadge status={st} />
                      </button>
                    ))}
                  </div>
                )}
              </td>
              <td className="px-4 py-3"><LastContactBadge ts={s.last_contacted_at} /></td>
              <td className="px-4 py-3 text-xs text-zinc-400 max-w-[120px] truncate">{s.notes ?? '—'}</td>
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ActionBtn title="Edit" onClick={() => actions.onEdit(s)}><Pencil className="h-3.5 w-3.5" /></ActionBtn>
                  <ActionBtn title="Notes" onClick={() => actions.onNotes(s)}><FileText className="h-3.5 w-3.5" /></ActionBtn>
                  {s.status === 'active' && (
                    <ActionBtn title="Graduate" onClick={() => actions.onGraduate(s)} className="text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20">
                      <GraduationCap className="h-3.5 w-3.5" />
                    </ActionBtn>
                  )}
                  {s.status === 'active' && (
                    <ActionBtn title="Pause" onClick={() => actions.onPause(s)} className="text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20">
                      <PauseCircle className="h-3.5 w-3.5" />
                    </ActionBtn>
                  )}
                  <ActionBtn title="Delete" onClick={() => actions.onDelete(s)} className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                    <Trash2 className="h-3.5 w-3.5" />
                  </ActionBtn>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
