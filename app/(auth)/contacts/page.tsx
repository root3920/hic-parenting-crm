'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { KPICard } from '@/components/shared/KPICard'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatDate } from '@/lib/utils'
import { Contact, ContactNote } from '@/types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Search, ExternalLink, Users, UserPlus, PhoneCall, GraduationCap,
  Plus, Pencil, Trash2, X, Mail, Phone, Clock, MessageSquare, Tag,
} from 'lucide-react'
import { PageTransition } from '@/components/motion/PageTransition'
import { KPICardGrid } from '@/components/motion/KPICardGrid'
import { AnimatedTableRow } from '@/components/motion/AnimatedTableRow'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useProfile } from '@/hooks/useProfile'

export const dynamic = 'force-dynamic'

const STATUSES = ['New', 'Contacted', 'Engaged', 'Call Proposed', 'Call Booked', 'Enrolled'] as const
type ContactStatus = (typeof STATUSES)[number]

const STATUS_COLORS: Record<ContactStatus, string> = {
  'New':           'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800',
  'Contacted':     'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
  'Engaged':       'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border border-orange-200 dark:border-orange-800',
  'Call Proposed': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800',
  'Call Booked':   'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border border-green-200 dark:border-green-800',
  'Enrolled':      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
}

const TAG_COLORS: Record<string, string> = {
  'SPC Member':     'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'SPC Trial':      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'PWU Student':    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  'PWU Graduate':   'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  'Call Scheduled': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
}

const ALL_TAGS = [
  'SPC Member', 'SPC Trial', 'SPC Cancelled', 'PWU Student', 'PWU Graduate',
  'Call Scheduled', 'Hot Lead', 'Cold Lead', 'Do Not Contact', 'VIP', 'Referral',
] as const

const TAG_FILTER_OPTIONS = ['All', 'SPC Member', 'SPC Trial', 'PWU Student', 'PWU Graduate', 'No tags'] as const
type TagFilter = (typeof TAG_FILTER_OPTIONS)[number]

type DateFilter = 'today' | '7d' | '30d' | 'all'

interface ContactForm {
  first_name: string
  last_name: string
  email: string
  phone: string
  owner: string
  status: ContactStatus
  ghl_id: string
}

const emptyForm: ContactForm = {
  first_name: '', last_name: '', email: '', phone: '',
  owner: '', status: 'New', ghl_id: '',
}

function isNew24h(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() < 24 * 60 * 60 * 1000
}

