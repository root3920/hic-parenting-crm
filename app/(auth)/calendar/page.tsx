'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { PageTransition } from '@/components/motion/PageTransition'
import { useProfile } from '@/hooks/useProfile'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Plus, ChevronLeft, ChevronRight, X, Trash2, Pencil, Calendar as CalendarIcon } from 'lucide-react'

export const dynamic = 'force-dynamic'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Category {
  id: string
  name: string
  color: string
}

interface CalendarEvent {
  id: string
  title: string
  description: string | null
  start_date: string
  end_date: string
  category_id: string | null
  category: Category | null
}

// ─── Color swatches ─────────────────────────────────────────────────────────

const COLOR_SWATCHES = [
  { name: 'Blue',   value: '#3B82F6' },
  { name: 'Green',  value: '#10B981' },
  { name: 'Amber',  value: '#F59E0B' },
  { name: 'Purple', value: '#8B5CF6' },
  { name: 'Red',    value: '#EF4444' },
  { name: 'Pink',   value: '#EC4899' },
  { name: 'Teal',   value: '#14B8A6' },
  { name: 'Orange', value: '#F97316' },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDow = firstDay.getDay() // 0=Sun

  const days: { date: Date; current: boolean }[] = []

  // Prev month padding
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i)
    days.push({ date: d, current: false })
  }

  // Current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ date: new Date(year, month, d), current: true })
  }

  // Next month padding to fill grid (6 rows)
  while (days.length < 42) {
    const next = new Date(days[days.length - 1].date)
    next.setDate(next.getDate() + 1)
    days.push({ date: next, current: false })
  }

  return days
}

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isToday(d: Date): boolean {
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ─── Modal shell ────────────────────────────────────────────────────────────

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
        wide ? 'max-w-lg' : 'max-w-md'
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

const inputCls = 'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400'

// ─── Event Form Modal ───────────────────────────────────────────────────────

function EventFormModal({
  title,
  initial,
  categories,
  onClose,
  onSave,
}: {
  title: string
  initial: { title: string; description: string; start_date: string; end_date: string; category_id: string }
  categories: Category[]
  onClose: () => void
  onSave: (data: { title: string; description: string; start_date: string; end_date: string; category_id: string }) => Promise<void>
}) {
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) { toast.error('Title is required'); return }
    if (!form.start_date || !form.end_date) { toast.error('Dates are required'); return }
    if (form.end_date < form.start_date) { toast.error('End date must be after start date'); return }
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Title</label>
          <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Event title" />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Description</label>
          <textarea className={inputCls} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" style={{ resize: 'none' }} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Start Date</label>
            <input type="date" className={inputCls} value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">End Date</label>
            <input type="date" className={inputCls} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Category</label>
          <select className={inputCls} value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-xs rounded-lg text-white font-semibold hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: '#185FA5' }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Event Detail Modal ─────────────────────────────────────────────────────

