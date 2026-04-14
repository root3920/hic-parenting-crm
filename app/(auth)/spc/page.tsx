'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { KPICard } from '@/components/shared/KPICard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DonutChart } from '@/components/charts/DonutChart'
import { RevenueBarChart } from '@/components/charts/RevenueBarChart'
import { EmptyState } from '@/components/shared/EmptyState'
import { StatusPill } from '@/components/shared/StatusPill'
import { formatCurrency, formatDate, daysUntil } from '@/lib/utils'
import { SpcMember } from '@/types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
} from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { PageTransition } from '@/components/motion/PageTransition'
import { KPICardGrid } from '@/components/motion/KPICardGrid'
import { AnimatedTableRow, rowVariants } from '@/components/motion/AnimatedTableRow'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  Legend,
} from 'recharts'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { formatDistanceToNow } from 'date-fns'
import { useProfile } from '@/hooks/useProfile'

export const dynamic = 'force-dynamic'

const BASELINE = {
  date: 'Mar 27, 2026',
  totalMembers: 35,
  monthlyMembers: 20,
  annualMembers: 15,
  mrr: 1527.50,
  mrrMonthly: 940,
  mrrAnnual: 587.50,
  arr: 18330.00,
}

interface SpcCancellation {
  id: string
  name: string
  email: string
  source: string
  cancelled_at: string
  subscribed_at: string
  amount: number
  plan: 'monthly' | 'annual'
  cancel_type: 'paid_cancel' | 'pending_cancel' | 'trial_cancel'
  created_at: string
}

interface SpcMemberNote {
  id: string
  member_id: string
  note: string
  created_by: string
  created_at: string
}

type SelectedMember =
  | { kind: 'member'; data: SpcMember }
  | { kind: 'cancellation'; data: SpcCancellation }

type Tab = 'growth' | 'overview' | 'active' | 'trials' | 'cancellations'

const chartVariants = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, delay: 0.2, ease: 'easeOut' as const } },
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function daysActive(subscribedAt: string, cancelledAt: string): number {
  return Math.max(
    0,
    Math.floor(
      (new Date(cancelledAt).getTime() - new Date(subscribedAt).getTime()) /
        (1000 * 60 * 60 * 24)
    )
  )
}

function noteAgeCls(createdAt: string) {
  const diff = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
  if (diff < 3) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
  if (diff < 7) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
  return 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
}