function formatDateTime(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function noteBorderCls(createdAt: string) {
  const diff = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
  if (diff < 3) return 'border-green-400 bg-green-50 dark:bg-green-900/10'
  if (diff < 7) return 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/10'
  return 'border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800/60'
}

function TagPills({ tags, max = 2 }: { tags: string[]; max?: number }) {
  if (!tags || tags.length === 0) return <span className="text-xs text-zinc-400">—</span>
  const shown = tags.slice(0, max)
  const extra = tags.length - max
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((tag) => (
        <span key={tag} className={cn('inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium', TAG_COLORS[tag] || 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400')}>
          {tag}
        </span>
      ))}
      {extra > 0 && <span className="text-[10px] text-zinc-400">+{extra}</span>}
    </div>
  )
}

// ── Contact Form Modal ──────────────────────────────────────────────────

function ContactFormModal({
  title,
  form,
  saving,
  onChange,
  onSave,
  onClose,
}: {
  title: string
  form: ContactForm
  saving: boolean
  onChange: <K extends keyof ContactForm>(key: K, value: ContactForm[K]) => void
  onSave: () => void
  onClose: () => void
}) {
  const inputCls = 'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="h-4 w-4 text-zinc-500" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">
              First Name <span className="text-red-500">*</span>
            </label>
            <input className={inputCls} value={form.first_name} onChange={(e) => onChange('first_name', e.target.value)} placeholder="John" />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">Last Name</label>
            <input className={inputCls} value={form.last_name} onChange={(e) => onChange('last_name', e.target.value)} placeholder="Doe" />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">Email</label>
          <input type="email" className={inputCls} value={form.email} onChange={(e) => onChange('email', e.target.value)} placeholder="john@example.com" />
        </div>

        <div>
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">Phone</label>
          <input className={inputCls} value={form.phone} onChange={(e) => onChange('phone', e.target.value)} placeholder="+1 555 123 4567" />
        </div>

        <div>
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">Owner</label>
          <input className={inputCls} value={form.owner} onChange={(e) => onChange('owner', e.target.value)} placeholder="Optional" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">Status</label>
            <select className={inputCls} value={form.status} onChange={(e) => onChange('status', e.target.value as ContactStatus)}>
              {STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">GHL ID</label>
            <input className={inputCls} value={form.ghl_id} onChange={(e) => onChange('ghl_id', e.target.value)} placeholder="Optional" />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={onSave} disabled={saving || !form.first_name.trim()} className="bg-blue-600 hover:bg-blue-700 text-white">
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Contact Detail Modal ────────────────────────────────────────────────

function ContactDetailModal({
  contact,
  onClose,
  onEdit,
  onDelete,
  onStatusChange,
  onAddTag,
  onRemoveTag,
  authorName,
}: {
  contact: Contact
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onStatusChange: (id: string, status: ContactStatus) => void
  onAddTag: (id: string, tag: string) => void
  onRemoveTag: (id: string, tag: string) => void
  authorName: string
}) {
  const supabase = useMemo(() => createClient(), [])
  const [notes, setNotes] = useState<ContactNote[]>([])
  const [noteText, setNoteText] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [loadingNotes, setLoadingNotes] = useState(true)

  const sectionLabel = 'text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3'
  const rowLabel = 'text-xs text-zinc-500 dark:text-zinc-400'
  const rowValue = 'text-xs font-medium text-zinc-800 dark:text-zinc-200 text-right'

  // Fetch notes
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('contact_notes')
        .select('*')
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: false })
      setNotes((data as ContactNote[]) ?? [])
      setLoadingNotes(false)
    }
    load()
  }, [supabase, contact.id])

  async function handleAddNote() {
    if (!noteText.trim()) return
    setAddingNote(true)
    const { data, error } = await supabase
      .from('contact_notes')
      .insert({
        contact_id: contact.id,
        author_name: authorName,
        note: noteText.trim(),
      })
      .select()
      .single()
    setAddingNote(false)

    if (error) {
      toast.error('Failed to add note: ' + error.message)
      return
    }
    setNotes((prev) => [data as ContactNote, ...prev])
    setNoteText('')
  }

  const initials = contact.full_name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
        {/* Header */}
        <div className="flex items-start gap-4 mb-6 -mt-1">
          <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-lg font-bold text-blue-600 dark:text-blue-300 shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              {contact.full_name}
            </h3>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {(contact.tags || []).map((tag) => (
                <span key={tag} className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium', TAG_COLORS[tag] || 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400')}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onEdit} className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" title="Edit">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={onDelete} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
            {contact.ghl_id && (
              <a
                href={`https://app.hicparenting.com/v2/location/E9DtRyrhRO9Ce7h1D0u7/contacts/detail/${contact.ghl_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                title="Open in GHL"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors ml-1">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body: two columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* LEFT: Key Info */}
          <div>
            <p className={sectionLabel}>Contact Info</p>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className={rowLabel}>Email</span>
                {contact.email ? (
                  <a href={`mailto:${contact.email}`} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {contact.email}
                  </a>
                ) : (
                  <span className={rowValue}>—</span>
                )}
              </div>
              <div className="flex justify-between items-center">
                <span className={rowLabel}>Phone</span>
                {contact.phone ? (
                  <a href={`tel:${contact.phone}`} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {contact.phone}
                  </a>
                ) : (
                  <span className={rowValue}>—</span>
                )}
              </div>
              <div className="flex justify-between items-center">
                <span className={rowLabel}>Status</span>
                <select
                  className="text-xs rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  value={contact.status}
                  onChange={(e) => onStatusChange(contact.id, e.target.value as ContactStatus)}
                >
                  {STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
                </select>
              </div>
              <div className="flex justify-between"><span className={rowLabel}>Owner</span><span className={rowValue}>{contact.owner || '—'}</span></div>
              <div className="flex justify-between"><span className={rowLabel}>GHL ID</span><span className={rowValue}>{contact.ghl_id || '—'}</span></div>
              <div className="flex justify-between"><span className={rowLabel}>Created</span><span className={rowValue}>{formatDate(contact.created_at)}</span></div>
              {contact.spc_status && (
                <div className="flex justify-between"><span className={rowLabel}>SPC Status</span><span className={rowValue}>{contact.spc_status}</span></div>
              )}
              {contact.pwu_cohort && (
                <div className="flex justify-between"><span className={rowLabel}>PWU Cohort</span><span className={rowValue}>{contact.pwu_cohort}</span></div>
              )}
              {contact.source && (
                <div className="flex justify-between"><span className={rowLabel}>Source</span><span className={rowValue}>{contact.source}</span></div>
              )}
            </div>

            {/* Tags section (editable) */}
            <div className="mt-5">
              <p className={sectionLabel}>
                <Tag className="h-3 w-3 inline mr-1" />
                Tags
              </p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(contact.tags || []).length === 0 && (
                  <span className="text-xs text-zinc-400 italic">No tags</span>
                )}
                {(contact.tags || []).map((tag) => (
                  <span key={tag} className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium', TAG_COLORS[tag] || 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400')}>
                    {tag}
                    <button
                      onClick={() => onRemoveTag(contact.id, tag)}
                      className="hover:text-red-500 transition-colors text-current opacity-60 hover:opacity-100"
                      title="Remove tag"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
              <select
                className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    onAddTag(contact.id, e.target.value)
                    e.target.value = ''
                  }
                }}
              >
                <option value="" disabled>+ Add tag...</option>
                {ALL_TAGS.filter((t) => !(contact.tags || []).includes(t)).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* RIGHT: Notes */}
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="h-3.5 w-3.5 text-zinc-400" />
              <p className={cn(sectionLabel, 'mb-0')}>Contact Notes</p>
            </div>

            <div className="flex-1 space-y-2 max-h-72 overflow-y-auto pr-1 mb-4">
              {loadingNotes ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (<div key={i} className="h-14 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />))}
                </div>
              ) : notes.length === 0 ? (
                <div className="text-center py-10 text-zinc-400 text-xs">
                  No notes yet. Add the first contact note below.
                </div>
              ) : (
                notes.map((note) => (
                  <div key={note.id} className={cn('rounded-xl p-3 border-l-4', noteBorderCls(note.created_at))}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">{note.author_name}</span>
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

            <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    handleAddNote()
                  }
                }}
                placeholder="Add a contact note... (⌘+Enter to save)"
                rows={3}
                className="w-full text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none"
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={handleAddNote}
                  disabled={!noteText.trim() || addingNote}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                  style={{ backgroundColor: '#185FA5' }}
                >
                  <MessageSquare className="h-3 w-3" />
                  {addingNote ? 'Saving...' : 'Add Note'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────

export default function ContactsPage() {
  const supabase = useMemo(() => createClient(), [])
  const { profile } = useProfile()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ContactStatus | 'All'>('All')
  const [tagFilter, setTagFilter] = useState<TagFilter>('All')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [statusEditId, setStatusEditId] = useState<string | null>(null)

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [editContact, setEditContact] = useState<Contact | null>(null)
  const [detailContact, setDetailContact] = useState<Contact | null>(null)
  const [form, setForm] = useState<ContactForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  function setField<K extends keyof ContactForm>(key: K, value: ContactForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // Fetch contacts
  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) {
        console.error('Error loading contacts:', error)
        toast.error('Failed to load contacts')
      }
      setContacts((data as Contact[]) ?? [])
      setLoading(false)
    }
    load()
  }, [supabase])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('contacts-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'contacts' },
        (payload) => {
          const newContact = payload.new as Contact
          setContacts((prev) => {
            if (prev.some((c) => c.id === newContact.id)) return prev
            return [newContact, ...prev]
          })
          toast.success(`New contact: ${newContact.full_name}`)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  // Status update (shared between table inline and detail modal)
  const updateStatus = useCallback(async (id: string, newStatus: ContactStatus) => {
    const res = await fetch(`/api/contacts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (!res.ok) {
      toast.error('Failed to update status')
      return
    }
    const updated = await res.json()
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)))
    setDetailContact((prev) => prev && prev.id === id ? { ...prev, ...updated } : prev)
    setStatusEditId(null)
  }, [])

  // Add contact
  function openAddModal() {
    setForm(emptyForm)
    setEditContact(null)
    setShowAddModal(true)
  }

  async function handleAdd() {
    if (!form.first_name.trim()) return
    setSaving(true)
    const full_name = `${form.first_name} ${form.last_name}`.trim()
    const { data, error } = await supabase
      .from('contacts')
      .insert({
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        full_name,
        email: form.email || null,
        phone: form.phone || null,
        owner: form.owner || null,
        status: form.status,
        ghl_id: form.ghl_id || null,
      })
      .select()
      .single()
    setSaving(false)

    if (error) {
      toast.error('Failed to add contact: ' + error.message)
      return
    }
    setContacts((prev) => [data as Contact, ...prev])
    setShowAddModal(false)
    toast.success('Contact added')
  }

  // Edit contact
  function openEditModal(contact: Contact) {
    setForm({
      first_name: contact.first_name || '',
      last_name: contact.last_name || '',
      email: contact.email || '',
      phone: contact.phone || '',
      owner: contact.owner || '',
      status: (contact.status as ContactStatus) || 'New',
      ghl_id: contact.ghl_id || '',
    })
    setEditContact(contact)
    setShowAddModal(false)
    setDetailContact(null)
  }

  async function handleEdit() {
    if (!editContact || !form.first_name.trim()) return
    setSaving(true)
    const full_name = `${form.first_name} ${form.last_name}`.trim()
    const res = await fetch(`/api/contacts/${editContact.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        full_name,
        email: form.email || null,
        phone: form.phone || null,
        owner: form.owner || null,
        status: form.status,
        ghl_id: form.ghl_id || null,
      }),
    })
    setSaving(false)

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error('Failed to update: ' + (body.error || 'Unknown error'))
      return
    }
    const updated = await res.json()
    setContacts((prev) => prev.map((c) => (c.id === editContact.id ? { ...c, ...updated } : c)))
    setEditContact(null)
    toast.success('Contact updated')
  }

  // Delete contact
  async function handleDelete(id: string) {
    if (!confirm('Delete this contact? This cannot be undone.')) return
    const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error('Error deleting contact')
      return
    }
    setContacts((prev) => prev.filter((c) => c.id !== id))
    setDetailContact(null)
    toast.success('Contact deleted')
  }

  // Tag management
  async function handleAddTag(id: string, tag: string) {
    const contact = contacts.find((c) => c.id === id)
    if (!contact || (contact.tags || []).includes(tag)) return
    const newTags = [...(contact.tags || []), tag]
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, tags: newTags } : c)))
    setDetailContact((prev) => prev && prev.id === id ? { ...prev, tags: newTags } : prev)
    const res = await fetch(`/api/contacts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: newTags }),
    })
    if (!res.ok) toast.error('Failed to add tag')
    else toast.success(`Tag added: ${tag}`)
  }

  async function handleRemoveTag(id: string, tag: string) {
    const contact = contacts.find((c) => c.id === id)
    if (!contact) return
    const newTags = (contact.tags || []).filter((t) => t !== tag)
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, tags: newTags } : c)))
    setDetailContact((prev) => prev && prev.id === id ? { ...prev, tags: newTags } : prev)
    const res = await fetch(`/api/contacts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: newTags }),
    })
    if (!res.ok) toast.error('Failed to remove tag')
    else toast.success('Tag removed')
  }

  // Filtered contacts
  const filtered = useMemo(() => {
    let list = contacts

    if (dateFilter !== 'all') {
      const now = Date.now()
      const ms =
        dateFilter === 'today' ? 24 * 60 * 60 * 1000
        : dateFilter === '7d' ? 7 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000
      list = list.filter((c) => now - new Date(c.created_at).getTime() < ms)
    }

    if (statusFilter !== 'All') {
      list = list.filter((c) => c.status === statusFilter)
    }

    if (tagFilter !== 'All') {
      if (tagFilter === 'No tags') {
        list = list.filter((c) => !c.tags || c.tags.length === 0)
      } else {
        list = list.filter((c) => c.tags && c.tags.includes(tagFilter))
      }
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (c) =>
          c.full_name.toLowerCase().includes(q) ||
          (c.email && c.email.toLowerCase().includes(q))
      )
    }

    return list
  }, [contacts, search, statusFilter, tagFilter, dateFilter])

  // KPI values
  const totalCount = contacts.length
  const newCount = contacts.filter((c) => c.status === 'New').length
  const callBookedCount = contacts.filter((c) => c.status === 'Call Booked').length
  const enrolledCount = contacts.filter((c) => c.status === 'Enrolled').length

  return (
    <PageTransition>
      <PageHeader title="Contacts" description="Lead pipeline from Go High Level">
        <Button onClick={openAddModal} className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5" size="sm">
          <Plus className="h-4 w-4" />
          Add Contact
        </Button>
      </PageHeader>

      {/* KPI Cards */}
      <KPICardGrid className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KPICard title="Total Contacts" value={totalCount} loading={loading} icon={<Users className="h-4 w-4" />} />
        <KPICard title="New" value={newCount} loading={loading} icon={<UserPlus className="h-4 w-4" />} className="ring-1 ring-blue-200 dark:ring-blue-800" />
        <KPICard title="Call Booked" value={callBookedCount} loading={loading} icon={<PhoneCall className="h-4 w-4" />} />
        <KPICard title="Enrolled" value={enrolledCount} loading={loading} icon={<GraduationCap className="h-4 w-4" />} />
      </KPICardGrid>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input placeholder="Search name or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {/* Status filter */}
        <div className="flex flex-wrap gap-1.5">
          {(['All', ...STATUSES] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                statusFilter === s
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Tag filter */}
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value as TagFilter)}
          className="text-xs rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          {TAG_FILTER_OPTIONS.map((t) => (<option key={t} value={t}>{t === 'All' ? 'All Types' : t}</option>))}
        </select>

        {/* Date filter */}
        <div className="flex gap-1.5 ml-auto">
          {([
            ['today', 'Today'],
            ['7d', '7d'],
            ['30d', '30d'],
            ['all', 'All'],
          ] as [DateFilter, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setDateFilter(val)}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                dateFilter === val
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No contacts found" description="Adjust your filters or wait for new leads from Go High Level." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <Table>
            <TableHeader>
              <tr className="bg-zinc-50 dark:bg-zinc-900/50">
                <TableHead className="w-10 text-center">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {filtered.map((contact, idx) => (
                <AnimatedTableRow
                  key={contact.id}
                  custom={idx}
                  variants={{
                    hidden: { opacity: 0, x: -8 },
                    visible: (i: number) => ({ opacity: 1, x: 0, transition: { delay: i * 0.04, duration: 0.2, ease: 'easeOut' as const } }),
                  }}
                  initial="hidden"
                  animate="visible"
                  className={cn(
                    'cursor-pointer',
                    contact.status === 'New' && 'bg-blue-50/60 dark:bg-blue-950/20 border-l-4 border-l-blue-400',
                    contact.status !== 'New' && 'border-l-4 border-l-transparent'
                  )}
                  onClick={() => setDetailContact(contact)}
                >
                  <TableCell className="text-center text-xs text-zinc-400">{idx + 1}</TableCell>
                  <TableCell className="font-medium text-zinc-900 dark:text-zinc-100">
                    <div className="flex items-center gap-2">
                      {contact.full_name}
                      {isNew24h(contact.created_at) && (
                        <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500 text-white leading-none">
                          NEW
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">{contact.email || '—'}</TableCell>
                  <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">{contact.phone || '—'}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <TagPills tags={contact.tags || []} />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {statusEditId === contact.id ? (
                      <select
                        autoFocus
                        className="text-xs rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                        value={contact.status}
                        onChange={(e) => updateStatus(contact.id, e.target.value as ContactStatus)}
                        onBlur={() => setStatusEditId(null)}
                      >
                        {STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
                      </select>
                    ) : (
                      <button
                        onClick={() => setStatusEditId(contact.id)}
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity',
                          STATUS_COLORS[contact.status as ContactStatus] ?? STATUS_COLORS['New']
                        )}
                        title="Click to change status"
                      >
                        {contact.status}
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-zinc-500 dark:text-zinc-400">{formatDate(contact.created_at)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {contact.ghl_id && (
                        <a
                          href={`https://app.hicparenting.com/v2/location/E9DtRyrhRO9Ce7h1D0u7/contacts/detail/${contact.ghl_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button variant="outline" size="sm" className="gap-1 text-xs h-7 px-2">
                            Contact
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </a>
                      )}
                      <button
                        onClick={() => openEditModal(contact)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(contact.id)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </AnimatedTableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add Contact Modal */}
      {showAddModal && (
        <ContactFormModal
          title="Add Contact"
          form={form}
          saving={saving}
          onChange={setField}
          onSave={handleAdd}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Edit Contact Modal */}
      {editContact && (
        <ContactFormModal
          title="Edit Contact"
          form={form}
          saving={saving}
          onChange={setField}
          onSave={handleEdit}
          onClose={() => setEditContact(null)}
        />
      )}

      {/* Detail Modal */}
      {detailContact && (
        <ContactDetailModal
          contact={detailContact}
          onClose={() => setDetailContact(null)}
          onEdit={() => openEditModal(detailContact)}
          onDelete={() => handleDelete(detailContact.id)}
          onStatusChange={updateStatus}
          onAddTag={handleAddTag}
          onRemoveTag={handleRemoveTag}
          authorName={profile?.full_name || 'Unknown'}
        />
      )}
    </PageTransition>
  )
}
