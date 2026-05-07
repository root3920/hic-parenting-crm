'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { KPICard } from '@/components/shared/KPICard'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatDate } from '@/lib/utils'
import { Contact } from '@/types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, ExternalLink, Users, UserPlus, PhoneCall, GraduationCap } from 'lucide-react'
import { PageTransition } from '@/components/motion/PageTransition'
import { KPICardGrid } from '@/components/motion/KPICardGrid'
import { AnimatedTableRow } from '@/components/motion/AnimatedTableRow'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

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

type DateFilter = 'today' | '7d' | '30d' | 'all'

function isNew24h(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() < 24 * 60 * 60 * 1000
}

export default function ContactsPage() {
  const supabase = useMemo(() => createClient(), [])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ContactStatus | 'All'>('All')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [editingId, setEditingId] = useState<string | null>(null)

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

  // Update status
  async function updateStatus(id: string, newStatus: ContactStatus) {
    const { error } = await supabase
      .from('contacts')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      toast.error('Failed to update status: ' + error.message)
      return
    }
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: newStatus, updated_at: new Date().toISOString() } : c))
    )
    setEditingId(null)
  }

  // Filtered contacts
  const filtered = useMemo(() => {
    let list = contacts

    // Date filter
    if (dateFilter !== 'all') {
      const now = Date.now()
      const ms =
        dateFilter === 'today' ? 24 * 60 * 60 * 1000
        : dateFilter === '7d' ? 7 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000
      list = list.filter((c) => now - new Date(c.created_at).getTime() < ms)
    }

    // Status filter
    if (statusFilter !== 'All') {
      list = list.filter((c) => c.status === statusFilter)
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (c) =>
          c.full_name.toLowerCase().includes(q) ||
          (c.email && c.email.toLowerCase().includes(q))
      )
    }

    return list
  }, [contacts, search, statusFilter, dateFilter])

  // KPI values
  const totalCount = contacts.length
  const newCount = contacts.filter((c) => c.status === 'New').length
  const callBookedCount = contacts.filter((c) => c.status === 'Call Booked').length
  const enrolledCount = contacts.filter((c) => c.status === 'Enrolled').length

  return (
    <PageTransition>
      <PageHeader title="Contacts" description="Lead pipeline from Go High Level" />

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
          <Input
            placeholder="Search name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
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
                    contact.status === 'New' && 'bg-blue-50/60 dark:bg-blue-950/20 border-l-4 border-l-blue-400',
                    contact.status !== 'New' && 'border-l-4 border-l-transparent'
                  )}
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
                  <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">
                    {contact.email || '—'}
                  </TableCell>
                  <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">
                    {contact.phone || '—'}
                  </TableCell>
                  <TableCell>
                    {editingId === contact.id ? (
                      <select
                        autoFocus
                        className="text-xs rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                        value={contact.status}
                        onChange={(e) => updateStatus(contact.id, e.target.value as ContactStatus)}
                        onBlur={() => setEditingId(null)}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    ) : (
                      <button
                        onClick={() => setEditingId(contact.id)}
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
                  <TableCell className="text-sm text-zinc-500 dark:text-zinc-400">
                    {formatDate(contact.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    {contact.ghl_id ? (
                      <a
                        href={`https://app.hicparenting.com/v2/location/E9DtRyrhRO9Ce7h1D0u7/contacts/detail/${contact.ghl_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                          Contact
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </a>
                    ) : (
                      <span className="text-xs text-zinc-400">No GHL ID</span>
                    )}
                  </TableCell>
                </AnimatedTableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </PageTransition>
  )
}
