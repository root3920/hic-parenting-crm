'use client'

import { useEffect, useState, useCallback } from 'react'
import { X, Mail, Phone, Loader2, User, CalendarCheck, Save, PhoneCall } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'
import { useProfile } from '@/hooks/useProfile'
import { useTeamMembers } from '@/hooks/useTeamMembers'
import { STAGE_LABELS, STAGE_COLORS, type PipelineTier } from '@/lib/pipeline-tiers'

// ── Types ────────────────────────────────────────────────────────────────────

interface ContactDetail {
  buyer_email: string
  buyer_name: string | null
  current_stage: number
  manual_override: boolean
  setter_assigned: string | null
  lead_status: string | null
  last_contacted_at: string | null
  product_proposed: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface Transaction {
  id: string
  date: string
  offer_title: string
  cost: number
  buyer_name: string
  buyer_email: string
  buyer_phone?: string
  currency: string
  source: string
  status: string
  created_at: string
}

interface CallRecord {
  id: string
  start_date: string
  full_name: string | null
  email: string | null
  status: string | null
  call_type: string | null
  call_status: string | null
  call_summary: string | null
  setter_name: string | null
  closer_name: string | null
  notes: string | null
}

interface SpcMemberInfo {
  id: string
  name: string | null
  email: string
  plan: string
  amount: number
  status: string
  provider: string
  joined_at: string
  next_payment_date: string | null
  trial_end_date: string | null
}

// ── Lead status config ───────────────────────────────────────────────────────

const LEAD_STATUSES = [
  { value: 'hot_lead', label: 'Hot Lead', color: '#F97316', bg: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' },
  { value: 'engaged', label: 'Engaged', color: '#22C55E', bg: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' },
  { value: 'disqualified_lead', label: 'Disqualified Lead', color: '#6B7280', bg: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400' },
  { value: 'non_responsive', label: 'Non-Responsive', color: '#EAB308', bg: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' },
] as const

export type LeadStatus = typeof LEAD_STATUSES[number]['value']

export function getLeadStatusConfig(status: string | null) {
  return LEAD_STATUSES.find((s) => s.value === status) ?? null
}

// ── Call status badge ────────────────────────────────────────────────────────

function CallStatusBadge({ status }: { status: string | null }) {
  if (!status) return null
  const map: Record<string, string> = {
    'Scheduled':   'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    'Showed Up':   'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    'No show':     'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    'No Show':     'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    'Cancelled':   'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
    'Rescheduled': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  }
  return (
    <span className={cn('inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold', map[status] ?? 'bg-zinc-100 text-zinc-500')}>
      {status}
    </span>
  )
}

// ── Modal ────────────────────────────────────────────────────────────────────

interface PipelineContactModalProps {
  email: string
  onClose: () => void
  onUpdated: () => void
}

export function PipelineContactModal({ email, onClose, onUpdated }: PipelineContactModalProps) {
  const { profile } = useProfile()
  const { names: setterNames, loading: settersLoading } = useTeamMembers('setter')
  const isAdmin = profile?.role === 'admin'
  const isSetter = profile?.role === 'setter'
  const canEdit = isAdmin || isSetter

  const [contact, setContact] = useState<ContactDetail | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [calls, setCalls] = useState<CallRecord[]>([])
  const [spcMember, setSpcMember] = useState<SpcMemberInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Editable notes state
  const [editNotes, setEditNotes] = useState('')
  const [notesDirty, setNotesDirty] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)

  // Last contacted state
  const [savingContacted, setSavingContacted] = useState(false)

  // Determine this setter's identity for permission display
  const mySetterName = profile?.setter_name || profile?.full_name || ''

  const loadContact = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/contacts/pipeline/detail?email=${encodeURIComponent(email)}`)
      const json = await res.json()
      if (json.error) {
        toast.error(json.error)
        onClose()
      } else {
        setContact(json.contact)
        setTransactions(json.transactions ?? [])
        setCalls(json.calls ?? [])
        setSpcMember(json.spc_member ?? null)
        setEditNotes(json.contact?.notes ?? '')
        setNotesDirty(false)
      }
    } catch {
      toast.error('Failed to load contact')
      onClose()
    } finally {
      setLoading(false)
    }
  }, [email, onClose])

  useEffect(() => { loadContact() }, [loadContact])

  async function handleUpdate(field: 'setter_assigned' | 'lead_status', value: string | null) {
    if (!contact) return
    setSaving(true)
    try {
      const res = await fetch('/api/contacts/pipeline/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: contact.buyer_email, [field]: value }),
      })
      const json = await res.json()
      if (json.error) {
        toast.error(json.error)
      } else {
        setContact((prev) => prev ? { ...prev, [field]: value } : prev)
        onUpdated()
        toast.success(field === 'setter_assigned' ? 'Setter updated' : 'Lead status updated')
      }
    } catch {
      toast.error('Update failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveNotes() {
    if (!contact) return
    setSavingNotes(true)
    try {
      const res = await fetch('/api/contacts/pipeline/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: contact.buyer_email, notes: editNotes || null }),
      })
      const json = await res.json()
      if (json.error) {
        toast.error(json.error)
      } else {
        setContact((prev) => prev ? { ...prev, notes: editNotes || null } : prev)
        setNotesDirty(false)
        toast.success('Notes saved')
      }
    } catch {
      toast.error('Failed to save notes')
    } finally {
      setSavingNotes(false)
    }
  }

  async function handleMarkContacted(dateOverride?: string) {
    if (!contact) return
    setSavingContacted(true)
    const ts = dateOverride || new Date().toISOString()
    try {
      const res = await fetch('/api/contacts/pipeline/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: contact.buyer_email, last_contacted_at: ts }),
      })
      const json = await res.json()
      if (json.error) {
        toast.error(json.error)
      } else {
        setContact((prev) => prev ? { ...prev, last_contacted_at: ts } : prev)
        onUpdated()
        toast.success('Last contacted date updated')
      }
    } catch {
      toast.error('Update failed')
    } finally {
      setSavingContacted(false)
    }
  }

  // Permission: setter can only edit contacts assigned to them or unassigned
  const canEditThisContact = isAdmin || (isSetter && (!contact?.setter_assigned || contact.setter_assigned === mySetterName))

  // Phone from transactions
  const phone = transactions.find((t) => t.buyer_phone)?.buyer_phone ?? null

  const sectionLabel = 'text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3'
  const rowLabel = 'text-xs text-zinc-500 dark:text-zinc-400'
  const rowValue = 'text-xs font-medium text-zinc-800 dark:text-zinc-200 text-right'
  const inputCls = 'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30 focus:border-[#ffbd59] disabled:opacity-50'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto border border-zinc-200 dark:border-zinc-700 w-full max-w-2xl">
        {/* Close button */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800">
          <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Contact Detail</span>
          <button onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : contact ? (
            <div className="space-y-6">
              {/* ─── Header (mirrors student modal style) ─── */}
              <div className="flex items-start gap-4 -mt-1">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold text-white shrink-0"
                  style={{ backgroundColor: STAGE_COLORS[(contact.current_stage as PipelineTier) || 1] }}
                >
                  {getInitials(contact.buyer_name || contact.buyer_email)}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
                    {contact.buyer_name || '—'}
                  </h2>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-zinc-400">
                      <Mail className="h-3 w-3" />{contact.buyer_email}
                    </span>
                    {phone && (
                      <span className="flex items-center gap-1 text-xs text-zinc-400">
                        <Phone className="h-3 w-3" />{phone}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {/* Pipeline stage badge */}
                    <span
                      className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={{
                        backgroundColor: `${STAGE_COLORS[(contact.current_stage as PipelineTier) || 1]}20`,
                        color: STAGE_COLORS[(contact.current_stage as PipelineTier) || 1],
                      }}
                    >
                      Stage {contact.current_stage}: {STAGE_LABELS[(contact.current_stage as PipelineTier) || 1]}
                    </span>
                    {/* Lead status badge */}
                    {contact.lead_status && (() => {
                      const cfg = getLeadStatusConfig(contact.lead_status)
                      return cfg ? (
                        <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-semibold', cfg.bg)}>
                          {cfg.label}
                        </span>
                      ) : null
                    })()}
                    {contact.manual_override && (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                        Manual Override
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ─── Setter Assignment ─── */}
              <div>
                <p className={sectionLabel}>Setter Assignment</p>
                {canEdit && canEditThisContact ? (
                  <select
                    value={contact.setter_assigned || ''}
                    onChange={(e) => handleUpdate('setter_assigned', e.target.value || null)}
                    disabled={saving || settersLoading}
                    className={inputCls}
                  >
                    <option value="">Unassigned</option>
                    {setterNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                    <User className="h-4 w-4 text-zinc-400" />
                    {contact.setter_assigned || <span className="text-zinc-400 italic">Unassigned</span>}
                  </div>
                )}
              </div>

              {/* ─── Lead Status ─── */}
              <div>
                <p className={sectionLabel}>Lead Status</p>
                {canEdit && canEditThisContact ? (
                  <div className="flex flex-wrap gap-2">
                    {LEAD_STATUSES.map((ls) => {
                      const isActive = contact.lead_status === ls.value
                      return (
                        <button
                          key={ls.value}
                          onClick={() => handleUpdate('lead_status', isActive ? null : ls.value)}
                          disabled={saving}
                          className={cn(
                            'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50',
                            isActive
                              ? ls.bg + ' border-transparent'
                              : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800',
                          )}
                        >
                          {ls.label}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-zinc-700 dark:text-zinc-300">
                    {(() => {
                      const cfg = getLeadStatusConfig(contact.lead_status)
                      return cfg ? (
                        <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-semibold', cfg.bg)}>
                          {cfg.label}
                        </span>
                      ) : (
                        <span className="text-zinc-400 italic">Not classified</span>
                      )
                    })()}
                  </div>
                )}
              </div>

              {/* ─── Last Contacted ─── */}
              <div>
                <p className={sectionLabel}>Last Contacted</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">
                    {contact.last_contacted_at ? formatDate(contact.last_contacted_at) : <span className="text-zinc-400 italic">Never</span>}
                  </span>
                  {canEdit && canEditThisContact && (
                    <>
                      <button
                        onClick={() => handleMarkContacted()}
                        disabled={savingContacted}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                      >
                        <CalendarCheck className="h-3 w-3" />
                        {savingContacted ? 'Saving…' : 'Mark as contacted today'}
                      </button>
                      <input
                        type="date"
                        className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30 focus:border-[#ffbd59]"
                        title="Backdate last contacted"
                        onChange={(e) => {
                          if (e.target.value) {
                            handleMarkContacted(new Date(e.target.value + 'T12:00:00').toISOString())
                          }
                        }}
                      />
                    </>
                  )}
                </div>
              </div>

              {/* ─── Setter Notes ─── */}
              <div>
                <p className={sectionLabel}>Setter Notes</p>
                {canEdit && canEditThisContact ? (
                  <div className="space-y-2">
                    <textarea
                      value={editNotes}
                      onChange={(e) => { setEditNotes(e.target.value); setNotesDirty(true) }}
                      rows={3}
                      placeholder="Add notes about this contact…"
                      className={cn(inputCls, 'resize-y min-h-[60px]')}
                    />
                    {notesDirty && (
                      <button
                        onClick={handleSaveNotes}
                        disabled={savingNotes}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        <Save className="h-3 w-3" />
                        {savingNotes ? 'Saving…' : 'Save Notes'}
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                    {contact.notes || <span className="text-zinc-400 italic">No notes</span>}
                  </p>
                )}
              </div>

              {/* ─── Key Details ─── */}
              <div>
                <p className={sectionLabel}>Details</p>
                <div className="space-y-2">
                  {contact.product_proposed && (
                    <div className="flex justify-between">
                      <span className={rowLabel}>Product Proposed</span>
                      <span className={rowValue}>{contact.product_proposed}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className={rowLabel}>Added</span>
                    <span className={rowValue}>{formatDate(contact.created_at)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={rowLabel}>Updated</span>
                    <span className={rowValue}>{formatDate(contact.updated_at)}</span>
                  </div>
                </div>
              </div>

              {/* ─── Call History ─── */}
              <div>
                <p className={sectionLabel}>
                  <span className="inline-flex items-center gap-1.5">
                    <PhoneCall className="h-3.5 w-3.5" />
                    Call History ({calls.length})
                  </span>
                </p>
                {calls.length === 0 ? (
                  <p className="text-xs text-zinc-400 italic">No calls found</p>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {calls.map((call) => (
                      <div
                        key={call.id}
                        className="px-3 py-2 rounded-lg border border-zinc-100 dark:border-zinc-800 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                                {formatDate(call.start_date)}
                              </span>
                              <CallStatusBadge status={call.call_status || call.status} />
                              {call.call_type && (
                                <span className="text-zinc-400">{call.call_type}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-zinc-400">
                              {call.setter_name && <span>Setter: {call.setter_name}</span>}
                              {call.closer_name && <span>Closer: {call.closer_name}</span>}
                            </div>
                          </div>
                        </div>
                        {call.call_summary && (
                          <p className="mt-1.5 text-zinc-500 dark:text-zinc-400 whitespace-pre-wrap">{call.call_summary}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ─── SPC Membership ─── */}
              {spcMember && (
                <div>
                  <p className={sectionLabel}>SPC Membership</p>
                  <div className="px-3 py-2.5 rounded-lg border border-purple-200 dark:border-purple-800/50 bg-purple-50/50 dark:bg-purple-900/10 text-xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-zinc-800 dark:text-zinc-200">Secure Parent Collective</p>
                        <p className="text-zinc-400 mt-0.5">
                          {spcMember.plan} · {spcMember.provider} · Since {formatDate(spcMember.joined_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn(
                          'inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold capitalize',
                          spcMember.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
                          spcMember.status === 'trial' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                          spcMember.status === 'cancelled' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
                          'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
                        )}>
                          {spcMember.status}
                        </span>
                        {spcMember.amount > 0 && (
                          <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                            ${spcMember.amount}/mo
                          </span>
                        )}
                      </div>
                    </div>
                    {spcMember.status === 'trial' && spcMember.trial_end_date && (
                      <p className="text-zinc-400 mt-1">Trial ends: {formatDate(spcMember.trial_end_date)}</p>
                    )}
                    {spcMember.next_payment_date && spcMember.status === 'active' && (
                      <p className="text-zinc-400 mt-1">Next payment: {formatDate(spcMember.next_payment_date)}</p>
                    )}
                  </div>
                </div>
              )}

              {/* ─── Products Purchased (Transaction History) ─── */}
              <div>
                <p className={sectionLabel}>Products Purchased ({transactions.length})</p>
                {transactions.length === 0 ? (
                  <p className="text-xs text-zinc-400 italic">No transactions found</p>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {transactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between px-3 py-2 rounded-lg border border-zinc-100 dark:border-zinc-800 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-zinc-800 dark:text-zinc-200 truncate">{tx.offer_title}</p>
                          <p className="text-zinc-400 mt-0.5">{formatDate(tx.date)} · {tx.source}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <span className={cn(
                            'inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold capitalize',
                            tx.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
                            tx.status === 'refunded' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
                            'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
                          )}>
                            {tx.status}
                          </span>
                          <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                            ${tx.cost?.toLocaleString()} {tx.currency}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(str: string): string {
  return str
    .split(/[\s@]/)
    .slice(0, 2)
    .map((w) => (w[0] || '').toUpperCase())
    .join('')
}