function EventDetailModal({
  event,
  isAdmin,
  onClose,
  onEdit,
  onDelete,
}: {
  event: CalendarEvent
  isAdmin: boolean
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [deleting, setDeleting] = useState(false)

  function formatDateRange(start: string, end: string) {
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
    const s = new Date(start + 'T12:00:00').toLocaleDateString('en-US', opts)
    const e = new Date(end + 'T12:00:00').toLocaleDateString('en-US', opts)
    return start === end ? s : `${s} — ${e}`
  }

  return (
    <Modal title={event.title} onClose={onClose}>
      <div className="space-y-4">
        {event.category && (
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: event.category.color }} />
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{event.category.name}</span>
          </div>
        )}
        <div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-0.5">Date</p>
          <p className="text-sm text-zinc-800 dark:text-zinc-200">{formatDateRange(event.start_date, event.end_date)}</p>
        </div>
        {event.description && (
          <div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-0.5">Description</p>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{event.description}</p>
          </div>
        )}
        {isAdmin && (
          <div className="flex items-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
            <button
              onClick={async () => {
                setDeleting(true)
                onDelete()
              }}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-60"
            >
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { profile } = useProfile()
  const isAdmin = profile?.role === 'admin'

  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(() => new Date().getMonth())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  // Modals
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<CalendarEvent | null>(null)
  const [detailTarget, setDetailTarget] = useState<CalendarEvent | null>(null)

  // Category form
  const [catFormOpen, setCatFormOpen] = useState(false)
  const [catName, setCatName] = useState('')
  const [catColor, setCatColor] = useState(COLOR_SWATCHES[0].value)
  const [catSaving, setCatSaving] = useState(false)

  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/calendar/events?month=${monthKey}`)
      if (res.ok) setEvents(await res.json())
    } catch { /* silent */ }
    setLoading(false)
  }, [monthKey])

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/calendar/categories')
      if (res.ok) setCategories(await res.json())
    } catch { /* silent */ }
  }, [])

  useEffect(() => { fetchEvents() }, [fetchEvents])
  useEffect(() => { fetchCategories() }, [fetchCategories])

  // Month navigation
  function prevMonth() {
    if (month === 0) { setYear(year - 1); setMonth(11) }
    else setMonth(month - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(year + 1); setMonth(0) }
    else setMonth(month + 1)
  }

  // Calendar grid
  const days = useMemo(() => getMonthDays(year, month), [year, month])

  // Map events to days
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {}
    for (const ev of events) {
      const start = new Date(ev.start_date + 'T12:00:00')
      const end = new Date(ev.end_date + 'T12:00:00')
      const d = new Date(start)
      while (d <= end) {
        const key = dateStr(d)
        if (!map[key]) map[key] = []
        map[key].push(ev)
        d.setDate(d.getDate() + 1)
      }
    }
    return map
  }, [events])

  // ─── CRUD handlers ──────────────────────────────────────────────────────

  async function handleCreateEvent(data: { title: string; description: string; start_date: string; end_date: string; category_id: string }) {
    const res = await fetch('/api/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) { toast.error('Failed to create event'); return }
    toast.success('Event created')
    setCreateOpen(false)
    fetchEvents()
  }

  async function handleEditEvent(data: { title: string; description: string; start_date: string; end_date: string; category_id: string }) {
    if (!editTarget) return
    const res = await fetch(`/api/calendar/events/${editTarget.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) { toast.error('Failed to update event'); return }
    toast.success('Event updated')
    setEditTarget(null)
    fetchEvents()
  }

  async function handleDeleteEvent(id: string) {
    const res = await fetch(`/api/calendar/events/${id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to delete event'); return }
    toast.success('Event deleted')
    setDetailTarget(null)
    fetchEvents()
  }

  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault()
    if (!catName.trim()) { toast.error('Name is required'); return }
    setCatSaving(true)
    const res = await fetch('/api/calendar/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: catName.trim(), color: catColor }),
    })
    setCatSaving(false)
    if (!res.ok) { toast.error('Failed to create category'); return }
    toast.success('Category created')
    setCatFormOpen(false)
    setCatName('')
    setCatColor(COLOR_SWATCHES[0].value)
    fetchCategories()
  }

  async function handleDeleteCategory(id: string) {
    const res = await fetch(`/api/calendar/categories/${id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to delete category'); return }
    toast.success('Category deleted')
    fetchCategories()
    fetchEvents() // Re-fetch in case events lost their category
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto">
        <PageHeader title="Team Calendar" description="Shared team schedule and events">
          {isAdmin && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCreateOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                style={{ backgroundColor: '#185FA5' }}
              >
                <Plus className="h-3.5 w-3.5" /> New Event
              </button>
              <button
                onClick={() => setCatFormOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                style={{ backgroundColor: '#1D9E75' }}
              >
                <Plus className="h-3.5 w-3.5" /> New Category
              </button>
            </div>
          )}
        </PageHeader>

        <div className="flex gap-4 items-start">
          {/* ── Left Sidebar ── */}
          <div className="w-[240px] shrink-0 space-y-4 hidden md:block">
            {/* Month navigator */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
              <div className="flex items-center justify-between mb-1">
                <button onClick={prevMonth} className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  {MONTH_NAMES[month]} {year}
                </span>
                <button onClick={nextMonth} className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <button
                onClick={() => { setYear(new Date().getFullYear()); setMonth(new Date().getMonth()) }}
                className="w-full text-center text-[10px] text-blue-600 dark:text-blue-400 hover:underline mt-1"
              >
                Today
              </button>
            </div>

            {/* Categories */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Categories</p>
              </div>
              <div className="p-2">
                {categories.length === 0 && (
                  <p className="text-xs text-zinc-400 px-2 py-2">No categories yet</p>
                )}
                {categories.map((cat) => (
                  <div key={cat.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800 group">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 flex-1 truncate">{cat.name}</span>
                    {isAdmin && (
                      <button
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="p-0.5 rounded text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        title="Delete category"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {isAdmin && (
                <div className="px-3 pb-3">
                  <button
                    onClick={() => setCatFormOpen(true)}
                    className="flex items-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <Plus className="h-3 w-3" /> Add Category
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Main Calendar Grid ── */}
          <div className="flex-1 min-w-0">
            {/* Mobile month nav */}
            <div className="flex items-center justify-between mb-3 md:hidden">
              <button onClick={prevMonth} className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                {MONTH_NAMES[month]} {year}
              </span>
              <button onClick={nextMonth} className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              {/* Day-of-week header */}
              <div className="grid grid-cols-7 border-b border-zinc-100 dark:border-zinc-800">
                {DAY_NAMES.map((d) => (
                  <div key={d} className="py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar cells */}
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
                    const key = dateStr(date)
                    const dayEvents = eventsByDate[key] ?? []
                    const today = isToday(date)

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
                            ? 'bg-blue-600 text-white'
                            : current
                              ? 'text-zinc-700 dark:text-zinc-300'
                              : 'text-zinc-300 dark:text-zinc-600',
                        )}>
                          {date.getDate()}
                        </span>
                        <div className="space-y-0.5">
                          {dayEvents.slice(0, 3).map((ev) => {
                            const color = ev.category?.color ?? '#6B7280'
                            return (
                              <button
                                key={ev.id}
                                onClick={() => setDetailTarget(ev)}
                                className="w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium truncate leading-tight transition-opacity hover:opacity-80"
                                style={{ backgroundColor: `${color}20`, color }}
                                title={ev.title}
                              >
                                {ev.title}
                              </button>
                            )
                          })}
                          {dayEvents.length > 3 && (
                            <p className="text-[9px] text-zinc-400 px-1">+{dayEvents.length - 3} more</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}

      {createOpen && (
        <EventFormModal
          title="New Event"
          initial={{ title: '', description: '', start_date: '', end_date: '', category_id: '' }}
          categories={categories}
          onClose={() => setCreateOpen(false)}
          onSave={handleCreateEvent}
        />
      )}

      {editTarget && (
        <EventFormModal
          title="Edit Event"
          initial={{
            title: editTarget.title,
            description: editTarget.description ?? '',
            start_date: editTarget.start_date,
            end_date: editTarget.end_date,
            category_id: editTarget.category_id ?? '',
          }}
          categories={categories}
          onClose={() => setEditTarget(null)}
          onSave={handleEditEvent}
        />
      )}

      {detailTarget && (
        <EventDetailModal
          event={detailTarget}
          isAdmin={isAdmin}
          onClose={() => setDetailTarget(null)}
          onEdit={() => {
            const ev = detailTarget
            setDetailTarget(null)
            setEditTarget(ev)
          }}
          onDelete={() => handleDeleteEvent(detailTarget.id)}
        />
      )}

      {catFormOpen && (
        <Modal title="New Category" onClose={() => setCatFormOpen(false)}>
          <form onSubmit={handleCreateCategory} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Name</label>
              <input className={inputCls} value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Category name" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">Color</label>
              <div className="flex items-center gap-2 flex-wrap">
                {COLOR_SWATCHES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setCatColor(s.value)}
                    className={cn(
                      'w-8 h-8 rounded-full border-2 transition-all',
                      catColor === s.value ? 'border-zinc-900 dark:border-white scale-110' : 'border-transparent hover:scale-105'
                    )}
                    style={{ backgroundColor: s.value }}
                    title={s.name}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => setCatFormOpen(false)} className="px-4 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={catSaving} className="px-4 py-2 text-xs rounded-lg text-white font-semibold hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: '#1D9E75' }}>
                {catSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </PageTransition>
  )
}
