'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/PageHeader'
import { PageTransition } from '@/components/motion/PageTransition'
import { KPICard } from '@/components/shared/KPICard'
import { KPICardGrid } from '@/components/motion/KPICardGrid'
import { toast } from 'sonner'
import { useProfile } from '@/hooks/useProfile'
import { usePreviewRole } from '@/contexts/PreviewRoleContext'
import {
  RefreshCw, Filter, Users, CheckCircle2, Clock, AlertCircle, Circle,
  ChevronDown, ChevronRight, X, Mail, Phone, Calendar, GripVertical,
  MessageSquare, Pencil, ChevronUp, CreditCard, DollarSign, Video, Plus,
  GraduationCap, PauseCircle, Trash2, ExternalLink,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { StudentNote, Transaction, StudentPaymentPlan, CoachingSession } from '@/types'
import { cn } from '@/lib/utils'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useDroppable, useDraggable } from '@dnd-kit/core'
import type { PwuStudent } from '@/types'

export const dynamic = 'force-dynamic'

// ─── Types ──────────────────────────────────────────────────────────────────

interface PipelineRecord {
  id: string
  student_id: string
  coach: string | null
  enrollment_date: string | null
  notes: string | null
  step1_status: string
  step1_date: string | null
  step2_status: string
  step2_date: string | null
  step3_status: string
  step3_date: string | null
  step4_status: string
  step4_date: string | null
  step5_status: string
  step5_date: string | null
  step6_status: string
  step6_date: string | null
  current_step: number
  created_at: string
  updated_at: string
  student: {
    id: string
    first_name: string
    last_name: string | null
    email: string | null
    phone: string | null
    type: string
    cohort: string | null
    cohort_assigned_at: string | null
    status: string
  } | null
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STEPS = [
  { num: 1, name: 'Welcome Message', color: '#ffbd59' },
  { num: 2, name: 'Message Video 1:1 or Group', color: '#89bcef' },
  { num: 3, name: 'Q & A Meeting', color: '#ffbd59' },
  { num: 4, name: 'Contract + Form', color: '#b9d496' },
  { num: 5, name: 'Matching Cohort', color: '#89bcef' },
  { num: 6, name: 'Session 1', color: '#b9d496' },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function fullName(s: { first_name: string; last_name: string | null }) {
  return [s.first_name, s.last_name].filter(Boolean).join(' ')
}

function getInitials(s: { first_name: string; last_name: string | null }) {
  return [s.first_name?.[0], s.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?'
}

function formatDate(d: string | null) {
  if (!d) return ''
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getStepStatus(record: PipelineRecord, stepNum: number): string {
  return (record as unknown as Record<string, unknown>)[`step${stepNum}_status`] as string ?? 'pending'
}

// ─── Draggable Card ─────────────────────────────────────────────────────────

function DraggableCard({
  record,
  onClick,
}: {
  record: PipelineRecord
  onClick: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: record.id,
  })

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined

  if (!record.student) return null

  const status = getStepStatus(record, record.current_step)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'bg-white dark:bg-zinc-900 border border-[#e5e7eb] dark:border-zinc-700 rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md',
        isDragging && 'opacity-50 shadow-lg'
      )}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        // Only trigger click if not dragging
        if (!isDragging) onClick()
      }}
    >
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-300 shrink-0">
          {getInitials(record.student)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate leading-tight">
            {fullName(record.student)}
          </p>
          {record.student.cohort && (
            <span className="inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 mt-1">
              Cohort {record.student.cohort}
            </span>
          )}
          {record.coach && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{record.coach}</p>
          )}
          {record.enrollment_date && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              {formatDate(record.enrollment_date)}
            </p>
          )}
          <div className="mt-1.5">
            <span
              className={cn(
                'inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold',
                status === 'completed' && 'bg-[#b9d496]/30 text-green-700 dark:text-green-400',
                status === 'waiting' && 'bg-[#ffbd59]/30 text-amber-700 dark:text-amber-400',
                status === 'pending' && 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400',
              )}
            >
              {status === 'completed' ? 'Completed' : status === 'waiting' ? 'Waiting' : 'Pending'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Card Preview (for DragOverlay) ─────────────────────────────────────────

function CardPreview({ record }: { record: PipelineRecord }) {
  if (!record.student) return null
  const status = getStepStatus(record, record.current_step)

  return (
    <div className="bg-white dark:bg-zinc-900 border border-[#e5e7eb] dark:border-zinc-700 rounded-lg p-3 shadow-xl w-[200px] opacity-90">
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-300 shrink-0">
          {getInitials(record.student)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate leading-tight">
            {fullName(record.student)}
          </p>
          <span
            className={cn(
              'inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold mt-1',
              status === 'completed' && 'bg-[#b9d496]/30 text-green-700',
              status === 'waiting' && 'bg-[#ffbd59]/30 text-amber-700',
              status === 'pending' && 'bg-zinc-100 text-zinc-500',
            )}
          >
            {status === 'completed' ? 'Completed' : status === 'waiting' ? 'Waiting' : 'Pending'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Droppable Column ───────────────────────────────────────────────────────

function DroppableColumn({
  step,
  records,
  onCardClick,
}: {
  step: typeof STEPS[number]
  records: PipelineRecord[]
  onCardClick: (r: PipelineRecord) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `step-${step.num}` })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700 min-w-[220px] w-[220px] shrink-0',
        isOver && 'ring-2 ring-[#ffbd59]/50'
      )}
    >
      {/* Colored top border */}
      <div className="h-[3px] rounded-t-lg" style={{ backgroundColor: step.color }} />
      <div className="px-3 py-2.5 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 leading-tight">
            {step.name}
          </h3>
          <span className="text-[10px] font-medium text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full">
            {records.length}
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[calc(100vh-320px)]">
        {records.map((r) => (
          <DraggableCard key={r.id} record={r} onClick={() => onCardClick(r)} />
        ))}
        {records.length === 0 && (
          <div className="text-center py-6 text-xs text-zinc-400">No students</div>
        )}
      </div>
    </div>
  )
}

// ─── Mobile Accordion Column ────────────────────────────────────────────────

function AccordionColumn({
  step,
  records,
  onCardClick,
}: {
  step: typeof STEPS[number]
  records: PipelineRecord[]
  onCardClick: (r: PipelineRecord) => void
}) {
  const [open, setOpen] = useState(records.length > 0)

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
      <div className="h-[3px]" style={{ backgroundColor: step.color }} />
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{step.name}</h3>
          <span className="text-[10px] font-medium text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full">
            {records.length}
          </span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {records.map((r) => (
            <DraggableCard key={r.id} record={r} onClick={() => onCardClick(r)} />
          ))}
          {records.length === 0 && (
            <p className="text-center py-4 text-xs text-zinc-400">No students</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Full Student Modal ─────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function FullStudentModal({
  record,
  onClose,
  onUpdate,
}: {
  record: PipelineRecord
  onClose: () => void
  onUpdate: (updated: PipelineRecord) => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [localRecord, setLocalRecord] = useState(record)
  const [saving, setSaving] = useState(false)
  const [coaches, setCoaches] = useState<{ full_name: string }[]>([])
  const [notes, setNotes] = useState<StudentNote[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [sessions, setSessions] = useState<CoachingSession[]>([])
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)

  const student = record.student
  if (!student) return null

  // Fetch all related data
  useEffect(() => {
    fetch('/api/growth/coaches').then((r) => r.json()).then(setCoaches).catch(() => {})

    // Notes
    supabase
      .from('student_notes')
      .select('*')
      .eq('student_id', student.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setNotes(data ?? []))

    // Transactions
    if (student.email) {
      supabase
        .from('transactions')
        .select('*')
        .ilike('buyer_email', student.email)
        .order('date', { ascending: false })
        .then(({ data }) => setTransactions(data ?? []))
    }

    // Sessions
    fetch(`/api/students/sessions?student_id=${student.id}`)
      .then((r) => r.ok ? r.json() : [])
      .then(setSessions)
      .catch(() => {})
  }, [student.id, student.email, supabase])

  const patchField = useCallback(async (updates: Record<string, unknown>) => {
    setSaving(true)
    const res = await fetch(`/api/client-success/pipeline/${localRecord.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (res.ok) {
      const updated = await res.json()
      setLocalRecord((prev) => ({ ...prev, ...updated }))
      onUpdate({ ...localRecord, ...updated })
    } else {
      toast.error('Failed to save')
    }
    setSaving(false)
  }, [localRecord, onUpdate])

  const handleStepStatusChange = useCallback(async (stepNum: number, newStatus: string) => {
    const updates: Record<string, unknown> = { [`step${stepNum}_status`]: newStatus }
    if (newStatus === 'completed' && stepNum <= 5) {
      const nextStepStatus = (localRecord as unknown as Record<string, unknown>)[`step${stepNum + 1}_status`] as string
      if (nextStepStatus === 'pending') updates.current_step = stepNum + 1
    }
    await patchField(updates)
  }, [localRecord, patchField])

  const handleAddNote = useCallback(async () => {
    if (!newNote.trim()) return
    setAddingNote(true)
    const { data } = await supabase
      .from('student_notes')
      .insert({ student_id: student.id, note: newNote.trim(), created_by: 'pipeline' })
      .select()
      .single()
    if (data) setNotes((prev) => [data, ...prev])
    setNewNote('')
    setAddingNote(false)
  }, [newNote, student.id, supabase])

  const completedTx = transactions.filter((t) => t.status === 'completed')
  const totalPaid = completedTx.reduce((sum, t) => sum + (Number(t.cost) || 0), 0)

  const sectionLabel = 'text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3'
  const rowLabel = 'text-xs text-zinc-500 dark:text-zinc-400'
  const rowValue = 'text-xs font-medium text-zinc-800 dark:text-zinc-200 text-right'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto border border-zinc-200 dark:border-zinc-700 w-full max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-lg font-bold text-blue-600 dark:text-blue-300 shrink-0">
              {getInitials(student)}
            </div>
            <div>
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
                <span className={cn(
                  'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold',
                  student.status === 'active' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                  student.status === 'graduated' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
                  student.status === 'paused' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                  'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                )}>
                  {student.status === 'graduated' ? 'Graduated 🎓' : student.status.charAt(0).toUpperCase() + student.status.slice(1)}
                </span>
                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                  {student.type === 'individual' ? 'Individual 1:1' : 'Group'}
                </span>
                {student.cohort && (
                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                    {student.type === 'individual' ? '1:1' : `Cohort ${student.cohort}`}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          {/* Onboarding Pipeline */}
          <div className="mb-6">
            <p className={sectionLabel}>Onboarding Pipeline</p>
            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3 space-y-1">
              {STEPS.map((step) => {
                const status = (localRecord as unknown as Record<string, unknown>)[`step${step.num}_status`] as string ?? 'pending'
                const date = (localRecord as unknown as Record<string, unknown>)[`step${step.num}_date`] as string | null
                const isCurrent = localRecord.current_step === step.num

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
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-0.5">Coach</label>
                <select
                  value={localRecord.coach ?? ''}
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
                  value={localRecord.enrollment_date ?? ''}
                  onChange={(e) => patchField({ enrollment_date: e.target.value || null })}
                  className="w-full text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#ffbd59]/30"
                />
              </div>
            </div>
            <div className="mt-2">
              <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-0.5">Pipeline Notes</label>
              <textarea
                value={localRecord.notes ?? ''}
                onChange={(e) => setLocalRecord((prev) => ({ ...prev, notes: e.target.value }))}
                onBlur={() => patchField({ notes: localRecord.notes })}
                rows={2}
                className="w-full text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#ffbd59]/30 resize-none"
              />
            </div>
            {saving && <p className="text-[10px] text-[#ffbd59] animate-pulse mt-1">Saving...</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* LEFT */}
            <div className="space-y-6">
              {/* Key Dates */}
              <div>
                <p className={sectionLabel}>Key Dates</p>
                <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className={rowLabel}>Total Paid</span>
                    <span className={cn(rowValue, totalPaid > 0 ? 'text-green-600 dark:text-green-400' : '')}>
                      {totalPaid > 0 ? `$${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={rowLabel}>Payments</span>
                    <span className={rowValue}>{completedTx.length > 0 ? `${completedTx.length} payment${completedTx.length !== 1 ? 's' : ''}` : '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={rowLabel}>Cohort Assigned</span>
                    <span className={rowValue}>{fmtDate(student.cohort_assigned_at)}</span>
                  </div>
                </div>
              </div>

              {/* Transactions */}
              {transactions.length > 0 && (
                <div>
                  <p className={sectionLabel}>Transactions</p>
                  <div className="space-y-1.5">
                    {transactions.slice(0, 5).map((t) => (
                      <div key={t.id} className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">{t.offer_title}</p>
                          <p className="text-[11px] text-zinc-400">{fmtDate(t.date)}</p>
                        </div>
                        <div className="text-right ml-2">
                          <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">${Number(t.cost).toFixed(2)}</p>
                          <span className={cn(
                            'inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold capitalize',
                            t.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
                            t.status === 'refunded' ? 'bg-red-100 text-red-700' : 'bg-zinc-100 text-zinc-500'
                          )}>
                            {t.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Coaching Sessions */}
              {sessions.length > 0 && (
                <div>
                  <p className={cn(sectionLabel, 'flex items-center gap-1.5')}>
                    <Video className="h-3.5 w-3.5" /> Coaching Sessions
                  </p>
                  <div className="space-y-1.5">
                    {sessions.slice(0, 5).map((s) => (
                      <div key={s.id} className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                            {new Date(s.session_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {' · '}
                            {new Date(s.session_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </p>
                          <p className="text-[11px] text-zinc-400">{s.duration_minutes} min · {s.session_type}</p>
                        </div>
                        <span className={cn(
                          'inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold',
                          s.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
                          s.status === 'scheduled' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                          'bg-zinc-100 text-zinc-500'
                        )}>
                          {s.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT — Contact Notes */}
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="h-3.5 w-3.5 text-zinc-400" />
                <p className={cn(sectionLabel, 'mb-0')}>Contact Notes</p>
              </div>
              <div className="flex-1 space-y-2 max-h-72 overflow-y-auto pr-1 mb-4">
                {notes.length === 0 ? (
                  <div className="text-center py-10 text-zinc-400 text-xs">No notes yet.</div>
                ) : (
                  notes.map((n) => (
                    <div key={n.id} className="relative pl-4 border-l-2 border-zinc-200 dark:border-zinc-700">
                      <p className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{n.note}</p>
                      <p className="text-[10px] text-zinc-400 mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        {n.created_by && ` · ${n.created_by}`}
                      </p>
                    </div>
                  ))
                )}
              </div>
              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a note..."
                  rows={2}
                  className="flex-1 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 resize-none focus:outline-none focus:ring-1 focus:ring-[#ffbd59]/30"
                />
                <button
                  onClick={handleAddNote}
                  disabled={addingNote || !newNote.trim()}
                  className="px-3 py-1 rounded-lg text-xs font-medium bg-[#ffbd59] text-[#1a1a2e] hover:bg-[#e5a94f] disabled:opacity-50 self-end"
                >
                  {addingNote ? '...' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function ClientSuccessPage() {
  const [records, setRecords] = useState<PipelineRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<PipelineRecord | null>(null)
  const [coachFilter, setCoachFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_progress' | 'waiting' | 'completed' | 'not_started'>('all')

  const { profile } = useProfile()
  const { previewRole } = usePreviewRole()
  const role = previewRole ?? profile?.role ?? null

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const [activeId, setActiveId] = useState<string | null>(null)

  const fetchPipeline = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/client-success/pipeline')
    if (res.ok) {
      const data = await res.json()
      setRecords(data)
    } else {
      toast.error('Failed to load pipeline')
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchPipeline() }, [fetchPipeline])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    const res = await fetch('/api/client-success/sync', { method: 'POST' })
    if (res.ok) {
      const result = await res.json()
      toast.success(
        `Synced ${result.synced_new} new students. Updated: ${result.matched_and_updated.length}. Skipped: ${result.skipped_no_match.length + result.skipped_multiple_matches.length}.`
      )
      fetchPipeline()
    } else {
      toast.error('Sync failed')
    }
    setSyncing(false)
  }, [fetchPipeline])

  // Distinct coaches for filter
  const coaches = useMemo(() => {
    const set = new Set<string>()
    records.forEach((r) => { if (r.coach) set.add(r.coach) })
    return Array.from(set).sort()
  }, [records])

  // Filter records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (!r.student) return false
      if (coachFilter && r.coach !== coachFilter) return false
      if (statusFilter !== 'all') {
        const allSteps = [r.step1_status, r.step2_status, r.step3_status, r.step4_status, r.step5_status, r.step6_status]
        const hasCompleted = allSteps.some((s) => s === 'completed')
        const allCompleted = allSteps.every((s) => s === 'completed')
        const hasWaiting = allSteps.some((s) => s === 'waiting')
        const allPending = allSteps.every((s) => s === 'pending')

        if (statusFilter === 'completed' && !allCompleted) return false
        if (statusFilter === 'in_progress' && (!hasCompleted || allCompleted)) return false
        if (statusFilter === 'waiting' && !hasWaiting) return false
        if (statusFilter === 'not_started' && !allPending) return false
      }
      return true
    })
  }, [records, coachFilter, statusFilter])

  // Group by current_step
  const columnRecords = useMemo(() => {
    const cols: Record<number, PipelineRecord[]> = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }
    filteredRecords.forEach((r) => {
      const step = Math.min(Math.max(r.current_step, 1), 6)
      cols[step].push(r)
    })
    return cols
  }, [filteredRecords])

  // KPI calculations
  const kpis = useMemo(() => {
    const total = filteredRecords.length
    const completed = filteredRecords.filter((r) => r.step6_status === 'completed').length
    const allSteps = (r: PipelineRecord) => [r.step1_status, r.step2_status, r.step3_status, r.step4_status, r.step5_status, r.step6_status]
    const inProgress = filteredRecords.filter((r) => {
      const steps = allSteps(r)
      return steps.some((s) => s === 'completed') && !steps.every((s) => s === 'completed')
    }).length
    const waiting = filteredRecords.filter((r) => allSteps(r).some((s) => s === 'waiting')).length
    const notStarted = filteredRecords.filter((r) => allSteps(r).every((s) => s === 'pending')).length
    return { total, completed, inProgress, waiting, notStarted }
  }, [filteredRecords])

  // Drag handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over) return

    const overId = over.id as string
    if (!overId.startsWith('step-')) return

    const newStep = parseInt(overId.replace('step-', ''))
    const recordId = active.id as string
    const record = records.find((r) => r.id === recordId)
    if (!record || record.current_step === newStep) return

    // Optimistic update
    setRecords((prev) =>
      prev.map((r) => (r.id === recordId ? { ...r, current_step: newStep } : r))
    )

    const res = await fetch(`/api/client-success/pipeline/${recordId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_step: newStep }),
    })

    if (!res.ok) {
      toast.error('Failed to move student')
      fetchPipeline()
    }
  }, [records, fetchPipeline])

  const activeRecord = activeId ? records.find((r) => r.id === activeId) ?? null : null

  const handleRecordUpdate = useCallback((updated: PipelineRecord) => {
    setRecords((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)))
  }, [])

  return (
    <PageTransition>
      <div className="min-h-screen bg-[#f9fafb] dark:bg-zinc-950">
        <div className="px-4 md:px-6 py-6 max-w-[1600px] mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Client Success</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">PWU Student Onboarding Pipeline</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Coach filter */}
              <select
                value={coachFilter}
                onChange={(e) => setCoachFilter(e.target.value)}
                className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30"
              >
                <option value="">All Coaches</option>
                {coaches.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30"
              >
                <option value="all">All Status</option>
                <option value="in_progress">In Progress</option>
                <option value="waiting">Waiting</option>
                <option value="completed">Completed</option>
                <option value="not_started">Not Started</option>
              </select>

              {/* Sync button (admin only) */}
              {role === 'admin' && (
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-[#ffbd59] text-[#1a1a2e] hover:bg-[#e5a94f] disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
                  {syncing ? 'Syncing...' : 'Sync Students'}
                </button>
              )}
            </div>
          </div>

          {/* KPI Cards */}
          <KPICardGrid>
            <KPICard title="Total in Pipeline" value={kpis.total} icon={<Users className="h-4 w-4" />} loading={loading} />
            <KPICard title="Completed All Steps" value={kpis.completed} icon={<CheckCircle2 className="h-4 w-4" />} loading={loading} />
            <KPICard title="In Progress" value={kpis.inProgress} icon={<Clock className="h-4 w-4" />} loading={loading} />
            <KPICard title="Waiting / Blocked" value={kpis.waiting} icon={<AlertCircle className="h-4 w-4" />} loading={loading} />
            <KPICard title="Not Started" value={kpis.notStarted} icon={<Circle className="h-4 w-4" />} loading={loading} />
          </KPICardGrid>

          {/* Kanban Board (Desktop) */}
          {!loading && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              {/* Desktop Kanban */}
              <div className="hidden md:flex gap-3 mt-6 overflow-x-auto pb-4">
                {STEPS.map((step) => (
                  <DroppableColumn
                    key={step.num}
                    step={step}
                    records={columnRecords[step.num]}
                    onCardClick={setSelectedRecord}
                  />
                ))}
              </div>

              {/* Mobile Accordion */}
              <div className="md:hidden mt-6 space-y-3">
                {STEPS.map((step) => (
                  <AccordionColumn
                    key={step.num}
                    step={step}
                    records={columnRecords[step.num]}
                    onCardClick={setSelectedRecord}
                  />
                ))}
              </div>

              <DragOverlay>
                {activeRecord ? <CardPreview record={activeRecord} /> : null}
              </DragOverlay>
            </DndContext>
          )}

          {loading && (
            <div className="mt-6 flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#ffbd59]" />
            </div>
          )}
        </div>

        {/* Detail Modal */}
        {selectedRecord && (
          <FullStudentModal
            record={selectedRecord}
            onClose={() => setSelectedRecord(null)}
            onUpdate={handleRecordUpdate}
          />
        )}
      </div>
    </PageTransition>
  )
}
