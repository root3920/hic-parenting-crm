'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/PageHeader'
import { PageTransition } from '@/components/motion/PageTransition'
import { EmptyState } from '@/components/shared/EmptyState'
import { toast } from 'sonner'
import {
  Plus, Download, X, GraduationCap, Search,
  Pencil, FileText, PauseCircle, Trash2, ChevronDown, ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PwuStudent } from '@/types'

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

function fullName(s: PwuStudent) {
  return [s.first_name, s.last_name].filter(Boolean).join(' ')
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
}) {
  const [statusOpen, setStatusOpen] = useState(false)

  return (
    <tr className="border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors group">
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
      <td className="px-4 py-3 relative">
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
      {showCohort && (
        <td className="px-4 py-3 text-xs text-zinc-400">{formatDate(student.graduated_at)}</td>
      )}
      <td className="px-4 py-3 text-xs text-zinc-400 max-w-[120px] truncate">{student.notes ?? '—'}</td>
      <td className="px-4 py-3">
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
            <TableHeader cols={['Name', 'Email', 'Status', 'Notes', '']} />
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

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-zinc-200 dark:border-zinc-700">
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

// ─── Notes Modal ──────────────────────────────────────────────────────────────

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

  // Cohort hint (for new cohort modal)
  const [hintCohorts, setHintCohorts] = useState<string[]>([])

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

  // Derived
  const allCohorts = useMemo(() => {
    const s = new Set(students.map((s) => s.cohort))
    return sortCohorts(Array.from(s))
  }, [students])

  const groupCohorts = useMemo(() => allCohorts.filter((c) => c !== '1:1'), [allCohorts])

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

  // Cohort grouping for group tab
  const cohortGroups = useMemo(() => {
    if (tab !== 'group') return []
    const map: Record<string, PwuStudent[]> = {}
    for (const s of filtered) {
      if (!map[s.cohort]) map[s.cohort] = []
      map[s.cohort].push(s)
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

  function exportCSV() {
    const rows = [
      ['First Name', 'Last Name', 'Email', 'Phone', 'Cohort', 'Type', 'Status', 'Graduated Date', 'Notes', 'Created'],
      ...students.map((s) => [
        s.first_name,
        s.last_name ?? '',
        s.email ?? '',
        s.phone ?? '',
        s.cohort,
        s.type,
        s.status,
        s.graduated_at ?? '',
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
              onClick={() => { setHintCohorts(groupCohorts); setAddOpen(true) }}
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

      {/* Modals */}
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
        <TableHeader cols={['Name', 'Email', 'Cohort', 'Type', 'Status', 'Notes', '']} />
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
        <TableHeader cols={['Name', 'Email', 'Phone', 'Status', 'Graduated', 'Notes', '']} />
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {sorted.map((s) => (
            <tr key={s.id} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors group">
              <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100 text-sm whitespace-nowrap">{fullName(s)}</td>
              <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">{s.email ?? '—'}</td>
              <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{s.phone ?? '—'}</td>
              <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
              <td className="px-4 py-3 text-xs text-zinc-400">{formatDate(s.graduated_at)}</td>
              <td className="px-4 py-3 text-xs text-zinc-400 max-w-[120px] truncate">{s.notes ?? '—'}</td>
              <td className="px-4 py-3">
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
            <TableHeader cols={['Name', 'Email', 'Cohort', 'Type', 'Graduated', '']} />
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {sorted.map((s) => (
                <tr key={s.id} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors group">
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100 text-sm whitespace-nowrap">{fullName(s)}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{s.email ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">{s.type === 'individual' ? '1:1' : `Cohort ${s.cohort}`}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500 capitalize">{s.type === 'individual' ? 'Individual' : 'Group'}</td>
                  <td className="px-4 py-3 text-xs text-zinc-400">{formatDate(s.graduated_at)}</td>
                  <td className="px-4 py-3">
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
        <TableHeader cols={['Name', 'Email', 'Cohort', 'Status', 'Notes', '']} />
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {students.map((s) => (
            <tr key={s.id} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors group">
              <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100 text-sm whitespace-nowrap">{fullName(s)}</td>
              <td className="px-4 py-3 text-xs text-zinc-500">{s.email ?? '—'}</td>
              <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">{s.type === 'individual' ? '1:1' : `Cohort ${s.cohort}`}</td>
              <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
              <td className="px-4 py-3 text-xs text-zinc-400 max-w-[140px] truncate">{s.notes ?? '—'}</td>
              <td className="px-4 py-3">
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
