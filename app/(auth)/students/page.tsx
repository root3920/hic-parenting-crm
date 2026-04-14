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
  Pencil, FileText, PauseCircle, Trash2, ChevronDown, ChevronUp,
  Phone, Mail, Calendar, Clock, MessageSquare, ExternalLink,
  CreditCard,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getCanonicalProduct } from '@/lib/products'
import type { PwuStudent, StudentNote, Transaction, StudentPaymentPlan } from '@/types'

export const dynamic = 'force-dynamic'

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

// ─── Student Row ─────────────────────────────────────────────────────────────

function StudentRow({
  student,
  showCohort = false,
  showType = false,
  onEdit,
  onNotes,
  onGraduate,
  onPause,
  onDelete,
  onStatusChange,
  onSelect,
}: {
  student: PwuStudent
  showCohort?: boolean
  showType?: boolean
  onEdit: (s: PwuStudent) => void
  onNotes: (s: PwuStudent) => void
  onGraduate: (s: PwuStudent) => void
  onPause: (s: PwuStudent) => void
  onDelete: (s: PwuStudent) => void
  onStatusChange: (s: PwuStudent, status: StudentStatus) => void
  onSelect: (s: PwuStudent) => void
}) {
  const [statusOpen, setStatusOpen] = useState(false)

  return (
    <tr
      onClick={() => onSelect(student)}
      className="border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors group cursor-pointer"
    >
      <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100 text-sm whitespace-nowrap">
        {fullName(student)}
      </td>
      <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">{student.email ?? '—'}</td>
      {showCohort && (
        <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
          {student.type === 'individual' ? '1:1' : `Cohort ${student.cohort}`}
        </td>
      )}
      {showType && (
        <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap capitalize">
          {student.type === 'individual' ? 'Individual' : 'Group'}
        </td>
      )}
      <td className="px-4 py-3 relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => setStatusOpen((v) => !v)}>
          <StatusBadge status={student.status} />
        </button>
        {statusOpen && (
          <div className="absolute z-20 top-full left-0 mt-1 w-40 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden">
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                onClick={() => { onStatusChange(student, s); setStatusOpen(false) }}
                className={cn(
                  'w-full text-left px-3 py-2 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors',
                  student.status === s && 'font-semibold'
                )}
              >
                <StatusBadge status={s} />
              </button>
            ))}
          </div>
        )}
      </td>
      <td className="px-4 py-3"><LastContactBadge ts={student.last_contacted_at} /></td>
      <td className="px-4 py-3 text-xs text-zinc-400 max-w-[120px] truncate">{student.notes ?? '—'}</td>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <ActionBtn title="Edit" onClick={() => onEdit(student)}><Pencil className="h-3.5 w-3.5" /></ActionBtn>
          <ActionBtn title="Notes" onClick={() => onNotes(student)}><FileText className="h-3.5 w-3.5" /></ActionBtn>
          {student.status === 'active' && (
            <ActionBtn title="Graduate" onClick={() => onGraduate(student)} className="text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20">
              <GraduationCap className="h-3.5 w-3.5" />
            </ActionBtn>
          )}
          {student.status === 'active' && (
            <ActionBtn title="Pause" onClick={() => onPause(student)} className="text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20">
              <PauseCircle className="h-3.5 w-3.5" />
            </ActionBtn>
          )}
          <ActionBtn title="Delete" onClick={() => onDelete(student)} className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
            <Trash2 className="h-3.5 w-3.5" />
          </ActionBtn>
        </div>
      </td>
    </tr>
  )
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

function TableHeader({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
        {cols.map((h) => (
          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide whitespace-nowrap">
            {h}
          </th>
        ))}
      </tr>
    </thead>
  )
}

// ─── Cohort Card ─────────────────────────────────────────────────────────────