function MemberProfileModal({
  selected,
  notes,
  noteText,
  addingNote,
  onNoteChange,
  onAddNote,
}: {
  selected: SelectedMember
  notes: SpcMemberNote[]
  noteText: string
  addingNote: boolean
  onNoteChange: (v: string) => void
  onAddNote: () => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const name = selected.data.name
  const email = selected.data.email
  const plan = selected.data.plan
  const amount = selected.data.amount
  const provider = selected.kind === 'member' ? selected.data.provider : selected.data.source

  let statusLabel = ''
  let statusCls = ''
  if (selected.kind === 'member') {
    if (selected.data.status === 'active') { statusLabel = 'Active'; statusCls = 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' }
    else { statusLabel = 'Trial'; statusCls = 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' }
  } else {
    if (selected.data.cancel_type === 'paid_cancel') { statusLabel = 'Cancelled'; statusCls = 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' }
    else if (selected.data.cancel_type === 'pending_cancel') { statusLabel = 'Pending Cancel'; statusCls = 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' }
    else { statusLabel = 'Trial Cancelled'; statusCls = 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400' }
  }

  let trialStart: string | null = null
  let expiresDate: string | null = null
  let daysLeft: number | null = null
  let memberSince: string | null = null
  let nextPayment: string | null = null

  if (selected.kind === 'member') {
    const m = selected.data
    memberSince = m.joined_at
    nextPayment = m.next_payment_date ?? null
    if (m.status === 'trial') {
      trialStart = m.joined_at
      expiresDate = m.trial_end_date ?? null
      daysLeft = m.trial_end_date ? daysUntil(m.trial_end_date) : null
    }
  } else {
    const c = selected.data
    trialStart = c.subscribed_at
    expiresDate = c.cancelled_at
    memberSince = c.subscribed_at
  }

  return (
    <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto p-0">
      {/* Header */}
      <div className="flex items-start gap-4 p-6 border-b border-zinc-100 dark:border-zinc-800">
        <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center justify-center text-lg font-bold shrink-0">
          {getInitials(name)}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 leading-tight">{name}</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">{email}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-semibold', statusCls)}>
              {statusLabel}
            </span>
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {provider}
            </span>
            {plan && (
              <span className={cn(
                'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                plan === 'annual' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
              )}>
                {plan === 'annual' ? 'Annual' : 'Monthly'} · {formatCurrency(amount)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-zinc-100 dark:divide-zinc-800">
        {/* LEFT: Member Info */}
        <div className="p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-3">Member Info</p>
          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4 space-y-2.5">
            {trialStart && (
              <div className="flex justify-between">
                <span className="text-xs text-zinc-500">
                  {selected.kind === 'member' && selected.data.status === 'trial' ? 'Trial Start' : 'Subscribed'}
                </span>
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{formatDate(trialStart)}</span>
              </div>
            )}
            {expiresDate && (
              <div className="flex justify-between">
                <span className="text-xs text-zinc-500">
                  {selected.kind === 'cancellation' ? 'Cancelled / Access Until' : 'Expires'}
                </span>
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{formatDate(expiresDate)}</span>
              </div>
            )}
            {daysLeft !== null && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-500">Days Left</span>
                <span className={cn(
                  'inline-flex px-2 py-0.5 rounded-full text-xs font-bold',
                  daysLeft < 0 ? 'bg-red-100 text-red-700' :
                  daysLeft <= 7 ? 'bg-orange-100 text-orange-700' :
                  'bg-green-100 text-green-700'
                )}>
                  {daysLeft < 0 ? 'Expired' : `${daysLeft}d left`}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-xs text-zinc-500">Payment Method</span>
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{provider}</span>
            </div>
            {memberSince && (
              <div className="flex justify-between">
                <span className="text-xs text-zinc-500">Member since</span>
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{formatDate(memberSince)}</span>
              </div>
            )}
            {nextPayment && (
              <div className="flex justify-between">
                <span className="text-xs text-zinc-500">Next Payment</span>
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{formatDate(nextPayment)}</span>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Contact Notes */}
        <div className="p-5 flex flex-col">
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-3">Contact Notes</p>

          {/* Timeline */}
          <div className="flex-1 space-y-2 mb-3 max-h-56 overflow-y-auto pr-1">
            {notes.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-6">No notes yet</p>
            ) : (
              notes.map((n) => (
                <div key={n.id} className="rounded-lg border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-snug">{n.note}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={cn('inline-flex px-1.5 py-0.5 rounded text-xs font-medium', noteAgeCls(n.created_at))}>
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </span>
                    <span className="text-xs text-zinc-400">{n.created_by}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add note */}
          <div className="mt-auto">
            <textarea
              ref={textareaRef}
              value={noteText}
              onChange={(e) => onNoteChange(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault()
                  onAddNote()
                }
              }}
              placeholder="Add a contact note... (⌘+Enter to save)"
              rows={3}
              className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none mb-2"
            />
            <button
              onClick={onAddNote}
              disabled={!noteText.trim() || addingNote}
              className="w-full py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#185FA5' }}
            >
              {addingNote ? 'Saving...' : 'Add Note'}
            </button>
          </div>
        </div>
      </div>
    </DialogContent>
  )
}

export default function SpcPage() {
  const supabase = useMemo(() => createClient(), [])
  const [members, setMembers] = useState<SpcMember[]>([])
  const [cancellations, setCancellations] = useState<SpcCancellation[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('growth')

  // Modal state
  const { profile } = useProfile()
  const [selectedMember, setSelectedMember] = useState<SelectedMember | null>(null)
  const [notes, setNotes] = useState<SpcMemberNote[]>([])
  const [noteText, setNoteText] = useState('')
  const [addingNote, setAddingNote] = useState(false)

  const fetchNotes = useCallback(async (memberId: string) => {
    const { data } = await supabase
      .from('spc_member_notes')
      .select('*')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false })
    setNotes(data ?? [])
  }, [supabase])

  function openModal(member: SelectedMember) {
    setSelectedMember(member)
    setNoteText('')
    const email = member.data.email
    if (email) fetchNotes(email)
    else setNotes([])
  }

  async function handleAddNote() {
    if (!noteText.trim() || !selectedMember) return
    const memberId = selectedMember.data.email
    if (!memberId) return
    setAddingNote(true)
    const { error } = await supabase.from('spc_member_notes').insert({
      member_id: memberId,
      note: noteText.trim(),
      created_by: profile?.full_name ?? 'Unknown',
    })
    setAddingNote(false)
    if (!error) {
      setNoteText('')
      fetchNotes(memberId)
    }
  }

  useEffect(() => {
    async function fetchData() {
      const [membersResult, cancelsResult] = await Promise.all([
        supabase.from('spc_members').select('*').order('joined_at', { ascending: false }),
        supabase
          .from('spc_cancellations')
          .select('*')
          .order('cancelled_at', { ascending: false }),
      ])
      setMembers(membersResult.data ?? [])
      setCancellations(cancelsResult.data ?? [])
      setLoading(false)
    }
    fetchData()
  }, [])

  // ── Date anchors ─────────────────────────────────────────────────────────
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10)

  // ── Members ───────────────────────────────────────────────────────────────
  const activeMembers = members.filter((m) => m.status === 'active')
  const trialMembers = members.filter((m) => m.status === 'trial')

  const mrr = activeMembers.reduce(
    (s, m) => s + (m.plan === 'annual' ? m.amount / 12 : m.amount),
    0
  )
  const arr = mrr * 12
  const mrrPotential = trialMembers.reduce(
    (s, m) => s + (m.plan === 'annual' ? m.amount / 12 : m.amount),
    0
  )

  const monthlyCount = activeMembers.filter((m) => m.plan === 'monthly').length
  const annualCount = activeMembers.filter((m) => m.plan === 'annual').length

  const compositionData = [
    { name: 'Monthly', value: monthlyCount, color: '#185FA5' },
    { name: 'Annual', value: annualCount, color: '#3B6D11' },
  ].filter((d) => d.value > 0)

  const cohortMap: Record<string, number> = {}
  members.forEach((m) => {
    const month = m.joined_at?.slice(0, 7) ?? 'Unknown'
    cohortMap[month] = (cohortMap[month] ?? 0) + 1
  })
  const cohortData = Object.entries(cohortMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, revenue]) => ({ label: date, revenue }))

  const urgentTrials = trialMembers
    .filter((m) => m.trial_end_date && daysUntil(m.trial_end_date) <= 14)
    .sort((a, b) => daysUntil(a.trial_end_date!) - daysUntil(b.trial_end_date!))

  const sortedTrials = [...trialMembers].sort((a, b) => {
    const da = a.trial_end_date ? daysUntil(a.trial_end_date) : 9999
    const db = b.trial_end_date ? daysUntil(b.trial_end_date) : 9999
    return da - db
  })

  // ── Cancellation metrics ─────────────────────────────────────────────────
  const paidCancels = cancellations.filter((c) => c.cancel_type === 'paid_cancel')
  const pendingCancels = cancellations.filter((c) => c.cancel_type === 'pending_cancel')
  const trialCancels = cancellations.filter((c) => c.cancel_type === 'trial_cancel')
  const thisMonthCancels = paidCancels.filter(
    (c) => (c.cancelled_at?.slice(0, 10) ?? '') >= firstOfMonth
  )

  const mrrLost = paidCancels
    .filter((c) => (c.cancelled_at?.slice(0, 10) ?? '') >= sixtyDaysAgo)
    .reduce((s, c) => s + (c.plan === 'annual' ? c.amount / 12 : c.amount), 0)

  const cancels30d = paidCancels.filter(
    (c) => (c.cancelled_at?.slice(0, 10) ?? '') >= thirtyDaysAgo
  ).length
  const churnRate =
    activeMembers.length > 0
      ? parseFloat(((cancels30d / activeMembers.length) * 100).toFixed(1))
      : 0

  const churnColor =
    churnRate < 3
      ? 'text-green-600'
      : churnRate <= 6
      ? 'text-amber-600'
      : 'text-red-600'
  const churnBadgeClass =
    churnRate < 3
      ? 'bg-green-100 text-green-700'
      : churnRate <= 6
      ? 'bg-amber-100 text-amber-700'
      : 'bg-red-100 text-red-700'

  // Last 6 months for cancellations chart
  const last6Months: string[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    last6Months.push(d.toISOString().slice(0, 7))
  }
  const cancelsByMonth = last6Months.map((month) => ({
    date: month.slice(5), // "MM" for display
    revenue: cancellations.filter((c) => c.cancelled_at?.slice(0, 7) === month).length,
  }))

  // ── Growth tab calculations (baseline hardcoded from Mar 27 snapshot) ────
  const mrrNowMonthly = activeMembers
    .filter((m) => m.plan === 'monthly')
    .reduce((s, m) => s + m.amount, 0)
  const mrrNowAnnual = activeMembers
    .filter((m) => m.plan === 'annual')
    .reduce((s, m) => s + m.amount / 12, 0)

  const newSpcMembers = [...activeMembers].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  )

  const deltaMembersCount = activeMembers.length - BASELINE.totalMembers
  const deltaMembersPct = parseFloat(
    ((deltaMembersCount / BASELINE.totalMembers) * 100).toFixed(1)
  )
  const deltaMrr = mrr - BASELINE.mrr
  const deltaMrrPct = parseFloat(((deltaMrr / BASELINE.mrr) * 100).toFixed(1))
  const deltaArr = arr - BASELINE.arr

  const progressMax = Math.max(monthlyCount, BASELINE.monthlyMembers, 1)

  const mrrChartData = [
    {
      label: 'Before (Mar 27)',
      monthly: BASELINE.mrrMonthly,
      annual: BASELINE.mrrAnnual,
      total: BASELINE.mrr,
    },
    {
      label: 'Now',
      monthly: parseFloat(mrrNowMonthly.toFixed(2)),
      annual: parseFloat(mrrNowAnnual.toFixed(2)),
      total: parseFloat((mrrNowMonthly + mrrNowAnnual).toFixed(2)),
    },
  ]
  // ────────────────────────────────────────────────────────────────────────

  function trialUrgencyPill(m: SpcMember) {
    if (!m.trial_end_date) return <StatusPill label="No end date" variant="neutral" />
    const days = daysUntil(m.trial_end_date)
    if (days < 0) return <StatusPill label="Expired" variant="danger" />
    if (days <= 7) return <StatusPill label={`${days}d left`} variant="danger" />
    if (days <= 14) return <StatusPill label={`${days}d left`} variant="warning" />
    if (days <= 21) return <StatusPill label={`${days}d left`} variant="info" />
    return <StatusPill label={`${days}d left`} variant="neutral" />
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'growth', label: 'Growth' },
    { key: 'overview', label: 'Overview' },
    { key: 'active', label: `Active Members${!loading ? ` (${activeMembers.length})` : ''}` },
    { key: 'trials', label: `Free Trials${!loading ? ` (${trialMembers.length})` : ''}` },
    { key: 'cancellations', label: `Cancellations${!loading ? ` (${paidCancels.length + pendingCancels.length})` : ''}` },
  ]

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto">
        <PageHeader title="Secure Parent Collective" description="Subscription members and free trials" />

        {/* Tab bar */}
        <div className="border-b border-zinc-200 dark:border-zinc-800 mb-6">
          <nav className="flex items-end gap-0 -mb-px">
            {tabs.map(({ key, label }) => {
              const isActive = activeTab === key
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={cn(
                    'relative px-4 h-10 text-sm font-medium whitespace-nowrap',
                    isActive
                      ? 'text-[#185FA5] font-semibold'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                  )}
                >
                  {label}
                  {isActive && (
                    <motion.span
                      layoutId="spc-tab-underline"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#185FA5]"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                </button>
              )
            })}
          </nav>
        </div>

        {/* ── CRECIMIENTO ───────────────────────────────────────────────── */}
        {activeTab === 'growth' && (
          <div className="space-y-6">
            {/* 1. KPI Comparison Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Members */}
              <Card>
                <CardContent className="pt-5 pb-4">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 font-medium uppercase tracking-wide">
                    Total Members
                  </p>
                  {loading ? (
                    <div className="h-12 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                  ) : (
                    <>
                      <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-sm text-muted-foreground">{BASELINE.totalMembers}</span>
                        <span className="text-sm text-zinc-400">→</span>
                        <span className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                          {activeMembers.length}
                        </span>
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-medium">
                        +{deltaMembersCount} new · ↑{deltaMembersPct}%
                      </span>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* MRR */}
              <Card>
                <CardContent className="pt-5 pb-4">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 font-medium uppercase tracking-wide">
                    MRR
                  </p>
                  {loading ? (
                    <div className="h-12 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                  ) : (
                    <>
                      <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-sm text-muted-foreground">{formatCurrency(BASELINE.mrr)}</span>
                        <span className="text-sm text-zinc-400">→</span>
                        <span className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                          {formatCurrency(mrr)}
                        </span>
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-medium">
                        +{formatCurrency(deltaMrr)}/mo · ↑{deltaMrrPct}%
                      </span>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* ARR Proyectado */}
              <Card>
                <CardContent className="pt-5 pb-4">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 font-medium uppercase tracking-wide">
                    ARR Proyectado
                  </p>
                  {loading ? (
                    <div className="h-12 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                  ) : (
                    <>
                      <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-sm text-muted-foreground">{formatCurrency(BASELINE.arr)}</span>
                        <span className="text-sm text-zinc-400">→</span>
                        <span className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                          {formatCurrency(arr)}
                        </span>
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-medium">
                        +{formatCurrency(deltaArr)}/año
                      </span>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Churn — live from database */}
              <Card>
                <CardContent className="pt-5 pb-4">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 font-medium uppercase tracking-wide">
                    Churn
                  </p>
                  {loading ? (
                    <div className="h-12 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                  ) : (
                    <>
                      <div className="flex items-baseline gap-2 mb-2">
                        <span className={`text-2xl font-semibold ${churnColor}`}>
                          {churnRate}%
                        </span>
                        <span className="text-sm text-zinc-400">monthly</span>
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${churnBadgeClass}`}>
                        {thisMonthCancels.length} cancellations this month
                      </span>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* 2. Two column section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Left: Mensuales vs Anuales */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Monthly vs Annual</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {loading ? (
                    <div className="space-y-4">
                      <div className="h-8 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                      <div className="h-8 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                    </div>
                  ) : (
                    <>
                      {/* Monthly */}
                      <div>
                        <div className="flex items-center justify-between text-sm mb-2">
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">Monthly</span>
                          <span className="text-zinc-600 dark:text-zinc-400 font-medium">
                            {BASELINE.monthlyMembers} → {monthlyCount}{' '}
                            <span className="text-green-600 font-semibold">
                              (+{monthlyCount - BASELINE.monthlyMembers})
                            </span>
                          </span>
                        </div>
                        <div className="h-2.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ backgroundColor: '#185FA5' }}
                            initial={{ width: 0 }}
                            animate={{ width: `${(monthlyCount / progressMax) * 100}%` }}
                            transition={{ duration: 0.7, ease: 'easeOut' }}
                          />
                        </div>
                      </div>

                      {/* Annual */}
                      <div>
                        <div className="flex items-center justify-between text-sm mb-2">
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">Annual</span>
                          <span className="text-zinc-600 dark:text-zinc-400 font-medium">
                            {BASELINE.annualMembers} → {annualCount}{' '}
                            <span className="text-zinc-500 font-normal">
                              {annualCount === BASELINE.annualMembers
                                ? '(no change)'
                                : `(+${annualCount - BASELINE.annualMembers})`}
                            </span>
                          </span>
                        </div>
                        <div className="h-2.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ backgroundColor: '#3B6D11' }}
                            initial={{ width: 0 }}
                            animate={{ width: `${(annualCount / progressMax) * 100}%` }}
                            transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
                          />
                        </div>
                      </div>

                      <p className="text-xs text-zinc-500 dark:text-zinc-400 italic">
                        All growth came from monthly plans
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Right: MRR Antes vs Ahora stacked bar */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">MRR Before vs Now</CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="h-52 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={mrrChartData} margin={{ top: 28, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11, fill: '#71717a' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: '#71717a' }}
                          axisLine={false}
                          tickLine={false}
                          width={48}
                          tickFormatter={(v) => `$${v}`}
                        />
                        <Tooltip
                          formatter={(val, name) => [
                            `$${Number(val).toFixed(2)}`,
                            name === 'monthly' ? 'Monthly' : 'Annual (prorated)',
                          ]}
                          cursor={{ fill: '#f4f4f5' }}
                        />
                        <Legend
                          iconType="circle"
                          iconSize={8}
                          formatter={(value) => (
                            <span className="text-xs text-zinc-600 dark:text-zinc-400">
                              {value === 'monthly' ? 'Monthly' : 'Annual (prorated)'}
                            </span>
                          )}
                        />
                        <Bar dataKey="monthly" name="monthly" stackId="a" fill="#185FA5" maxBarSize={72} />
                        <Bar dataKey="annual" name="annual" stackId="a" fill="#3B6D11" maxBarSize={72}>
                          <LabelList
                            dataKey="total"
                            position="top"
                            formatter={(v: unknown) => `$${Math.round(Number(v))}`}
                            style={{ fontSize: 11, fill: '#374151', fontWeight: 600 }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* 3. New Members List */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">
                  New active members
                  {!loading && (
                    <span className="ml-2 text-xs font-normal text-zinc-500">
                      ({newSpcMembers.length} desde Mar 27)
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-6 space-y-3">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="h-10 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                    ))}
                  </div>
                ) : newSpcMembers.length === 0 ? (
                  <EmptyState title="No new members" description="Members who join after Mar 27 will appear here." />
                ) : (
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {newSpcMembers.map((m, i) => (
                      <motion.div
                        key={m.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: i * 0.05, ease: 'easeOut' }}
                        className="flex items-center gap-3 px-5 py-3"
                      >
                        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold">
                          {getInitials(m.name)}
                        </div>
                        <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100 flex-1 min-w-0 truncate">
                          {m.name}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 font-medium whitespace-nowrap">
                          Monthly ${m.amount}
                        </span>
                        <span className="text-xs text-zinc-400 whitespace-nowrap hidden sm:block">
                          {formatDate(m.created_at)}
                        </span>
                        <span className="text-xs text-zinc-400 whitespace-nowrap hidden md:block text-right min-w-14">
                          {m.provider}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <div>
            <KPICardGrid className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
              <KPICard title="MRR" value={formatCurrency(mrr)} subtitle="monthly recurring" loading={loading} />
              <KPICard title="ARR" value={formatCurrency(arr)} subtitle="annual recurring" loading={loading} />
              <KPICard title="Active Members" value={activeMembers.length} loading={loading} />
              <KPICard title="Free Trials" value={trialMembers.length} subtitle={`${formatCurrency(mrrPotential)}/mo potential`} loading={loading} />
            </KPICardGrid>

            {!loading && urgentTrials.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' as const }}
              >
                <Alert className="mb-6 border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-700">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <AlertDescription className="text-amber-800 dark:text-amber-300 text-xs">
                    <span className="font-semibold">{urgentTrials.length} trial{urgentTrials.length > 1 ? 's' : ''} expiring within 14 days: </span>
                    {urgentTrials.map((m, i) => (
                      <span key={m.id}>
                        {m.name} ({m.trial_end_date ? `${daysUntil(m.trial_end_date)}d` : '—'}){i < urgentTrials.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </AlertDescription>
                </Alert>
              </motion.div>
            )}

            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 mb-6">
              <motion.div variants={chartVariants} initial="hidden" animate="visible">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">Membership Composition</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <div className="h-52 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
                    ) : compositionData.length === 0 ? (
                      <EmptyState title="No active members" />
                    ) : (
                      <DonutChart data={compositionData} />
                    )}
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div variants={chartVariants} initial="hidden" animate="visible" transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' as const }}>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">Members by Join Month</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <div className="h-52 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
                    ) : cohortData.length === 0 ? (
                      <EmptyState title="No data" />
                    ) : (
                      <RevenueBarChart data={cohortData} color="#185FA5" />
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Revenue Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                  {[
                    { label: 'Active MRR', value: formatCurrency(mrr) },
                    { label: 'Trial MRR Potential', value: formatCurrency(mrrPotential) },
                    { label: 'Total Potential MRR', value: formatCurrency(mrr + mrrPotential) },
                  ].map(({ label, value }) => (
                    <div key={label} className="text-center">
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{label}</p>
                      <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ACTIVE MEMBERS */}
        {activeTab === 'active' && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{activeMembers.length} Active Members</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-2">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-10 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                  ))}
                </div>
              ) : activeMembers.length === 0 ? (
                <EmptyState title="No active members" description="Active subscribers will appear here." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <AnimatedTableRow variants={rowVariants} initial="hidden" animate="visible" custom={0}>
                        <TableHead>Name</TableHead>
                        <TableHead className="hidden md:table-cell">Email</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="hidden md:table-cell">Provider</TableHead>
                        <TableHead className="hidden md:table-cell">Joined</TableHead>
                        <TableHead className="hidden md:table-cell">Next Payment</TableHead>
                      </AnimatedTableRow>
                    </TableHeader>
                    <TableBody>
                      {activeMembers.map((m, i) => (
                        <AnimatedTableRow
                          key={m.id}
                          variants={rowVariants}
                          initial="hidden"
                          animate="visible"
                          custom={i}
                          className={cn(
                            i % 2 === 0 ? 'bg-white dark:bg-zinc-900' : 'bg-zinc-50 dark:bg-zinc-800/50',
                            'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors'
                          )}
                          onClick={() => openModal({ kind: 'member', data: m })}
                        >
                          <TableCell className="font-medium text-sm">{m.name}</TableCell>
                          <TableCell className="text-xs text-zinc-500 hidden md:table-cell">{m.email}</TableCell>
                          <TableCell>
                            <StatusPill
                              label={m.plan === 'annual' ? 'Annual' : 'Monthly'}
                              variant={m.plan === 'annual' ? 'success' : 'info'}
                            />
                          </TableCell>
                          <TableCell className="text-right font-semibold text-sm whitespace-nowrap">
                            {formatCurrency(m.amount)}
                          </TableCell>
                          <TableCell className="text-xs text-zinc-500 hidden md:table-cell">{m.provider}</TableCell>
                          <TableCell className="text-xs text-zinc-500 whitespace-nowrap hidden md:table-cell">{formatDate(m.joined_at)}</TableCell>
                          <TableCell className="text-xs text-zinc-500 whitespace-nowrap hidden md:table-cell">{formatDate(m.next_payment_date)}</TableCell>
                        </AnimatedTableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* FREE TRIALS */}
        {activeTab === 'trials' && (
          <div>
            {!loading && urgentTrials.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' as const }}
              >
                <Alert className="mb-4 border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-700">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <AlertDescription className="text-amber-800 dark:text-amber-300 text-xs">
                    <span className="font-semibold">
                      {urgentTrials.length} trial{urgentTrials.length > 1 ? 's' : ''} expiring within 14 days.
                    </span>{' '}
                    Follow up to convert them!
                  </AlertDescription>
                </Alert>
              </motion.div>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">{trialMembers.length} Free Trials</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-6 space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-10 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                    ))}
                  </div>
                ) : trialMembers.length === 0 ? (
                  <EmptyState title="No free trials" description="Trial members will appear here." />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <AnimatedTableRow variants={rowVariants} initial="hidden" animate="visible" custom={0}>
                          <TableHead>Name</TableHead>
                          <TableHead className="hidden md:table-cell">Email</TableHead>
                          <TableHead className="hidden md:table-cell">Trial Start</TableHead>
                          <TableHead>Expires</TableHead>
                          <TableHead>Days Left</TableHead>
                          <TableHead className="hidden md:table-cell">Payment Method</TableHead>
                        </AnimatedTableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedTrials.map((m, i) => (
                          <AnimatedTableRow
                            key={m.id}
                            variants={rowVariants}
                            initial="hidden"
                            animate="visible"
                            custom={i}
                            className={cn(
                              i % 2 === 0 ? 'bg-white dark:bg-zinc-900' : 'bg-zinc-50 dark:bg-zinc-800/50',
                              'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors'
                            )}
                            onClick={() => openModal({ kind: 'member', data: m })}
                          >
                            <TableCell className="font-medium text-sm">{m.name}</TableCell>
                            <TableCell className="text-xs text-zinc-500 hidden md:table-cell">{m.email}</TableCell>
                            <TableCell className="text-xs text-zinc-500 whitespace-nowrap hidden md:table-cell">{formatDate(m.joined_at)}</TableCell>
                            <TableCell className="text-xs text-zinc-500 whitespace-nowrap">
                              {m.trial_end_date ? formatDate(m.trial_end_date) : '—'}
                            </TableCell>
                            <TableCell>{trialUrgencyPill(m)}</TableCell>
                            <TableCell className="text-xs text-zinc-500 hidden md:table-cell">{m.provider}</TableCell>
                          </AnimatedTableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── CANCELACIONES ─────────────────────────────────────────────── */}
        {activeTab === 'cancellations' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-5 pb-4">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 font-medium uppercase tracking-wide">
                    Paid cancellations
                  </p>
                  {loading ? (
                    <div className="h-10 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                  ) : (
                    <>
                      <p className="text-2xl font-semibold text-red-600 dark:text-red-400">
                        {paidCancels.length}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">lost paid subscriptions</p>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 pb-4">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 font-medium uppercase tracking-wide">
                    Pending cancellation
                  </p>
                  {loading ? (
                    <div className="h-10 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                  ) : (
                    <>
                      <p className="text-2xl font-semibold text-amber-600 dark:text-amber-400">
                        {pendingCancels.length}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">still have active access</p>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 pb-4">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 font-medium uppercase tracking-wide">
                    MRR lost
                  </p>
                  {loading ? (
                    <div className="h-10 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                  ) : (
                    <>
                      <p className="text-2xl font-semibold text-red-600">
                        {formatCurrency(mrrLost)}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">last 60 days</p>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 pb-4">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 font-medium uppercase tracking-wide">
                    Monthly churn
                  </p>
                  {loading ? (
                    <div className="h-10 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                  ) : (
                    <>
                      <p className={`text-2xl font-semibold ${churnColor}`}>
                        {churnRate}%
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">paid cancellations only</p>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Cancellations by month chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Cancellations by month</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-52 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={cancelsByMonth} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: '#71717a' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#71717a' }}
                        axisLine={false}
                        tickLine={false}
                        width={28}
                        allowDecimals={false}
                      />
                      <Tooltip
                        formatter={(val) => [`${val} cancellations`, '']}
                        cursor={{ fill: '#f4f4f5' }}
                      />
                      <Bar dataKey="revenue" fill="#A32D2D" radius={[3, 3, 0, 0]} maxBarSize={48} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* SECTION A: Cancelaciones pagadas */}
            <Card className="border-red-200 dark:border-red-900/40">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0" />
                  <CardTitle className="text-sm font-semibold">Paid cancellations</CardTitle>
                  <span className="ml-auto text-xs text-red-600 dark:text-red-400 font-medium">{paidCancels.length} records</span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-6 space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-10 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                    ))}
                  </div>
                ) : paidCancels.length === 0 ? (
                  <EmptyState title="No paid cancellations" description="No paid subscriptions have been cancelled." />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <AnimatedTableRow variants={rowVariants} initial="hidden" animate="visible" custom={0}>
                          <TableHead>Name</TableHead>
                          <TableHead className="hidden md:table-cell">Email</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="hidden md:table-cell">Platform</TableHead>
                          <TableHead className="hidden lg:table-cell">Subscribed since</TableHead>
                          <TableHead className="hidden sm:table-cell">Cancelled</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">Days active</TableHead>
                        </AnimatedTableRow>
                      </TableHeader>
                      <TableBody>
                        {paidCancels.map((c, i) => (
                          <AnimatedTableRow
                            key={c.id}
                            variants={rowVariants}
                            initial="hidden"
                            animate="visible"
                            custom={i}
                            className={cn(
                              i % 2 === 0 ? 'bg-white dark:bg-zinc-900' : 'bg-zinc-50 dark:bg-zinc-800/50',
                              'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors'
                            )}
                            onClick={() => openModal({ kind: 'cancellation', data: c })}
                          >
                            <TableCell className="font-medium text-sm">{c.name}</TableCell>
                            <TableCell className="text-xs text-zinc-500 hidden md:table-cell">{c.email}</TableCell>
                            <TableCell>
                              <StatusPill label={c.plan === 'annual' ? 'Annual' : 'Monthly'} variant={c.plan === 'annual' ? 'success' : 'info'} />
                            </TableCell>
                            <TableCell className="text-right font-semibold text-sm whitespace-nowrap">{formatCurrency(c.amount)}</TableCell>
                            <TableCell className="text-xs text-zinc-500 hidden md:table-cell">{c.source}</TableCell>
                            <TableCell className="text-xs text-zinc-500 whitespace-nowrap hidden lg:table-cell">{c.subscribed_at ? formatDate(c.subscribed_at) : '—'}</TableCell>
                            <TableCell className="text-xs text-zinc-500 whitespace-nowrap hidden sm:table-cell">{c.cancelled_at ? formatDate(c.cancelled_at) : '—'}</TableCell>
                            <TableCell className="text-right text-xs text-zinc-500 whitespace-nowrap hidden sm:table-cell">
                              {c.subscribed_at && c.cancelled_at ? `${daysActive(c.subscribed_at, c.cancelled_at)}d` : '—'}
                            </TableCell>
                          </AnimatedTableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* SECTION B: Cancelaciones pendientes */}
            <Card className="border-amber-200 dark:border-amber-900/40">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" />
                  <CardTitle className="text-sm font-semibold">Pending cancellations</CardTitle>
                  <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    ⚠️ Retention opportunity
                  </span>
                  <span className="ml-auto text-xs text-amber-600 dark:text-amber-400 font-medium">{pendingCancels.length} records</span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-6 space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-10 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                    ))}
                  </div>
                ) : pendingCancels.length === 0 ? (
                  <EmptyState title="No pending cancellations" description="No members have requested cancellation." />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <AnimatedTableRow variants={rowVariants} initial="hidden" animate="visible" custom={0}>
                          <TableHead>Name</TableHead>
                          <TableHead className="hidden md:table-cell">Email</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="hidden md:table-cell">Platform</TableHead>
                          <TableHead className="hidden lg:table-cell">Subscribed since</TableHead>
                          <TableHead className="hidden sm:table-cell">Access until</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">Days active</TableHead>
                        </AnimatedTableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingCancels.map((c, i) => (
                          <AnimatedTableRow
                            key={c.id}
                            variants={rowVariants}
                            initial="hidden"
                            animate="visible"
                            custom={i}
                            className={cn(
                              i % 2 === 0 ? 'bg-white dark:bg-zinc-900' : 'bg-zinc-50 dark:bg-zinc-800/50',
                              'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors'
                            )}
                            onClick={() => openModal({ kind: 'cancellation', data: c })}
                          >
                            <TableCell className="font-medium text-sm">{c.name}</TableCell>
                            <TableCell className="text-xs text-zinc-500 hidden md:table-cell">{c.email}</TableCell>
                            <TableCell>
                              <StatusPill label={c.plan === 'annual' ? 'Annual' : 'Monthly'} variant={c.plan === 'annual' ? 'success' : 'info'} />
                            </TableCell>
                            <TableCell className="text-right font-semibold text-sm whitespace-nowrap">{formatCurrency(c.amount)}</TableCell>
                            <TableCell className="text-xs text-zinc-500 hidden md:table-cell">{c.source}</TableCell>
                            <TableCell className="text-xs text-zinc-500 whitespace-nowrap hidden lg:table-cell">{c.subscribed_at ? formatDate(c.subscribed_at) : '—'}</TableCell>
                            <TableCell className="text-xs text-amber-600 dark:text-amber-400 font-medium whitespace-nowrap hidden sm:table-cell">
                              {c.cancelled_at ? formatDate(c.cancelled_at) : '—'}
                            </TableCell>
                            <TableCell className="text-right text-xs text-zinc-500 whitespace-nowrap hidden sm:table-cell">
                              {c.subscribed_at && c.cancelled_at ? `${daysActive(c.subscribed_at, c.cancelled_at)}d` : '—'}
                            </TableCell>
                          </AnimatedTableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* SECTION C: Trials cancelados */}
            <Card className="border-zinc-200 dark:border-zinc-700">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-400 shrink-0" />
                  <CardTitle className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Cancelled trials</CardTitle>
                  <span className="ml-1 text-xs text-zinc-400 italic">Never made a payment · do not affect churn</span>
                  <span className="ml-auto text-xs text-zinc-400 font-medium">{trialCancels.length} records</span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-6 space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-10 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                    ))}
                  </div>
                ) : trialCancels.length === 0 ? (
                  <EmptyState title="No cancelled trials" description="Cancelled trials will appear here." />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <AnimatedTableRow variants={rowVariants} initial="hidden" animate="visible" custom={0}>
                          <TableHead>Name</TableHead>
                          <TableHead className="hidden md:table-cell">Email</TableHead>
                          <TableHead className="hidden md:table-cell">Platform</TableHead>
                          <TableHead className="hidden sm:table-cell">Trial start</TableHead>
                          <TableHead className="hidden sm:table-cell">Cancelled</TableHead>
                        </AnimatedTableRow>
                      </TableHeader>
                      <TableBody>
                        {trialCancels.map((c, i) => (
                          <AnimatedTableRow
                            key={c.id}
                            variants={rowVariants}
                            initial="hidden"
                            animate="visible"
                            custom={i}
                            className={cn(
                              i % 2 === 0 ? 'bg-white dark:bg-zinc-900' : 'bg-zinc-50 dark:bg-zinc-800/50',
                              'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors'
                            )}
                            onClick={() => openModal({ kind: 'cancellation', data: c })}
                          >
                            <TableCell className="font-medium text-sm text-zinc-500 dark:text-zinc-400">{c.name}</TableCell>
                            <TableCell className="text-xs text-zinc-400 hidden md:table-cell">{c.email}</TableCell>
                            <TableCell className="text-xs text-zinc-400 hidden md:table-cell">{c.source}</TableCell>
                            <TableCell className="text-xs text-zinc-400 whitespace-nowrap hidden sm:table-cell">{c.subscribed_at ? formatDate(c.subscribed_at) : '—'}</TableCell>
                            <TableCell className="text-xs text-zinc-400 whitespace-nowrap hidden sm:table-cell">{c.cancelled_at ? formatDate(c.cancelled_at) : '—'}</TableCell>
                          </AnimatedTableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <Dialog open={!!selectedMember} onOpenChange={(open) => { if (!open) setSelectedMember(null) }}>
        {selectedMember && (
          <MemberProfileModal
            selected={selectedMember}
            notes={notes}
            noteText={noteText}
            addingNote={addingNote}
            onNoteChange={setNoteText}
            onAddNote={handleAddNote}
          />
        )}
      </Dialog>
    </PageTransition>
  )
}
