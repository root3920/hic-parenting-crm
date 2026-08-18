'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, RefreshCw, Users, Lock, Search, Filter } from 'lucide-react'
import { toast } from 'sonner'
import { useProfile } from '@/hooks/useProfile'
import { useTeamMembers } from '@/hooks/useTeamMembers'
import { cn } from '@/lib/utils'
import { PipelineContactModal, getLeadStatusConfig } from './PipelineContactModal'

interface PipelineContact {
  email: string
  name: string | null
  manual_override: boolean
  updated_at: string
  setter_assigned: string | null
  lead_status: string | null
}

interface PipelineStage {
  stage: number
  label: string
  color: string
  count: number
  contacts: PipelineContact[]
}

interface PipelineData {
  stages: PipelineStage[]
  total: number
}

const CARDS_PER_PAGE = 50

function getInitials(str: string): string {
  return str
    .split(/[\s@]/)
    .slice(0, 2)
    .map((w) => (w[0] || '').toUpperCase())
    .join('')
}

function getSetterInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => (w[0] || '').toUpperCase())
    .join('')
}

export function PipelineKanban() {
  const { profile } = useProfile()
  const isAdmin = profile?.role === 'admin'
  const { names: setterNames, loading: settersLoading } = useTeamMembers('setter')

  const [data, setData] = useState<PipelineData | null>(null)
  const [loading, setLoading] = useState(true)
  const [recomputing, setRecomputing] = useState(false)
  const [search, setSearch] = useState('')
  const [setterFilter, setSetterFilter] = useState('')
  const [expandedStage, setExpandedStage] = useState<number | null>(null)
  const [visibleCounts, setVisibleCounts] = useState<Record<number, number>>({})
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null)

  const fetchPipeline = useCallback(async (searchTerm?: string, setter?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchTerm) params.set('search', searchTerm)
      if (setter) params.set('setter', setter)
      const res = await fetch(`/api/contacts/pipeline?${params}`)
      const json = await res.json()
      if (json.error) {
        toast.error(json.error)
      } else {
        setData(json)
        // Reset visible counts
        const counts: Record<number, number> = {}
        for (const s of json.stages) counts[s.stage] = CARDS_PER_PAGE
        setVisibleCounts(counts)
      }
    } catch {
      toast.error('Failed to load pipeline')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPipeline() }, [fetchPipeline])

  // Debounced search + setter filter
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPipeline(search || undefined, setterFilter || undefined)
    }, 400)
    return () => clearTimeout(timer)
  }, [search, setterFilter, fetchPipeline])

  async function handleRecompute() {
    setRecomputing(true)
    try {
      const res = await fetch('/api/contacts/pipeline/recompute', { method: 'POST' })
      const json = await res.json()
      if (json.error) {
        toast.error(json.error)
      } else {
        toast.success(`Pipeline recomputed: ${json.total_contacts.toLocaleString()} contacts`)
        if (json.unclassified_titles?.length > 0) {
          console.log('Unclassified offer_titles:', json.unclassified_titles)
        }
        fetchPipeline(search || undefined, setterFilter || undefined)
      }
    } catch {
      toast.error('Recompute failed')
    } finally {
      setRecomputing(false)
    }
  }

  function loadMore(stage: number) {
    setVisibleCounts((prev) => ({
      ...prev,
      [stage]: (prev[stage] || CARDS_PER_PAGE) + CARDS_PER_PAGE,
    }))
  }

  function handleContactUpdated() {
    // Refresh pipeline data after a contact edit
    fetchPipeline(search || undefined, setterFilter || undefined)
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    )
  }

  if (!data) return null

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30 focus:border-[#ffbd59]"
          />
        </div>

        {/* Setter filter */}
        <div className="relative">
          <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
          <select
            value={setterFilter}
            onChange={(e) => setSetterFilter(e.target.value)}
            disabled={settersLoading}
            className="pl-8 pr-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30 focus:border-[#ffbd59] disabled:opacity-50 appearance-none min-w-[160px]"
          >
            <option value="">All Setters</option>
            <option value="__unassigned__">Unassigned</option>
            {setterNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
          <Users className="h-3.5 w-3.5" />
          {data.total.toLocaleString()} total
        </div>
        {isAdmin && (
          <button
            onClick={handleRecompute}
            disabled={recomputing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            {recomputing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {recomputing ? 'Recomputing…' : 'Recompute Pipeline'}
          </button>
        )}
      </div>

      {/* Kanban Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {data.stages.map((stage) => {
          const isExpanded = expandedStage === stage.stage
          const visible = visibleCounts[stage.stage] || CARDS_PER_PAGE
          const displayContacts = stage.contacts.slice(0, visible)
          const hasMore = stage.contacts.length > visible

          return (
            <div
              key={stage.stage}
              className={cn(
                'rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col',
                isExpanded && 'xl:col-span-2 lg:col-span-2',
              )}
            >
              {/* Column Header */}
              <button
                onClick={() => setExpandedStage(isExpanded ? null : stage.stage)}
                className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-100 dark:border-zinc-800 w-full text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors rounded-t-xl"
              >
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: stage.color }}
                />
                <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate flex-1">
                  {stage.label}
                </span>
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: `${stage.color}20`, color: stage.color }}
                >
                  {stage.count.toLocaleString()}
                </span>
              </button>

              {/* Contact Cards */}
              <div className="flex-1 overflow-y-auto max-h-[60vh] p-1.5 space-y-1">
                {displayContacts.length === 0 ? (
                  <p className="text-[10px] text-zinc-400 text-center py-4">No contacts</p>
                ) : (
                  displayContacts.map((contact) => {
                    const leadCfg = getLeadStatusConfig(contact.lead_status)
                    return (
                      <button
                        key={contact.email}
                        onClick={() => setSelectedEmail(contact.email)}
                        className="group w-full text-left px-2.5 py-2 rounded-lg border border-zinc-100 dark:border-zinc-800 hover:border-zinc-200 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                            style={{ backgroundColor: stage.color }}
                          >
                            {getInitials(contact.name || contact.email)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium text-zinc-800 dark:text-zinc-200 truncate">
                              {contact.name || '—'}
                            </p>
                            <p className="text-[10px] text-zinc-400 truncate">
                              {contact.email}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {/* Lead status badge */}
                            {leadCfg && (
                              <span
                                className="text-[8px] font-bold px-1 py-0.5 rounded"
                                style={{ backgroundColor: `${leadCfg.color}20`, color: leadCfg.color }}
                                title={leadCfg.label}
                              >
                                {leadCfg.label.split(' ')[0]}
                              </span>
                            )}
                            {/* Setter initials */}
                            {contact.setter_assigned && (
                              <span
                                className="text-[9px] font-bold px-1 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300"
                                title={contact.setter_assigned}
                              >
                                {getSetterInitials(contact.setter_assigned)}
                              </span>
                            )}
                            {contact.manual_override && (
                              <span title="Manually assigned"><Lock className="h-3 w-3 text-zinc-300 dark:text-zinc-600 shrink-0" /></span>
                            )}
                          </div>
                        </div>
                      </button>
                    )
                  })
                )}
                {hasMore && (
                  <button
                    onClick={() => loadMore(stage.stage)}
                    className="w-full text-center py-1.5 text-[10px] font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                  >
                    Show more ({stage.contacts.length - visible} remaining)
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Contact Detail Modal */}
      {selectedEmail && (
        <PipelineContactModal
          email={selectedEmail}
          onClose={() => setSelectedEmail(null)}
          onUpdated={handleContactUpdated}
        />
      )}
    </div>
  )
}
