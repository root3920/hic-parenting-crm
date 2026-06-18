'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { PageTransition } from '@/components/motion/PageTransition'
import {
  Search, ChevronDown, ChevronRight, Upload, Loader2, Users,
  Gift, Award, ShoppingBag, Star, Crown,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useProfile } from '@/hooks/useProfile'
import { formatDate } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// ── Types ──────────────────────────────────────────────────────────────────

interface Subgroup {
  name: string
  count: number
}

interface Group {
  id: string
  name: string
  color: string
  total: number
  subgroups: Subgroup[]
}

interface Contact {
  email: string
  name: string | null
  phone: string | null
  source: string | null
  date: string | null
  product: string | null
  instagram: string | null
}

// ── Icon map ───────────────────────────────────────────────────────────────

const GROUP_ICONS: Record<string, typeof Gift> = {
  freebies: Gift,
  program: Award,
  'low-ticket': ShoppingBag,
  'mid-ticket': Star,
  'high-ticket': Crown,
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function ContactsPage() {
  const { profile } = useProfile()
  const isAdmin = profile?.role === 'admin'

  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [globalSearch, setGlobalSearch] = useState('')

  // Import state
  const [importing, setImporting] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [csvContent, setCsvContent] = useState('')

  // Fetch group counts
  const fetchGroups = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/contacts/groups')
      const data = await res.json()
      if (data.groups) setGroups(data.groups)
    } catch {
      toast.error('Failed to load groups')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchGroups() }, [fetchGroups])

  const totalContacts = useMemo(() => groups.reduce((s, g) => s + g.total, 0), [groups])

  // Filter groups by global search (show all if searching)
  const visibleGroups = useMemo(() => {
    if (!globalSearch.trim()) return groups
    return groups.filter((g) => g.total > 0)
  }, [groups, globalSearch])

  async function handleImport() {
    if (!csvContent.trim()) return
    setImporting(true)
    try {
      const res = await fetch('/api/contacts/import-freebies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvContent }),
      })
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
      } else {
        toast.success(`Imported ${data.inserted} freebie leads`)
        setShowImportModal(false)
        setCsvContent('')
        fetchGroups()
      }
    } catch {
      toast.error('Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <PageTransition>
      <PageHeader title="Contacts" description="All buyers and leads grouped by product">
        {isAdmin && (
          <button
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />
            Import Freebies
          </button>
        )}
      </PageHeader>

      {/* Global search */}
      <div className="mb-6 flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search contacts across all groups…"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
          <Users className="h-3.5 w-3.5" />
          {loading ? '…' : `${totalContacts.toLocaleString()} total`}
        </div>
      </div>

      {/* Groups */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      ) : (
        <div className="space-y-3">
          {visibleGroups.map((group) => (
            <GroupSection
              key={group.id}
              group={group}
              expanded={expandedGroup === group.id || !!globalSearch.trim()}
              onToggle={() => setExpandedGroup(expandedGroup === group.id ? null : group.id)}
              globalSearch={globalSearch}
            />
          ))}
        </div>
      )}

      {/* Import modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl w-full max-w-lg mx-4 p-6">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Import Freebies CSV</h2>
            <p className="text-xs text-zinc-500 mb-4">
              Paste CSV with columns: fecha_compra, nombre, apellido, email, telefono, utm_source, producto, instagram
            </p>
            <textarea
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              placeholder="Paste CSV content here…"
              rows={10}
              className="w-full text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none font-mono mb-4"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => { setShowImportModal(false); setCsvContent('') }}
                className="px-4 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!csvContent.trim() || importing}
                className="px-4 py-2 text-xs rounded-lg text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: '#185FA5' }}
              >
                {importing ? 'Importing…' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageTransition>
  )
}

// ── Group Section ──────────────────────────────────────────────────────────

function GroupSection({
  group,
  expanded,
  onToggle,
  globalSearch,
}: {
  group: Group
  expanded: boolean
  onToggle: () => void
  globalSearch: string
}) {
  const Icon = GROUP_ICONS[group.id] || Users

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <div
          className="flex items-center justify-center h-9 w-9 rounded-lg shrink-0"
          style={{ backgroundColor: `${group.color}15` }}
        >
          <Icon className="h-4.5 w-4.5" style={{ color: group.color }} />
        </div>
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{group.name}</span>
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold"
              style={{ backgroundColor: `${group.color}15`, color: group.color }}
            >
              {group.total.toLocaleString()}
            </span>
          </div>
          {group.subgroups.length > 1 && (
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {group.subgroups.length} products
            </p>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />
        )}
      </button>

      {/* Expanded content */}
      {expanded && group.total > 0 && (
        <GroupContent group={group} globalSearch={globalSearch} />
      )}
      {expanded && group.total === 0 && (
        <div className="px-5 pb-5 text-center text-xs text-zinc-400">
          No contacts in this group yet
        </div>
      )}
    </div>
  )
}

