'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Loader2,
  RefreshCw,
  Plus,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  RotateCcw,
  CalendarPlus,
  Inbox,
  User,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useProfile } from '@/hooks/useProfile'

/* ── Types ─────────────────────────────────────────────────────── */

interface FollowupEvent {
  id: string
  contact_id: string
  followup_date: string
  notes: string | null
  created_by: string
  created_at: string
}

interface FollowupContact {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  setter_name: string
  reason: string
  status: 'active' | 'responded' | 'closed'
  added_at: string
  responded_at: string | null
  setter_followup_events: FollowupEvent[]
}

const STATUS_CONFIG = {
  active: {
    label: 'Active',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    text: 'text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-500',
  },
  responded: {
    label: 'Responded',
    bg: 'bg-green-50 dark:bg-green-900/20',
    text: 'text-green-600 dark:text-green-400',
    dot: 'bg-green-500',
  },
  closed: {
    label: 'Closed',
    bg: 'bg-zinc-100 dark:bg-zinc-800',
    text: 'text-zinc-500 dark:text-zinc-400',
    dot: 'bg-zinc-400',
  },
} as const

/* ── Component ─────────────────────────────────────────────────── */

export function FollowupTracking() {
  const { profile } = useProfile()
  const isAdmin = profile?.role === 'admin'

  const [contacts, setContacts] = useState<FollowupContact[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'active' | 'responded' | 'closed'>('active')

  // Add contact form
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState({ full_name: '', email: '', phone: '', reason: '' })
  const [addingContact, setAddingContact] = useState(false)

  // Expanded contact (to show events)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Add event form per contact
  const [eventFormId, setEventFormId] = useState<string | null>(null)
  const [eventForm, setEventForm] = useState({ followup_date: new Date().toISOString().slice(0, 10), notes: '' })
  const [addingEvent, setAddingEvent] = useState(false)

  // Status update loading
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null)

  const fetchContacts = useCallback(async (status: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/setter-portal/followup-contacts?status=${status}`)
      const json = await res.json()
      if (json.error) {
        toast.error(json.error)
      } else {
        setContacts(json.contacts || [])
      }
    } catch {
      toast.error('Failed to load follow-up contacts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchContacts(filter)
  }, [filter, fetchContacts])

  /* ── Add contact ──────────────────────────────────────────────── */

  async function handleAddContact(e: React.FormEvent) {
    e.preventDefault()
    if (!addForm.full_name.trim() || !addForm.reason.trim()) return
    setAddingContact(true)
    try {
      const res = await fetch('/api/setter-portal/followup-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      })
      const json = await res.json()
      if (json.error) {
        toast.error(json.error)
      } else {
        toast.success('Contact added')
        setAddForm({ full_name: '', email: '', phone: '', reason: '' })
        setShowAddForm(false)
        if (filter === 'active') {
          setContacts((prev) => [{ ...json, setter_followup_events: [] }, ...prev])
        }
      }
    } catch {
      toast.error('Failed to add contact')
    } finally {
      setAddingContact(false)
    }
  }

  /* ── Add follow-up event ──────────────────────────────────────── */

  async function handleAddEvent(contactId: string) {
    if (!eventForm.followup_date) return
    setAddingEvent(true)
    try {
      const res = await fetch('/api/setter-portal/followup-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: contactId,
          followup_date: eventForm.followup_date,
          notes: eventForm.notes || null,
        }),
      })
      const json = await res.json()
      if (json.error) {
        toast.error(json.error)
      } else {
        toast.success('Follow-up added')
        setContacts((prev) =>
          prev.map((c) =>
            c.id === contactId
              ? { ...c, setter_followup_events: [...c.setter_followup_events, json] }
              : c,
          ),
        )
        setEventFormId(null)
        setEventForm({ followup_date: new Date().toISOString().slice(0, 10), notes: '' })
      }
    } catch {
      toast.error('Failed to add follow-up')
    } finally {
      setAddingEvent(false)
    }
  }

  /* ── Change status ────────────────────────────────────────────── */

  async function handleStatusChange(contactId: string, newStatus: 'active' | 'responded' | 'closed') {
    setUpdatingStatusId(contactId)
    try {
      const res = await fetch(`/api/setter-portal/followup-contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const json = await res.json()
      if (json.error) {
        toast.error(json.error)
      } else {
        toast.success(`Marked as ${newStatus}`)
        // Remove from current list since filter changed
        setContacts((prev) => prev.filter((c) => c.id !== contactId))
      }
    } catch {
      toast.error('Failed to update status')
    } finally {
      setUpdatingStatusId(null)
    }
  }

  /* ── Render ───────────────────────────────────────────────────── */

  return (
    <div className="space-y-4">
      {/* Toolbar: filter + add button */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl">
          {(['active', 'responded', 'closed'] as const).map((s) => {
            const cfg = STATUS_CONFIG[s]
            const isActive = filter === s
            return (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                  isActive
                    ? 'bg-white dark:bg-zinc-900 shadow-sm ' + cfg.text
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300',
                )}
              >
                <span className={cn('w-2 h-2 rounded-full', cfg.dot)} />
                {cfg.label}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchContacts(filter)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-[#ffbd59] text-white hover:bg-[#e5a94f] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Contact
          </button>
        </div>
      </div>

      {/* Add contact form */}
      {showAddForm && (
        <form
          onSubmit={handleAddContact}
          className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Full name *"
              required
              value={addForm.full_name}
              onChange={(e) => setAddForm((f) => ({ ...f, full_name: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30 focus:border-[#ffbd59]"
            />
            <input
              type="email"
              placeholder="Email"
              value={addForm.email}
              onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30 focus:border-[#ffbd59]"
            />
            <input
              type="tel"
              placeholder="Phone"
              value={addForm.phone}
              onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30 focus:border-[#ffbd59]"
            />
            <input
              type="text"
              placeholder="Reason for follow-up *"
              required
              value={addForm.reason}
              onChange={(e) => setAddForm((f) => ({ ...f, reason: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30 focus:border-[#ffbd59]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-sm font-medium rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addingContact}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-[#ffbd59] text-white hover:bg-[#e5a94f] transition-colors disabled:opacity-50"
            >
              {addingContact && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save
            </button>
          </div>
        </form>
      )}

      {/* Contact list */}
      {loading && contacts.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      ) : contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
          <Inbox className="h-10 w-10 mb-3" />
          <p className="text-sm font-medium">
            No {filter} follow-up contacts
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map((contact) => {
            const isExpanded = expandedId === contact.id
            const events = contact.setter_followup_events || []
            const cfg = STATUS_CONFIG[contact.status]
            const isUpdating = updatingStatusId === contact.id

            return (
              <div
                key={contact.id}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden"
              >
                {/* Contact header row */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : contact.id)}
                >
                  {/* Expand chevron */}
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />
                  )}

                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 bg-[#3A6B9E]">
                    {contact.full_name
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((w) => (w[0] || '').toUpperCase())
                      .join('')}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {contact.full_name}
                      </p>
                      <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold', cfg.bg, cfg.text)}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                        {cfg.label}
                      </span>
                      {events.length > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                          {events.length} follow-up{events.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 truncate mt-0.5">
                      {contact.reason}
                      {contact.email && ` · ${contact.email}`}
                      {contact.phone && ` · ${contact.phone}`}
                    </p>
                  </div>

                  {/* Setter tag (admin) */}
                  {isAdmin && (
                    <div className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      <User className="h-3 w-3" />
                      {contact.setter_name}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="shrink-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {contact.status === 'active' && (
                      <>
                        <button
                          onClick={() => handleStatusChange(contact.id, 'responded')}
                          disabled={isUpdating}
                          title="Mark as Responded"
                          className="p-1.5 rounded-lg text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleStatusChange(contact.id, 'closed')}
                          disabled={isUpdating}
                          title="Close"
                          className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    {(contact.status === 'responded' || contact.status === 'closed') && (
                      <button
                        onClick={() => handleStatusChange(contact.id, 'active')}
                        disabled={isUpdating}
                        title="Reactivate"
                        className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded: events timeline + add event */}
                {isExpanded && (
                  <div className="border-t border-zinc-100 dark:border-zinc-800 px-4 py-3 bg-zinc-50/50 dark:bg-zinc-800/20">
                    {/* Timeline */}
                    {events.length > 0 ? (
                      <div className="space-y-2 mb-3">
                        {events.map((ev) => (
                          <div key={ev.id} className="flex items-start gap-3 text-sm">
                            <div className="shrink-0 w-[85px] text-xs font-medium text-zinc-500 dark:text-zinc-400 pt-0.5">
                              {new Date(ev.followup_date + 'T12:00:00').toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </div>
                            <div className="shrink-0 w-1.5 h-1.5 rounded-full bg-[#ffbd59] mt-1.5" />
                            <div className="min-w-0 flex-1">
                              <p className="text-zinc-700 dark:text-zinc-300">
                                {ev.notes || <span className="italic text-zinc-400">No notes</span>}
                              </p>
                              <p className="text-[11px] text-zinc-400 mt-0.5">by {ev.created_by}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-400 mb-3 italic">No follow-ups recorded yet</p>
                    )}

                    {/* Add event button / form */}
                    {contact.status === 'active' && (
                      <>
                        {eventFormId === contact.id ? (
                          <div className="flex items-end gap-2">
                            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <input
                                type="date"
                                value={eventForm.followup_date}
                                onChange={(e) => setEventForm((f) => ({ ...f, followup_date: e.target.value }))}
                                className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30 focus:border-[#ffbd59]"
                              />
                              <input
                                type="text"
                                placeholder="Notes (optional)"
                                value={eventForm.notes}
                                onChange={(e) => setEventForm((f) => ({ ...f, notes: e.target.value }))}
                                className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30 focus:border-[#ffbd59]"
                              />
                            </div>
                            <button
                              onClick={() => handleAddEvent(contact.id)}
                              disabled={addingEvent}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-sm font-semibold rounded-lg bg-[#ffbd59] text-white hover:bg-[#e5a94f] transition-colors disabled:opacity-50"
                            >
                              {addingEvent ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
                            </button>
                            <button
                              onClick={() => {
                                setEventFormId(null)
                                setEventForm({ followup_date: new Date().toISOString().slice(0, 10), notes: '' })
                              }}
                              className="px-2.5 py-1.5 text-sm font-medium rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEventFormId(contact.id)
                              setEventForm({ followup_date: new Date().toISOString().slice(0, 10), notes: '' })
                            }}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#ffbd59] hover:text-[#e5a94f] transition-colors"
                          >
                            <CalendarPlus className="h-3.5 w-3.5" />
                            Add Follow-up
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