function CohortCard({
  cohort, students, actions,
}: {
  cohort: string
  students: PwuStudent[]
  actions: StudentActions
}) {
  const [expanded, setExpanded] = useState(false)
  const graduated = students.filter((s) => s.status === 'graduated').length
  const total = students.length
  const pct = total > 0 ? Math.round((graduated / total) * 100) : 0
  const sorted = sortStudents(students)

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Cohort {cohort}</span>
          <span className="text-xs text-zinc-400">{total} {total === 1 ? 'student' : 'students'}</span>
        </div>
        <div className="mb-2">
          <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-zinc-400 mt-1">{pct}% graduated</p>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline mt-1"
        >
          {expanded ? 'Hide students' : 'View students'}
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>
      {expanded && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 overflow-x-auto">
          <table className="w-full text-sm">
            <TableHeader cols={['Name', 'Email', 'Status', 'Last Contact', 'Notes', '']} />
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {sorted.map((s) => (
                <StudentRow key={s.id} student={s} {...actions} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
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

const inputCls = 'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400'

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

// ─── Student Profile Modal ────────────────────────────────────────────────────

function StudentProfileModal({
  student,
  notes,
  transactions,
  paymentPlan,
  onClose,
  onEdit,
  onGraduate,
  onPause,
  onDelete,
  onAddNote,
  onCohortDateChange,
  onStudentUpdate,
  onSavePaymentPlan,
}: {
  student: PwuStudent
  notes: StudentNote[]
  transactions: Transaction[]
  paymentPlan: StudentPaymentPlan | null
  onClose: () => void
  onEdit: (s: PwuStudent) => void
  onGraduate: (s: PwuStudent) => void
  onPause: (s: PwuStudent) => void
  onDelete: (s: PwuStudent) => void
  onAddNote: (text: string) => Promise<void>
  onCohortDateChange: (date: string) => Promise<void>
  onStudentUpdate: (updated: PwuStudent) => void
  onSavePaymentPlan: (data: PaymentPlanFormData) => Promise<void>
}) {
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)
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
            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className={rowLabel}>Payment Date</span>
                <span className={rowValue}>{formatDate(student.payment_date)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={rowLabel}>Payment Amount</span>
                <span className={cn(rowValue, student.payment_amount ? 'text-green-600 dark:text-green-400' : '')}>
                  {student.payment_amount ? `$${student.payment_amount.toLocaleString()}` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className={rowLabel}>Cohort Assigned</span>
                <input
                  type="date"
                  value={student.cohort_assigned_at ?? ''}
                  onChange={(e) => onCohortDateChange(e.target.value)}
                  className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
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
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
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
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Edit
                </button>
              )}
            </div>

            {!paymentPlan && !showPlanForm && (
              <button
                onClick={() => setShowPlanForm(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border border-dashed border-zinc-300 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
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
                    style={{ backgroundColor: '#185FA5' }}
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
                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">{note.created_by}</span>
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
                style={{ backgroundColor: '#185FA5' }}
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
          <button type="submit" disabled={saving} className="px-4 py-2 text-xs rounded-lg text-white font-semibold transition-opacity hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: '#185FA5' }}>
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
  onCreated: (cohort: string) => void
}) {
  const [num, setNum] = useState(String(nextSuggested))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const n = num.trim()
    if (!n || isNaN(Number(n))) { toast.error('Enter a valid cohort number'); return }
    onCreated(n)
    toast.success(`Cohort ${n} ready. Add students to it.`)
    onClose()
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
          <button type="submit" className="px-4 py-2 text-xs rounded-lg text-white font-semibold hover:opacity-90" style={{ backgroundColor: '#185FA5' }}>
            Create Cohort
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
          <button type="submit" disabled={saving} className="px-4 py-2 text-xs rounded-lg text-white font-semibold hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: '#185FA5' }}>
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

type Tab = 'all' | 'group' | 'individual' | 'graduated' | 'paused'

interface StudentActions {
  onEdit: (s: PwuStudent) => void
  onNotes: (s: PwuStudent) => void
  onGraduate: (s: PwuStudent) => void
  onPause: (s: PwuStudent) => void
  onDelete: (s: PwuStudent) => void
  onStatusChange: (s: PwuStudent, status: StudentStatus) => void
  onSelect: (s: PwuStudent) => void
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

  useEffect(() => { fetchStudents() }, [fetchStudents])

  // Fetch notes, transactions, and payment plan when a student profile is opened
  useEffect(() => {
    if (!selectedStudent) {
      setProfileNotes([])
      setProfileTransactions([])
      setProfilePaymentPlan(null)
      return
    }

    supabase
      .from('student_notes')
      .select('*')
      .eq('student_id', selectedStudent.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setProfileNotes(data ?? []))

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
    return sortCohorts(Array.from(s))
  }, [students])

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

  // Cohort grouping for group tab — only numeric cohorts
  const cohortGroups = useMemo(() => {
    if (tab !== 'group') return []
    const map: Record<string, PwuStudent[]> = {}
    for (const s of filtered) {
      if (!isNaN(Number(s.cohort))) {
        if (!map[s.cohort]) map[s.cohort] = []
        map[s.cohort].push(s)
      }
    }
    return sortCohorts(Object.keys(map)).map((c) => ({ cohort: c, students: map[c] }))
  }, [filtered, tab])

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
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const tabs: { key: Tab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'group', label: 'Group Cohorts' },
    { key: 'individual', label: 'Individual 1:1' },
    { key: 'graduated', label: 'Graduated' },
    { key: 'paused', label: 'Paused / Refund' },
  ]

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto">
        <PageHeader title="PWU Students" description="Parenting With Understanding program management">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90 transition-opacity"
              style={{ backgroundColor: '#185FA5' }}
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

        {/* Tab nav */}
        <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1 mb-4 overflow-x-auto">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
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

        {/* Search & filters */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input
              className="w-full pl-8 pr-3 py-2 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
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
          {tab !== 'graduated' && tab !== 'paused' && (
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
          <select
            className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-2 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
            value={filterCohort}
            onChange={(e) => setFilterCohort(e.target.value)}
          >
            <option value="all">All cohorts</option>
            {allCohorts.map((c) => <option key={c} value={c}>{c === '1:1' ? '1:1' : `Cohort ${c}`}</option>)}
          </select>
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-14 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 && tab !== 'group' ? (
          <EmptyState
            title="No students found"
            description="Add students using the button above."
            icon={<GraduationCap className="h-10 w-10" />}
          />
        ) : tab === 'group' ? (
          <GroupTab cohortGroups={cohortGroups} actions={actions} />
        ) : tab === 'individual' ? (
          <IndividualTab students={filtered} actions={actions} />
        ) : tab === 'graduated' ? (
          <GraduatedTab students={filtered} actions={actions} />
        ) : tab === 'paused' ? (
          <PausedTab students={filtered} actions={actions} />
        ) : (
          <AllTab students={filtered} actions={actions} />
        )}
      </div>

      {/* ── Modals ── */}

      {selectedStudent && (
        <StudentProfileModal
          student={selectedStudent}
          notes={profileNotes}
          transactions={profileTransactions}
          paymentPlan={profilePaymentPlan}
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
          onCreated={() => {}}
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

// ─── Tab views ────────────────────────────────────────────────────────────────

function AllTab({ students, actions }: { students: PwuStudent[]; actions: StudentActions }) {
  const sorted = sortStudents(students)
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <TableHeader cols={['Name', 'Email', 'Cohort', 'Type', 'Status', 'Last Contact', 'Notes', '']} />
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {sorted.map((s) => (
            <StudentRow key={s.id} student={s} showCohort showType {...actions} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GroupTab({
  cohortGroups, actions,
}: {
  cohortGroups: { cohort: string; students: PwuStudent[] }[]
  actions: StudentActions
}) {
  if (cohortGroups.length === 0) {
    return (
      <EmptyState
        title="No group cohorts"
        description="Add group students to see cohorts here."
        icon={<GraduationCap className="h-10 w-10" />}
      />
    )
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {cohortGroups.map(({ cohort, students }) => (
        <CohortCard key={cohort} cohort={cohort} students={students} actions={actions} />
      ))}
    </div>
  )
}

function IndividualTab({ students, actions }: { students: PwuStudent[]; actions: StudentActions }) {
  const sorted = sortStudents(students)
  if (sorted.length === 0) {
    return <EmptyState title="No individual students" description="Add 1:1 students using the button above." icon={<GraduationCap className="h-10 w-10" />} />
  }
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <TableHeader cols={['Name', 'Email', 'Phone', 'Status', 'Last Contact', 'Notes', '']} />
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {sorted.map((s) => (
            <tr
              key={s.id}
              onClick={() => actions.onSelect(s)}
              className="border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors group cursor-pointer"
            >
              <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100 text-sm whitespace-nowrap">{fullName(s)}</td>
              <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">{s.email ?? '—'}</td>
              <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{s.phone ?? '—'}</td>
              <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
              <td className="px-4 py-3"><LastContactBadge ts={s.last_contacted_at} /></td>
              <td className="px-4 py-3 text-xs text-zinc-400 max-w-[120px] truncate">{s.notes ?? '—'}</td>
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ActionBtn title="Edit" onClick={() => actions.onEdit(s)}><Pencil className="h-3.5 w-3.5" /></ActionBtn>
                  <ActionBtn title="Notes" onClick={() => actions.onNotes(s)}><FileText className="h-3.5 w-3.5" /></ActionBtn>
                  {s.status === 'active' && <ActionBtn title="Graduate" onClick={() => actions.onGraduate(s)} className="text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"><GraduationCap className="h-3.5 w-3.5" /></ActionBtn>}
                  {s.status === 'active' && <ActionBtn title="Pause" onClick={() => actions.onPause(s)} className="text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"><PauseCircle className="h-3.5 w-3.5" /></ActionBtn>}
                  <ActionBtn title="Delete" onClick={() => actions.onDelete(s)} className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="h-3.5 w-3.5" /></ActionBtn>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GraduatedTab({ students, actions }: { students: PwuStudent[]; actions: StudentActions }) {
  const sorted = [...students].sort((a, b) => {
    if (!a.graduated_at) return 1
    if (!b.graduated_at) return -1
    return b.graduated_at.localeCompare(a.graduated_at)
  })
  return (
    <div className="space-y-4">
      {sorted.length > 0 && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3 text-sm text-green-700 dark:text-green-300 font-medium">
          {sorted.length} {sorted.length === 1 ? 'student has' : 'students have'} completed the program 🎓
        </div>
      )}
      {sorted.length === 0 ? (
        <EmptyState title="No graduated students" description="Students who complete the program appear here." icon={<GraduationCap className="h-10 w-10" />} />
      ) : (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <TableHeader cols={['Name', 'Email', 'Cohort', 'Type', 'Last Contact', '']} />
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {sorted.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => actions.onSelect(s)}
                  className="border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors group cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100 text-sm whitespace-nowrap">{fullName(s)}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{s.email ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">{s.type === 'individual' ? '1:1' : `Cohort ${s.cohort}`}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500 capitalize">{s.type === 'individual' ? 'Individual' : 'Group'}</td>
                  <td className="px-4 py-3"><LastContactBadge ts={s.last_contacted_at} /></td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ActionBtn title="Edit" onClick={() => actions.onEdit(s)}><Pencil className="h-3.5 w-3.5" /></ActionBtn>
                      <ActionBtn title="Notes" onClick={() => actions.onNotes(s)}><FileText className="h-3.5 w-3.5" /></ActionBtn>
                      <ActionBtn title="Delete" onClick={() => actions.onDelete(s)} className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="h-3.5 w-3.5" /></ActionBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function PausedTab({ students, actions }: { students: PwuStudent[]; actions: StudentActions }) {
  if (students.length === 0) {
    return <EmptyState title="No paused or refunded students" icon={<GraduationCap className="h-10 w-10" />} />
  }
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <TableHeader cols={['Name', 'Email', 'Cohort', 'Status', 'Last Contact', 'Notes', '']} />
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {students.map((s) => (
            <tr
              key={s.id}
              onClick={() => actions.onSelect(s)}
              className="border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors group cursor-pointer"
            >
              <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100 text-sm whitespace-nowrap">{fullName(s)}</td>
              <td className="px-4 py-3 text-xs text-zinc-500">{s.email ?? '—'}</td>
              <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">{s.type === 'individual' ? '1:1' : `Cohort ${s.cohort}`}</td>
              <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
              <td className="px-4 py-3"><LastContactBadge ts={s.last_contacted_at} /></td>
              <td className="px-4 py-3 text-xs text-zinc-400 max-w-[140px] truncate">{s.notes ?? '—'}</td>
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ActionBtn title="Edit" onClick={() => actions.onEdit(s)}><Pencil className="h-3.5 w-3.5" /></ActionBtn>
                  <ActionBtn title="Notes" onClick={() => actions.onNotes(s)}><FileText className="h-3.5 w-3.5" /></ActionBtn>
                  <ActionBtn title="Delete" onClick={() => actions.onDelete(s)} className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="h-3.5 w-3.5" /></ActionBtn>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