// ── Group Content (tabs + table) ───────────────────────────────────────────

function GroupContent({ group, globalSearch }: { group: Group; globalSearch: string }) {
  const [activeProduct, setActiveProduct] = useState<string>('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  const effectiveSearch = globalSearch.trim() || search.trim()

  // Reset page when product or search changes
  useEffect(() => { setPage(1) }, [activeProduct, search, globalSearch])

  // Fetch contacts
  useEffect(() => {
    async function fetchContacts() {
      setLoading(true)
      const params = new URLSearchParams()
      if (activeProduct) params.set('product', activeProduct)
      params.set('page', String(page))
      if (effectiveSearch) params.set('search', effectiveSearch)

      try {
        const res = await fetch(`/api/contacts/group/${group.id}?${params}`)
        const data = await res.json()
        setContacts(data.contacts ?? [])
        setTotal(data.total ?? 0)
        setPageSize(data.pageSize ?? 50)
      } catch {
        toast.error('Failed to load contacts')
      } finally {
        setLoading(false)
      }
    }
    fetchContacts()
  }, [group.id, activeProduct, page, effectiveSearch])

  const totalPages = Math.ceil(total / pageSize)
  const showInstagram = group.id === 'freebies'

  return (
    <div className="border-t border-zinc-100 dark:border-zinc-800">
      {/* Subgroup tabs */}
      {group.subgroups.length > 1 && (
        <div className="px-5 pt-3 pb-1 flex flex-wrap gap-1.5">
          <button
            onClick={() => setActiveProduct('')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              !activeProduct
                ? 'text-white'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            )}
            style={!activeProduct ? { backgroundColor: group.color } : undefined}
          >
            All ({group.total.toLocaleString()})
          </button>
          {group.subgroups.map((sg) => (
            <button
              key={sg.name}
              onClick={() => setActiveProduct(sg.name)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                activeProduct === sg.name
                  ? 'text-white'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              )}
              style={activeProduct === sg.name ? { backgroundColor: group.color } : undefined}
            >
              {sg.name} ({sg.count.toLocaleString()})
            </button>
          ))}
        </div>
      )}

      {/* Search within group */}
      {!globalSearch.trim() && (
        <div className="px-5 pt-2 pb-2">
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input
              type="text"
              placeholder={`Search in ${group.name}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="px-5 pb-4">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-8 text-xs text-zinc-400">
            No contacts found{effectiveSearch ? ` matching "${effectiveSearch}"` : ''}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-100 dark:border-zinc-800">
                    <th className="text-left py-2 pr-4 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Name</th>
                    <th className="text-left py-2 pr-4 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Email</th>
                    <th className="text-left py-2 pr-4 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 hidden md:table-cell">Phone</th>
                    <th className="text-left py-2 pr-4 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 hidden lg:table-cell">Source</th>
                    <th className="text-left py-2 pr-4 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 hidden md:table-cell">Date</th>
                    {!activeProduct && group.subgroups.length > 1 && (
                      <th className="text-left py-2 pr-4 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 hidden lg:table-cell">Product</th>
                    )}
                    {showInstagram && (
                      <th className="text-left py-2 pr-4 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 hidden lg:table-cell">Instagram</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c, i) => (
                    <tr key={`${c.email}-${i}`} className="border-b border-zinc-50 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                            style={{ backgroundColor: group.color }}
                          >
                            {getInitials(c.name || c.email)}
                          </div>
                          <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate max-w-[160px]">
                            {c.name || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-zinc-600 dark:text-zinc-400 truncate max-w-[200px]">{c.email}</td>
                      <td className="py-2.5 pr-4 text-zinc-500 hidden md:table-cell">{c.phone || '—'}</td>
                      <td className="py-2.5 pr-4 text-zinc-500 hidden lg:table-cell">{c.source || '—'}</td>
                      <td className="py-2.5 pr-4 text-zinc-500 hidden md:table-cell">{c.date ? formatDate(c.date) : '—'}</td>
                      {!activeProduct && group.subgroups.length > 1 && (
                        <td className="py-2.5 pr-4 hidden lg:table-cell">
                          <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 truncate max-w-[140px]">
                            {c.product || '—'}
                          </span>
                        </td>
                      )}
                      {showInstagram && (
                        <td className="py-2.5 pr-4 text-zinc-500 hidden lg:table-cell">{c.instagram || '—'}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <span className="text-[11px] text-zinc-400">
                  Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} of {total.toLocaleString()}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page <= 1}
                    className="px-2.5 py-1 text-[11px] font-medium rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
                  >
                    Prev
                  </button>
                  <span className="text-[11px] text-zinc-500 px-2">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages}
                    className="px-2.5 py-1 text-[11px] font-medium rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function getInitials(str: string): string {
  return str
    .split(/[\s@]/)
    .slice(0, 2)
    .map((w) => (w[0] || '').toUpperCase())
    .join('')
}
