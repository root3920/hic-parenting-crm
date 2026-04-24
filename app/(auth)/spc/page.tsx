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
import { SpcMember, SpcClassAttendance } from '@/types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
} from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle, Calendar, Clock, Download, ExternalLink, Mail, MessageSquare, Pencil, Phone, Search, Trash2, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { PageTransition } from '@/components/motion/PageTransition'
import { KPICardGrid } from '@/components/motion/KPICardGrid'
import { AnimatedTableRow, rowVariants } from '@/components/motion/AnimatedTableRow'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  Legend,
} from 'recharts'
import { useProfile } from '@/hooks/useProfile'
import { getCanonicalProduct } from '@/lib/products'
import type { Transaction } from '@/types'
import { toast } from 'sonner'

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
  name: string | null
  email: string | null
  source: string | null
  cancelled_at: string | null
  subscribed_at: string | null
  amount: number
  plan: 'monthly' | 'annual' | null
  cancel_type: 'paid_cancel' | 'pending_cancel' | 'trial_cancel' | null
  created_at: string
  // columns added via CSV import
  subscription_id: string | null
  customer_phone: string | null
  interval: string | null
  offer_title: string | null
  provider: string | null
  currency: string | null
  paid_cancel: boolean | null
  trial_cancel: boolean | null
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

type Tab = 'overview' | 'active' | 'trials' | 'expired' | 'cancellations'

type ActiveSort = 'joined_desc' | 'joined_asc' | 'last_payment_desc' | 'last_payment_asc' | 'score_desc' | 'last_note_desc'
type TrialSort = 'trial_start_desc' | 'trial_start_asc' | 'expires_asc' | 'score_desc' | 'last_note_desc'
type CancelSort = 'cancelled_desc' | 'cancelled_asc' | 'subscribed_desc' | 'subscribed_asc' | 'days_active_desc'
type ExpiredSort = 'joined_desc' | 'joined_asc' | 'last_payment_desc' | 'score_desc' | 'days_expired_desc'
type GrowthPeriod = 'this_month' | 'last_30d' | 'last_90d' | 'this_year' | 'all'

const chartVariants = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, delay: 0.2, ease: 'easeOut' as const } },
}

function getInitials(name: string | null | undefined) {
  if (!name) return '?'
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
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

function isPaidCancel(c: SpcCancellation) {
  if (c.paid_cancel === true) return true
  if (c.trial_cancel === true) return false
  return c.cancel_type === 'paid_cancel'
}
function isTrialCancel(c: SpcCancellation) {
  if (c.trial_cancel === true) return true
  if (c.paid_cancel === true) return false
  return c.cancel_type === 'trial_cancel'
}

function formatDateTime(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function calcNextPayment(
  txList: Transaction[] | undefined,
  plan: 'monthly' | 'annual' | null | undefined,
  fallbackDate?: string | null,
): string {
  const completed = (txList ?? []).filter((t) => (t.status ?? 'completed') === 'completed')
  const anchorStr = completed.length > 0 ? completed[0].date : fallbackDate
  if (!anchorStr) return '—'
  const d = new Date(anchorStr + 'T12:00:00')
  if (plan === 'annual') {
    d.setFullYear(d.getFullYear() + 1)
  } else {
    d.setMonth(d.getMonth() + 1)
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function calcNextPaymentISO(
  txList: Transaction[] | undefined,
  plan: 'monthly' | 'annual',
  fallbackDate?: string | null,
): string {
  const completed = (txList ?? []).filter((t) => (t.status ?? 'completed') === 'completed')
  const anchorStr = completed.length > 0 ? completed[0].date : fallbackDate
  if (!anchorStr) return ''
  const d = new Date(anchorStr + 'T12:00:00')
  if (plan === 'annual') {
    d.setFullYear(d.getFullYear() + 1)
  } else {
    d.setMonth(d.getMonth() + 1)
  }
  return d.toISOString().slice(0, 10)
}

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const hours = diffMs / (1000 * 60 * 60)
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${Math.floor(hours)}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}

function noteDotCls(dateStr: string): string {
  const days = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
  if (days <= 3) return 'bg-green-500'
  if (days <= 7) return 'bg-yellow-400'
  return 'bg-red-500'
}

function isPaymentOverdue(dateStr: string, plan: 'monthly' | 'annual'): boolean {
  const days = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
  return plan === 'annual' ? days > 370 : days > 35
}

function leadScoreConfig(score: number | null | undefined): { dot: string; pill: string; label: string } {
  if (!score || score === 0) return { dot: 'bg-zinc-300 dark:bg-zinc-600', pill: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400', label: 'No data' }
  if (score >= 90) return { dot: 'bg-emerald-500', pill: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', label: 'Highly engaged' }
  if (score >= 75) return { dot: 'bg-blue-500', pill: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', label: 'Engaged' }
  if (score >= 60) return { dot: 'bg-amber-400', pill: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', label: 'At risk' }
  return { dot: 'bg-red-500', pill: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', label: 'Low engagement' }
}

function LastNoteCell({ lastNoteAt, onClick }: { lastNoteAt?: string; onClick: (e: React.MouseEvent) => void }) {
  if (!lastNoteAt) {
    return <span className="text-xs text-zinc-400 italic">No notes</span>
  }
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 hover:opacity-70 transition-opacity"
      title="Open notes"
    >
      <span className={cn('w-2 h-2 rounded-full shrink-0', noteDotCls(lastNoteAt))} />
      <span className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-nowrap">{formatRelativeTime(lastNoteAt)}</span>
    </button>
  )
}

function SpcModal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto border border-zinc-200 dark:border-zinc-700 w-full max-w-4xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <span />
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

type MemberStatus = 'active' | 'trial' | 'cancelled' | 'expired'

interface MemberEditForm {
  name: string
  email: string
  phone: string
  plan: 'monthly' | 'annual'
  provider: 'Kajabi' | 'Stripe' | 'PayPal'
  joined_at: string
  status: MemberStatus
  next_payment_date: string
  trial_end_date: string
}

type CancelTypeOrReactivate = 'paid_cancel' | 'pending_cancel' | 'trial_cancel' | 'reactivate_active' | 'reactivate_trial'

interface CancelEditForm {
  name: string
  email: string
  customer_phone: string
  cancel_type: CancelTypeOrReactivate
  offer_title: string
  amount: string
  currency: string
  cancelled_at: string
  provider: string
}

const STATUS_CONFIG: Record<MemberStatus, { label: string; cls: string }> = {
  active:    { label: 'Active',    cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  trial:     { label: 'Trial',     cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  expired:   { label: 'Expired',   cls: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400' },
}

function MemberProfileModal({
  selected,
  notes,
  noteText,
  addingNote,
  onNoteChange,
  onAddNote,
  onClose,
  onSave,
  onSaveCancellation,
  onReactivate,
  memberTransactions,
  memberAttendance,
  highlightNotes,
  onMemberUpdate,
}: {
  selected: SelectedMember
  notes: SpcMemberNote[]
  noteText: string
  addingNote: boolean
  onNoteChange: (v: string) => void
  onAddNote: () => void
  onClose: () => void
  onSave: (updated: SpcMember) => void
  onSaveCancellation: (updated: SpcCancellation) => void
  onReactivate: (cancellationId: string, member: SpcMember) => void
  memberTransactions: Transaction[]
  memberAttendance: SpcClassAttendance[]
  highlightNotes?: boolean
  onMemberUpdate: (updated: SpcMember) => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const sectionLabel = 'text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3'
  const rowLabel = 'text-xs text-zinc-500 dark:text-zinc-400'
  const rowValue = 'text-xs font-medium text-zinc-800 dark:text-zinc-200 text-right'
  const inputCls = 'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400'

  const notesRef = useRef<HTMLDivElement>(null)
  const [notesFocused, setNotesFocused] = useState(false)
  useEffect(() => {
    if (highlightNotes) {
      setNotesFocused(true)
      notesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      const t = setTimeout(() => setNotesFocused(false), 2000)
      return () => clearTimeout(t)
    }
  }, [highlightNotes])

  const [isEditing, setIsEditing] = useState(false)
  const [isCancelEditing, setIsCancelEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState<MemberEditForm>({
    name: '', email: '', phone: '', plan: 'monthly',
    provider: 'Stripe', joined_at: '', status: 'active', next_payment_date: '', trial_end_date: '',
  })
  const [cancelForm, setCancelForm] = useState<CancelEditForm>({
    name: '', email: '', customer_phone: '', cancel_type: 'paid_cancel',
    offer_title: '', amount: '', currency: 'USD', cancelled_at: '', provider: '',
  })

  function setField<K extends keyof MemberEditForm>(key: K, value: MemberEditForm[K]) {
    setEditForm((prev) => ({ ...prev, [key]: value }))
  }

  function setCancelField<K extends keyof CancelEditForm>(key: K, value: CancelEditForm[K]) {
    setCancelForm((prev) => ({ ...prev, [key]: value }))
  }

  function startEdit() {
    if (selected.kind !== 'member') return
    const m = selected.data
    const autoDate = calcNextPaymentISO(memberTransactions, m.plan, m.joined_at)
    setEditForm({
      name: m.name,
      email: m.email,
      phone: m.phone ?? '',
      plan: m.plan,
      provider: m.provider,
      joined_at: m.joined_at ?? '',
      status: (m.status as MemberStatus) ?? 'active',
      next_payment_date: m.next_payment_date ?? autoDate,
      trial_end_date: m.trial_end_date ?? '',
    })
    setIsEditing(true)
  }

  function startEditCancellation() {
    if (selected.kind !== 'cancellation') return
    const c = selected.data
    // Derive cancel_type from boolean flags for accuracy
    const derivedType: CancelTypeOrReactivate =
      c.trial_cancel === true ? 'trial_cancel' :
      c.paid_cancel === true ? 'paid_cancel' :
      c.cancel_type ?? 'paid_cancel'
    setCancelForm({
      name: c.name ?? '',
      email: c.email ?? '',
      customer_phone: c.customer_phone ?? '',
      cancel_type: derivedType,
      offer_title: c.offer_title ?? '',
      amount: c.amount?.toString() ?? '',
      currency: c.currency ?? 'USD',
      cancelled_at: c.cancelled_at?.slice(0, 10) ?? '',
      provider: c.provider ?? c.source ?? '',
    })
    setIsCancelEditing(true)
  }

  async function handleSave() {
    if (selected.kind !== 'member') return
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('spc_members')
        .update({
          name: editForm.name,
          email: editForm.email,
          plan: editForm.plan,
          provider: editForm.provider,
          joined_at: editForm.joined_at || null,
          status: editForm.status,
          next_payment_date: editForm.next_payment_date || null,
          trial_end_date: editForm.trial_end_date || null,
        })
        .eq('id', selected.data.id)
        .select()
        .single()
      if (error) {
        toast.error(`Failed to save: ${error.message}`)
        return
      }
      if (!data) {
        toast.error('Save failed: no data returned. Check table permissions.')
        return
      }
      const previousStatus = selected.data.status as string
      if (editForm.status === 'cancelled' && previousStatus !== 'cancelled') {
        const today = new Date().toISOString().split('T')[0]
        const isPaid = previousStatus === 'active'
        const isTrial = previousStatus === 'trial'
        await supabase.from('spc_cancellations').insert({
          name: editForm.name || null,
          email: editForm.email || null,
          customer_phone: editForm.phone || null,
          amount: selected.data.amount,
          currency: 'USD',
          interval: editForm.plan,
          plan: editForm.plan,
          cancel_type: isPaid ? 'paid_cancel' : isTrial ? 'trial_cancel' : 'paid_cancel',
          cancelled_at: today,
          source: 'manual',
          subscription_id: `manual-${selected.data.id}`,
          paid_cancel: isPaid,
          trial_cancel: isTrial,
        })
      }
      toast.success('Member updated successfully')
      onSave(data as SpcMember)
      setIsEditing(false)
    } catch (err) {
      toast.error(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveCancellation() {
    if (selected.kind !== 'cancellation') return
    setSaving(true)

    const isReactivation = cancelForm.cancel_type === 'reactivate_active' || cancelForm.cancel_type === 'reactivate_trial'

    try {
      if (isReactivation) {
        const newStatus = cancelForm.cancel_type === 'reactivate_active' ? 'active' : 'trial'
        const email = (cancelForm.email || '').toLowerCase().trim()

        // Check if member already exists in spc_members
        const { data: existing } = email
          ? await supabase.from('spc_members').select('id').eq('email', email).maybeSingle()
          : { data: null }

        let memberData: SpcMember
        if (existing) {
          // Update existing member
          const { data, error } = await supabase
            .from('spc_members')
            .update({ status: newStatus, name: cancelForm.name || undefined })
            .eq('id', existing.id)
            .select()
            .single()
          if (error) { toast.error(`Failed to reactivate: ${error.message}`); return }
          memberData = data as SpcMember
        } else {
          // Insert new member
          const { data, error } = await supabase
            .from('spc_members')
            .insert({
              name: cancelForm.name || 'Unknown',
              email: cancelForm.email || '',
              phone: cancelForm.customer_phone || null,
              plan: (selected.data.plan as 'monthly' | 'annual') ?? 'monthly',
              amount: parseFloat(cancelForm.amount) || 0,
              provider: (cancelForm.provider || 'Stripe') as 'Kajabi' | 'Stripe' | 'PayPal',
              status: newStatus,
              joined_at: new Date().toISOString().split('T')[0],
            })
            .select()
            .single()
          if (error) { toast.error(`Failed to create member: ${error.message}`); return }
          memberData = data as SpcMember
        }

        // Delete from cancellations
        const { error: delError } = await supabase
          .from('spc_cancellations')
          .delete()
          .eq('id', selected.data.id)
        if (delError) { toast.error(`Failed to remove cancellation: ${delError.message}`); return }

        const statusLabel = newStatus === 'active' ? 'Active' : 'Trial'
        toast.success(`Member reactivated as ${statusLabel}`)
        onReactivate(selected.data.id, memberData)
        setIsCancelEditing(false)
      } else {
        // Normal cancellation update
        const isPaid = cancelForm.cancel_type === 'paid_cancel'
        const isTrial = cancelForm.cancel_type === 'trial_cancel'
        const { data, error } = await supabase
          .from('spc_cancellations')
          .update({
            name: cancelForm.name || null,
            email: cancelForm.email || null,
            customer_phone: cancelForm.customer_phone || null,
            cancel_type: cancelForm.cancel_type as 'paid_cancel' | 'pending_cancel' | 'trial_cancel',
            paid_cancel: isPaid,
            trial_cancel: isTrial,
            offer_title: cancelForm.offer_title || null,
            amount: parseFloat(cancelForm.amount) || 0,
            currency: cancelForm.currency || null,
            cancelled_at: cancelForm.cancelled_at || null,
            provider: cancelForm.provider || null,
          })
          .eq('id', selected.data.id)
          .select()
          .single()
        if (error) {
          toast.error(`Failed to save: ${error.message}`)
          return
        }
        if (!data) {
          toast.error('Save failed: no data returned. Check table permissions.')
          return
        }
        toast.success('Cancellation updated successfully')
        onSaveCancellation(data as SpcCancellation)
        setIsCancelEditing(false)
      }
    } catch (err) {
      toast.error(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setIsEditing(false)
    setIsCancelEditing(false)
  }

  // ── Derived display values (optimistic during edit) ──
  const displayName     = isEditing ? editForm.name : isCancelEditing ? cancelForm.name : (selected.data.name ?? '')
  const displayEmail    = isEditing ? editForm.email : isCancelEditing ? cancelForm.email : (selected.data.email ?? '')
  const displayPhone    = isEditing
    ? editForm.phone
    : isCancelEditing
      ? cancelForm.customer_phone
      : (selected.kind === 'member' ? (selected.data.phone ?? null) : (selected.data.customer_phone ?? null))
  const displayPlan     = (isEditing ? editForm.plan : selected.data.plan) ?? null
  const displayProvider = isEditing
    ? editForm.provider
    : isCancelEditing
      ? cancelForm.provider
      : (selected.kind === 'member'
          ? selected.data.provider
          : (selected.data.provider ?? selected.data.source ?? '—'))

  // Status badge — optimistic when editing
  let statusLabel = ''
  let statusCls = ''
  if (selected.kind === 'member') {
    const key = (isEditing ? editForm.status : selected.data.status) as MemberStatus
    const cfg = STATUS_CONFIG[key] ?? STATUS_CONFIG.active
    statusLabel = cfg.label; statusCls = cfg.cls
  } else {
    const ct = isCancelEditing ? cancelForm.cancel_type : selected.data.cancel_type
    if (ct === 'paid_cancel') {
      statusLabel = 'Cancelled'; statusCls = STATUS_CONFIG.cancelled.cls
    } else if (ct === 'pending_cancel') {
      statusLabel = 'Pending Cancel'
      statusCls = 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
    } else {
      statusLabel = ct === 'trial_cancel' ? 'Trial Cancelled' : 'Cancelled'
      statusCls = STATUS_CONFIG.expired.cls
    }
  }

  function noteBorderCls(createdAt: string) {
    const diff = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
    if (diff < 3) return 'border-green-400 bg-green-50 dark:bg-green-900/10'
    if (diff < 7) return 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/10'
    return 'border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800/60'
  }

  return (
    <SpcModal onClose={onClose}>
      {/* ── Header ── */}
      <div className="flex items-start gap-4 mb-6 -mt-1">
        <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-lg font-bold text-blue-600 dark:text-blue-300 shrink-0">
          {getInitials(displayName)}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 leading-tight">{displayName}</h2>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {displayEmail && (
              <span className="flex items-center gap-1 text-xs text-zinc-400">
                <Mail className="h-3 w-3" />{displayEmail}
              </span>
            )}
            {displayPhone && (
              <span className="flex items-center gap-1 text-xs text-zinc-400">
                <Phone className="h-3 w-3" />{displayPhone}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {/* Status badge — updates optimistically during edit */}
            <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-semibold', statusCls)}>
              {statusLabel}
            </span>
            {displayPlan && (
              <span className={cn(
                'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold',
                displayPlan === 'annual'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                  : 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
              )}>
                {displayPlan === 'annual' ? 'Annual' : 'Monthly'}
              </span>
            )}
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
              {displayProvider}
            </span>
            {selected.kind === 'member' && (() => {
              const score = selected.data.lead_score
              const cfg = leadScoreConfig(score)
              return (
                <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', cfg.pill)}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                  Score {score ?? 0}
                </span>
              )
            })()}
          </div>
        </div>
        {/* Quick actions */}
        <div className="flex items-center gap-1 shrink-0">
          {selected.kind === 'member' && selected.data.status === 'expired' && !isEditing && (
            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 mr-1">
              Expired
            </span>
          )}
          {selected.kind === 'member' && !isEditing && (
            <button
              onClick={startEdit}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Edit"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {selected.kind === 'cancellation' && !isCancelEditing && (
            <button
              onClick={startEditCancellation}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Edit"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          <button
            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Recovery banner for expired members */}
      {selected.kind === 'member' && selected.data.status === 'expired' && !isEditing && (
        <div className="mb-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-0.5">Recovery Opportunity</p>
          <p className="text-xs text-amber-700 dark:text-amber-300">
            This member&apos;s subscription has expired.{' '}
            {(() => {
              const lp = memberTransactions.filter((tx) => (tx.status ?? 'completed') === 'completed')[0]
              return lp ? <>Last payment: <strong>{formatDate(lp.date)}</strong>. </> : null
            })()}
            Consider reaching out to re-activate.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* ── LEFT: Key Info (view), Member Edit, or Cancellation Edit ── */}
        <div>
          {!isEditing && !isCancelEditing ? (
            <>
              <p className={sectionLabel}>Key Info</p>
              <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className={rowLabel}>Member since</span>
                  <span className={rowValue}>
                    {selected.kind === 'member' ? formatDate(selected.data.joined_at) : (selected.data.subscribed_at ? formatDate(selected.data.subscribed_at) : '—')}
                  </span>
                </div>
                {selected.kind === 'member' && selected.data.status === 'active' && (
                  <div className="flex items-center justify-between">
                    <span className={rowLabel}>Next Payment</span>
                    <span className={rowValue}>
                      {selected.data.next_payment_date
                        ? formatDate(selected.data.next_payment_date)
                        : calcNextPayment(memberTransactions, selected.data.plan)}
                    </span>
                  </div>
                )}
                {selected.kind === 'cancellation' && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className={rowLabel}>Cancelled</span>
                      <span className={rowValue}>{selected.data.cancelled_at ? formatDate(selected.data.cancelled_at) : '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={rowLabel}>Last Payment</span>
                      <span className={rowValue}>
                        {memberTransactions.filter((tx) => (tx.status ?? 'completed') === 'completed').length > 0
                          ? formatDate(memberTransactions.filter((tx) => (tx.status ?? 'completed') === 'completed')[0].date)
                          : '—'}
                      </span>
                    </div>
                  </>
                )}
                <div className="flex items-center justify-between">
                  <span className={rowLabel}>Plan</span>
                  <span className={rowValue}>
                    {displayPlan === 'annual' ? 'Annual' : displayPlan === 'monthly' ? 'Monthly' : '—'} · {formatCurrency(selected.data.amount)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={rowLabel}>Payment Method</span>
                  <span className={rowValue}>{displayProvider}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={rowLabel}>Days Left</span>
                  {selected.kind === 'member' && selected.data.trial_end_date
                    ? (() => {
                        const d = daysUntil(selected.data.trial_end_date)
                        if (d < 0) return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Expired</span>
                        if (d <= 3) return <span className="text-xs font-bold text-red-600 dark:text-red-400">{d}d left</span>
                        if (d <= 7) return <span className="text-xs font-bold text-amber-600 dark:text-amber-400">{d}d left</span>
                        if (d <= 14) return <span className="text-xs font-bold text-green-600 dark:text-green-400">{d}d left</span>
                        return <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">{d}d left</span>
                      })()
                    : <span className={rowValue}>—</span>
                  }
                </div>
                {selected.kind === 'member' && selected.data.trial_end_date && (
                  <div className="flex items-center justify-between">
                    <span className={rowLabel}>Trial Expires</span>
                    <span className={rowValue}>{formatDate(selected.data.trial_end_date)}</span>
                  </div>
                )}
              </div>

              {/* ── Transactions ── */}
              {(selected.kind === 'member' || selected.kind === 'cancellation') && (
                <div className="mt-4">
                  <p className={sectionLabel}>Transactions</p>
                  {memberTransactions.length === 0 ? (
                    <div className="bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-center">
                      <p className="text-xs text-zinc-400">No SPC transactions found</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {memberTransactions.map((tx) => {
                          const st = tx.status ?? 'completed'
                          const stCls =
                            st === 'refunded' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                            st === 'failed'   ? 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400' :
                            'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                          const stLabel = st.charAt(0).toUpperCase() + st.slice(1)
                          return (
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
                                  <span className={cn('inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold', stCls)}>
                                    {stLabel}
                                  </span>
                                  <span className="text-xs text-zinc-400 flex items-center gap-0.5">
                                    <Calendar className="h-3 w-3" />{formatDate(tx.date)}
                                  </span>
                                </div>
                                {selected.data.email && (
                                  <a
                                    href={`/sales?email=${encodeURIComponent(selected.data.email)}`}
                                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                                  >
                                    Sales <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      {/* Summary */}
                      {(() => {
                        const completed = memberTransactions.filter((t) => t.status !== 'refunded' && t.status !== 'failed')
                        const totalPaid = completed.reduce((s, t) => s + Number(t.cost), 0)
                        return (
                          <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className={rowLabel}>Total Paid</span>
                              <span className="text-xs font-semibold text-green-700 dark:text-green-400">{formatCurrency(totalPaid)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className={rowLabel}>Payments</span>
                              <span className={rowValue}>{completed.length}</span>
                            </div>
                          </div>
                        )
                      })()}
                    </>
                  )}
                </div>
              )}
            </>
          ) : isCancelEditing ? (
            /* ── CANCELLATION EDIT FORM ── */
            <>
              <p className={sectionLabel}>Edit Cancellation</p>

              {/* Cancel type */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                  Cancel Type
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    ['paid_cancel',    'Paid Cancel',   STATUS_CONFIG.cancelled.cls],
                    ['trial_cancel',   'Trial Cancel',  STATUS_CONFIG.trial.cls],
                    ['pending_cancel', 'Pending',       'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'],
                    ['reactivate_active', 'Active',     STATUS_CONFIG.active.cls],
                    ['reactivate_trial',  'Trial',      STATUS_CONFIG.active.cls],
                  ] as [CancelEditForm['cancel_type'], string, string][]).map(([key, label, cls]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setCancelField('cancel_type', key)}
                      className={cn(
                        'py-1.5 px-2 rounded-lg text-xs font-semibold border-2 transition-all',
                        cancelForm.cancel_type === key
                          ? cn('border-current', cls)
                          : 'border-transparent bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {(cancelForm.cancel_type === 'reactivate_active' || cancelForm.cancel_type === 'reactivate_trial') && (
                  <p className="mt-2 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
                    This will move the member back to {cancelForm.cancel_type === 'reactivate_active' ? 'Active Members' : 'Free Trials'} and remove them from Cancellations.
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Full name</label>
                  <input type="text" value={cancelForm.name} onChange={(e) => setCancelField('name', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Email</label>
                  <input type="email" value={cancelForm.email} onChange={(e) => setCancelField('email', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Phone</label>
                  <input type="text" value={cancelForm.customer_phone} onChange={(e) => setCancelField('customer_phone', e.target.value)} placeholder="+" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Offer / Product</label>
                  <input type="text" value={cancelForm.offer_title} onChange={(e) => setCancelField('offer_title', e.target.value)} className={inputCls} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Amount</label>
                    <input type="number" step="0.01" value={cancelForm.amount} onChange={(e) => setCancelField('amount', e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Currency</label>
                    <input type="text" value={cancelForm.currency} onChange={(e) => setCancelField('currency', e.target.value)} className={inputCls} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Cancelled at</label>
                    <input type="date" value={cancelForm.cancelled_at} onChange={(e) => setCancelField('cancelled_at', e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Provider</label>
                    <input type="text" value={cancelForm.provider} onChange={(e) => setCancelField('provider', e.target.value)} className={inputCls} />
                  </div>
                </div>
                {selected.kind === 'cancellation' && selected.data.source && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Source</label>
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                      {selected.data.source}
                    </span>
                  </div>
                )}
              </div>

              {/* Save / Cancel */}
              <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveCancellation}
                  disabled={saving}
                  className="px-4 py-2 text-xs rounded-lg text-white font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity"
                  style={{ backgroundColor: '#185FA5' }}
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </>
          ) : (
            /* ── MEMBER EDIT FORM ── */
            <>
              <p className={sectionLabel}>Edit Member</p>

              {/* Status — prominent select */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                  Membership Status
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(Object.entries(STATUS_CONFIG) as [MemberStatus, { label: string; cls: string }][]).map(([key, cfg]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setField('status', key)}
                      className={cn(
                        'py-1.5 px-2 rounded-lg text-xs font-semibold border-2 transition-all',
                        editForm.status === key
                          ? cn('border-current', cfg.cls)
                          : 'border-transparent bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                      )}
                    >
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fields */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Full name</label>
                  <input type="text" value={editForm.name} onChange={(e) => setField('name', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Email</label>
                  <input type="email" value={editForm.email} onChange={(e) => setField('email', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Phone</label>
                  <input type="text" value={editForm.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="+" className={inputCls} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Plan</label>
                    <select value={editForm.plan} onChange={(e) => setField('plan', e.target.value as 'monthly' | 'annual')} className={inputCls}>
                      <option value="monthly">Monthly</option>
                      <option value="annual">Annual</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Payment Method</label>
                    <select value={editForm.provider} onChange={(e) => setField('provider', e.target.value as MemberEditForm['provider'])} className={inputCls}>
                      <option value="Stripe">Stripe</option>
                      <option value="PayPal">PayPal</option>
                      <option value="Kajabi">Kajabi Payments</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Member since</label>
                  <input type="date" value={editForm.joined_at} onChange={(e) => setField('joined_at', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Next Payment</label>
                  <input type="date" value={editForm.next_payment_date} onChange={(e) => setField('next_payment_date', e.target.value)} className={inputCls} />
                  <p className="text-[10px] text-zinc-400 mt-1">Auto-calculated from last payment. Override manually if needed.</p>
                </div>
                {editForm.status === 'trial' && (
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Trial Expires</label>
                    <input type="date" value={editForm.trial_end_date} onChange={(e) => setField('trial_end_date', e.target.value)} className={inputCls} />
                    <p className="text-[10px] text-zinc-400 mt-1">When this trial ends. Days Left is calculated from this date.</p>
                  </div>
                )}
              </div>

              {/* Save / Cancel */}
              <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 text-xs rounded-lg text-white font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity"
                  style={{ backgroundColor: '#185FA5' }}
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── RIGHT: Contact Notes (always visible) ── */}
        <div ref={notesRef} className={cn('flex flex-col rounded-xl transition-all duration-500', notesFocused && 'ring-2 ring-blue-400 ring-offset-2 p-2')}>
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="h-3.5 w-3.5 text-zinc-400" />
            <p className={cn(sectionLabel, 'mb-0')}>Contact Notes</p>
          </div>

          <div className="flex-1 space-y-2 max-h-72 overflow-y-auto pr-1 mb-4">
            {notes.length === 0 ? (
              <div className="text-center py-10 text-zinc-400 text-xs">
                No notes yet. Add the first contact note below.
              </div>
            ) : (
              notes.map((note) => (
                <div key={note.id} className={cn('rounded-xl p-3 border-l-4', noteBorderCls(note.created_at))}>
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

          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4">
            <textarea
              value={noteText}
              onChange={(e) => onNoteChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  onAddNote()
                }
              }}
              placeholder="Add a contact note… (⌘+Enter to save)"
              rows={3}
              className="w-full text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={onAddNote}
                disabled={!noteText.trim() || addingNote}
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

      {/* ── Attendance + WhatsApp (members only) ── */}
      {selected.kind === 'member' && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-zinc-100 dark:border-zinc-800 pt-5">
          {/* Attendance */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">
              Class Attendance ({memberAttendance.length} {memberAttendance.length === 1 ? 'class' : 'classes'})
            </p>
            {memberAttendance.length === 0 ? (
              <p className="text-xs text-zinc-400 italic">No ha asistido a ninguna clase</p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {memberAttendance.map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-xs bg-zinc-50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
                    <span className="text-zinc-700 dark:text-zinc-300 font-medium">{formatDate(a.class_date)}</span>
                    <span className="text-zinc-400">{a.duration_minutes} min</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* WhatsApp toggle */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">WhatsApp Community</p>
            <WhatsAppToggle
              member={selected.data}
              onUpdate={onMemberUpdate}
            />
          </div>
        </div>
      )}
    </SpcModal>
  )
}

function WhatsAppToggle({ member, onUpdate }: { member: SpcMember; onUpdate: (updated: SpcMember) => void }) {
  const supabase = useMemo(() => createClient(), [])
  const [toggling, setToggling] = useState(false)
  const isActive = member.whatsapp_active ?? false

  async function handleToggle() {
    setToggling(true)
    const nowIso = new Date().toISOString()
    const { data, error } = await supabase
      .from('spc_members')
      .update({
        whatsapp_active: !isActive,
        whatsapp_joined_at: !isActive ? nowIso : member.whatsapp_joined_at,
      })
      .eq('id', member.id)
      .select()
      .single()
    setToggling(false)
    if (error) { toast.error('Failed to update WhatsApp status'); return }
    onUpdate(data as SpcMember)
    // Recalculate score for this member
    fetch('/api/spc/recalculate-scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails: [member.email?.toLowerCase()] }),
    }).then(async (res) => {
      if (res.ok) {
        // Refresh member score from DB
        const { data: refreshed } = await supabase.from('spc_members').select('*').eq('id', member.id).single()
        if (refreshed) onUpdate(refreshed as SpcMember)
      }
    }).catch(() => {/* non-critical */})
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleToggle}
        disabled={toggling}
        className={cn(
          'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all',
          isActive
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50'
            : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700',
          toggling && 'opacity-60 cursor-not-allowed'
        )}
      >
        <span className={cn('w-2 h-2 rounded-full', isActive ? 'bg-green-500' : 'bg-zinc-400')} />
        {toggling ? 'Updating…' : isActive ? 'WhatsApp activo' : 'Sin acceso a WhatsApp'}
      </button>
      {isActive && member.whatsapp_joined_at && (
        <p className="text-xs text-zinc-400">Joined: {formatDate(member.whatsapp_joined_at)}</p>
      )}
    </div>
  )
}

export default function SpcPage() {
  const supabase = useMemo(() => createClient(), [])
  const [members, setMembers] = useState<SpcMember[]>([])
  const [cancellations, setCancellations] = useState<SpcCancellation[]>([])
  const [spcTransactions, setSpcTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  // Modal state
  const { profile } = useProfile()
  const isAdmin = profile?.role === 'admin'
  const [selectedMember, setSelectedMember] = useState<SelectedMember | null>(null)
  const [notes, setNotes] = useState<SpcMemberNote[]>([])
  const [noteText, setNoteText] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [lastNoteByEmail, setLastNoteByEmail] = useState<Record<string, string>>({})
  const [highlightNotes, setHighlightNotes] = useState(false)

  // ── Zoom CSV upload state ─────────────────────────────────────────────────
  const [zoomModalOpen, setZoomModalOpen] = useState(false)
  const [zoomCsvContent, setZoomCsvContent] = useState('')
  const [zoomFileName, setZoomFileName] = useState('')
  const [zoomImporting, setZoomImporting] = useState(false)
  const [recalculating, setRecalculating] = useState(false)

  async function handleRecalculateScores() {
    setRecalculating(true)
    try {
      const res = await fetch('/api/spc/recalculate-scores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const data = await res.json()
      if (data.error) { toast.error(`Score recalc failed: ${data.error}`); return }
      toast.success(`Scores updated for ${data.updated} members`)
      const membersRes = await supabase.from('spc_members').select('*').order('joined_at', { ascending: false })
      if (membersRes.data) setMembers(membersRes.data)
    } catch {
      toast.error('Score recalculation failed')
    } finally {
      setRecalculating(false)
    }
  }
  const [backfillingPayments, setBackfillingPayments] = useState(false)

  async function handleBackfillNextPayment() {
    setBackfillingPayments(true)
    try {
      const res = await fetch('/api/spc/backfill-next-payment')
      const data = await res.json()
      if (data.error) { toast.error(`Backfill failed: ${data.error}`); return }
      toast.success(`Updated ${data.updated} members' next payment date${data.no_transactions ? ` (${data.no_transactions} without transactions)` : ''}`)
      const membersRes = await supabase.from('spc_members').select('*').order('joined_at', { ascending: false })
      if (membersRes.data) setMembers(membersRes.data)
    } catch {
      toast.error('Backfill failed')
    } finally {
      setBackfillingPayments(false)
    }
  }

  const [backfillingConversions, setBackfillingConversions] = useState(false)

  async function handleBackfillConversions() {
    setBackfillingConversions(true)
    try {
      const res = await fetch('/api/spc/backfill-trial-conversions')
      const data = await res.json()
      console.log('[Backfill Conversions] Full response:', JSON.stringify(data, null, 2))
      if (data.error) { toast.error(`Backfill failed: ${data.error}`); return }
      toast.success(
        `Trial conversions: ${data.trial_emails_found} trials found, ${data.confirmed_conversions} converted, ${data.updated_in_db} updated in DB${data.already_marked ? `, ${data.already_marked} already marked` : ''}`
      )
      const membersRes = await supabase.from('spc_members').select('*').order('joined_at', { ascending: false })
      if (membersRes.data) setMembers(membersRes.data)
    } catch (err) {
      console.error('[Backfill Conversions] Error:', err)
      toast.error('Backfill failed')
    } finally {
      setBackfillingConversions(false)
    }
  }

  const [zoomResult, setZoomResult] = useState<{ class_date?: string; total?: number; matched?: number; unmatched?: number; error?: string } | null>(null)

  // ── Member attendance (loaded per modal open) ─────────────────────────────
  const [memberAttendance, setMemberAttendance] = useState<SpcClassAttendance[]>([])

  async function fetchAttendance(email: string) {
    const { data } = await supabase
      .from('spc_class_attendance')
      .select('*')
      .eq('member_email', email.toLowerCase())
      .order('class_date', { ascending: false })
    setMemberAttendance(data ?? [])
  }

  async function handleZoomImport() {
    if (!zoomCsvContent.trim()) return
    setZoomImporting(true)
    setZoomResult(null)
    try {
      const res = await fetch('/api/spc/zoom-attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: zoomCsvContent }),
      })
      const data = await res.json()
      setZoomResult(data)
      if (!data.error) {
        toast.success(`Attendance uploaded: ${data.matched} matched members`)
        // Refresh member scores
        setMembers((prev) => prev.map((m) => m)) // trigger re-render after scores update
        const membersRes = await supabase.from('spc_members').select('*').order('joined_at', { ascending: false })
        if (membersRes.data) setMembers(membersRes.data)
      } else {
        toast.error(data.error)
      }
    } catch {
      toast.error('Upload failed')
    } finally {
      setZoomImporting(false)
    }
  }

  // ── CSV upload state ──────────────────────────────────────────────────────
  const [csvModalOpen, setCsvModalOpen] = useState(false)
  const [csvSource, setCsvSource] = useState<'kajabi' | 'ghl'>('kajabi')
  const [csvMode, setCsvMode] = useState<'cancellations' | 'members'>('cancellations')
  const [cancelPage, setCancelPage] = useState(0)
  const CANCEL_PAGE_SIZE = 50

  // Search & sort state
  const [activeSearch, setActiveSearch] = useState('')
  const [trialSearch, setTrialSearch] = useState('')
  const [cancelSearch, setCancelSearch] = useState('')
  const [activeSort, setActiveSort] = useState<ActiveSort>('joined_desc')
  const [trialSort, setTrialSort] = useState<TrialSort>('trial_start_desc')
  const [cancelSort, setCancelSort] = useState<CancelSort>('cancelled_desc')
  const [expiredSearch, setExpiredSearch] = useState('')
  const [expiredSort, setExpiredSort] = useState<ExpiredSort>('days_expired_desc')
  const [growthPeriod, setGrowthPeriod] = useState<GrowthPeriod>('this_month')

  // Cancellation filters
  const [cancelDateFrom, setCancelDateFrom] = useState('')
  const [cancelDateTo, setCancelDateTo] = useState('')
  const [cancelTypeFilter, setCancelTypeFilter] = useState<'all' | 'paid' | 'trial' | 'pending' | 'unknown_date'>('all')
  const [cancelPlatformFilter, setCancelPlatformFilter] = useState<string>('all')
  const [csvContent, setCsvContent] = useState('')
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvPreviewRows, setCsvPreviewRows] = useState<string[][]>([])
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    // Legacy Kajabi / members mode fields
    imported?: number; updated?: number; skipped?: number;
    // GHL unified fields
    parsed_total?: number;
    total_rows?: number;
    cancelled_rows_found?: number;
    status_counts?: Record<string, number>;
    cancellations_inserted?: number;
    cancellations_upserted?: number;
    trial_cancels_imported?: number;
    paid_cancels_imported?: number;
    members_updated_to_cancelled?: number;
    members_updated_to_trial?: number;
    members_updated_to_active?: number;
    new_members_inserted?: number;
    skipped_already_cancelled?: number;
    // Shared
    cancelled?: number;
    errors?: string[];
    error?: string;
  } | null>(null)

  const fetchNotes = useCallback(async (memberId: string) => {
    const { data } = await supabase
      .from('spc_member_notes')
      .select('*')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false })
    setNotes(data ?? [])
  }, [supabase])

  function openModal(member: SelectedMember, focusNotes = false) {
    setSelectedMember(member)
    setNoteText('')
    setHighlightNotes(focusNotes)
    setMemberAttendance([])
    const email = member.data.email
    if (email) {
      fetchNotes(email)
      if (member.kind === 'member') fetchAttendance(email)
    } else {
      setNotes([])
    }
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
      const [membersResult, cancelsResult, txResult, notesResult] = await Promise.all([
        supabase.from('spc_members').select('*').order('joined_at', { ascending: false }),
        supabase.from('spc_cancellations').select('*').order('cancelled_at', { ascending: false }),
        supabase
          .from('transactions')
          .select('*')
          .ilike('offer_title', '%Secure Parent%')
          .order('date', { ascending: false }),
        supabase.from('spc_member_notes').select('member_id, created_at'),
      ])
      setMembers(membersResult.data ?? [])
      setCancellations(cancelsResult.data ?? [])
      setSpcTransactions(
        (txResult.data ?? []).filter(
          (tx: Transaction) => getCanonicalProduct(tx.offer_title ?? '') === 'Secure Parent Collective'
        )
      )
      // Build last-note-at map keyed by lowercase email
      const noteMap: Record<string, string> = {}
      for (const n of (notesResult.data ?? [])) {
        const key = (n.member_id ?? '').toLowerCase()
        if (!key) continue
        if (!noteMap[key] || n.created_at > noteMap[key]) noteMap[key] = n.created_at
      }
      setLastNoteByEmail(noteMap)
      setLoading(false)
    }
    fetchData()
  }, [])

  // ── Transactions grouped by member email ─────────────────────────────────
  const transactionsByEmail = useMemo(() => {
    const map: Record<string, Transaction[]> = {}
    for (const tx of spcTransactions) {
      const email = (tx.buyer_email ?? '').toLowerCase()
      if (!email) continue
      if (!map[email]) map[email] = []
      map[email].push(tx) // already ordered desc from the query
    }
    return map
  }, [spcTransactions])

  // ── Last completed payment date per member email ──────────────────────────
  const lastPaymentByEmail = useMemo(() => {
    const map: Record<string, string> = {}
    for (const tx of spcTransactions) {
      if (tx.status !== 'completed') continue
      const email = (tx.buyer_email ?? '').toLowerCase()
      if (!email) continue
      if (!map[email] || tx.date > map[email]) map[email] = tx.date
    }
    return map
  }, [spcTransactions])

  // ── Date anchors ─────────────────────────────────────────────────────────
  const now = new Date()
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10)

  // ── Members ───────────────────────────────────────────────────────────────
  const activeMembers = useMemo(
    () => [...members.filter((m) => m.status === 'active')].sort((a, b) => (b.lead_score ?? 0) - (a.lead_score ?? 0)),
    [members]
  )
  const trialMembers = useMemo(
    () => members.filter((m) => m.status === 'trial'),
    [members]
  )
  const expiredMembers = useMemo(
    () => [...members.filter((m) => m.status === 'expired')].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')),
    [members]
  )

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

  const sortedTrials = [...trialMembers].sort((a, b) => (b.lead_score ?? 0) - (a.lead_score ?? 0))

  // ── Filtered & sorted lists ─────────────────────────────────────────────
  function matchesSearch(name: string | null, email: string | null, q: string): boolean {
    if (!q) return true
    const lower = q.toLowerCase()
    return (name ?? '').toLowerCase().includes(lower) || (email ?? '').toLowerCase().includes(lower)
  }

  const filteredActiveMembers = useMemo(() => {
    let list = activeMembers.filter((m) => matchesSearch(m.name, m.email, activeSearch))
    switch (activeSort) {
      case 'joined_desc': list.sort((a, b) => (b.joined_at ?? '').localeCompare(a.joined_at ?? '')); break
      case 'joined_asc': list.sort((a, b) => (a.joined_at ?? '').localeCompare(b.joined_at ?? '')); break
      case 'last_payment_desc': list.sort((a, b) => (lastPaymentByEmail[(b.email ?? '').toLowerCase()] ?? '').localeCompare(lastPaymentByEmail[(a.email ?? '').toLowerCase()] ?? '')); break
      case 'last_payment_asc': list.sort((a, b) => (lastPaymentByEmail[(a.email ?? '').toLowerCase()] ?? '').localeCompare(lastPaymentByEmail[(b.email ?? '').toLowerCase()] ?? '')); break
      case 'score_desc': list.sort((a, b) => (b.lead_score ?? 0) - (a.lead_score ?? 0)); break
      case 'last_note_desc': list.sort((a, b) => (lastNoteByEmail[(b.email ?? '').toLowerCase()] ?? '').localeCompare(lastNoteByEmail[(a.email ?? '').toLowerCase()] ?? '')); break
    }
    return list
  }, [activeMembers, activeSearch, activeSort, lastPaymentByEmail, lastNoteByEmail])

  const filteredTrialMembers = useMemo(() => {
    let list = sortedTrials.filter((m) => matchesSearch(m.name, m.email, trialSearch))
    switch (trialSort) {
      case 'trial_start_desc': list.sort((a, b) => (b.joined_at ?? '').localeCompare(a.joined_at ?? '')); break
      case 'trial_start_asc': list.sort((a, b) => (a.joined_at ?? '').localeCompare(b.joined_at ?? '')); break
      case 'expires_asc': list.sort((a, b) => (a.trial_end_date ?? '').localeCompare(b.trial_end_date ?? '')); break
      case 'score_desc': list.sort((a, b) => (b.lead_score ?? 0) - (a.lead_score ?? 0)); break
      case 'last_note_desc': list.sort((a, b) => (lastNoteByEmail[(b.email ?? '').toLowerCase()] ?? '').localeCompare(lastNoteByEmail[(a.email ?? '').toLowerCase()] ?? '')); break
    }
    return list
  }, [sortedTrials, trialSearch, trialSort, lastNoteByEmail])

  function daysExpired(m: SpcMember): number {
    const npd = m.next_payment_date
    if (!npd) return 0
    return Math.max(0, Math.floor((Date.now() - new Date(npd).getTime()) / (1000 * 60 * 60 * 24)))
  }

  const filteredExpiredMembers = useMemo(() => {
    let list = expiredMembers.filter((m) => matchesSearch(m.name, m.email, expiredSearch))
    switch (expiredSort) {
      case 'joined_desc': list.sort((a, b) => (b.joined_at ?? '').localeCompare(a.joined_at ?? '')); break
      case 'joined_asc': list.sort((a, b) => (a.joined_at ?? '').localeCompare(b.joined_at ?? '')); break
      case 'last_payment_desc': list.sort((a, b) => (lastPaymentByEmail[(b.email ?? '').toLowerCase()] ?? '').localeCompare(lastPaymentByEmail[(a.email ?? '').toLowerCase()] ?? '')); break
      case 'score_desc': list.sort((a, b) => (b.lead_score ?? 0) - (a.lead_score ?? 0)); break
      case 'days_expired_desc': list.sort((a, b) => daysExpired(b) - daysExpired(a)); break
    }
    return list
  }, [expiredMembers, expiredSearch, expiredSort, lastPaymentByEmail])

  const cancelFiltersActive = useMemo(() => {
    let count = 0
    if (cancelDateFrom) count++
    if (cancelDateTo) count++
    if (cancelTypeFilter !== 'all') count++
    if (cancelPlatformFilter !== 'all') count++
    return count
  }, [cancelDateFrom, cancelDateTo, cancelTypeFilter, cancelPlatformFilter])

  function resetCancelFilters() {
    setCancelDateFrom('')
    setCancelDateTo('')
    setCancelTypeFilter('all')
    setCancelPlatformFilter('all')
    setCancelSearch('')
    setCancelPage(0)
  }

  const cancelPlatforms = useMemo(() => {
    const set = new Set<string>()
    for (const c of cancellations) {
      const src = (c.source ?? '').trim()
      if (src) set.add(src)
    }
    return Array.from(set).sort()
  }, [cancellations])

  const filteredCancellations = useMemo(() => {
    let list = cancellations.filter((c) => matchesSearch(c.name, c.email, cancelSearch))

    // Date range filter
    if (cancelDateFrom) {
      list = list.filter((c) => c.cancelled_at && c.cancelled_at.slice(0, 10) >= cancelDateFrom)
    }
    if (cancelDateTo) {
      list = list.filter((c) => c.cancelled_at && c.cancelled_at.slice(0, 10) <= cancelDateTo)
    }

    // Cancel type filter
    switch (cancelTypeFilter) {
      case 'paid': list = list.filter(isPaidCancel); break
      case 'trial': list = list.filter(isTrialCancel); break
      case 'pending': list = list.filter((c) => !isPaidCancel(c) && !isTrialCancel(c)); break
      case 'unknown_date': list = list.filter((c) => !c.cancelled_at); break
    }

    // Platform filter
    if (cancelPlatformFilter !== 'all') {
      list = list.filter((c) => (c.source ?? '').toLowerCase() === cancelPlatformFilter.toLowerCase())
    }

    switch (cancelSort) {
      case 'cancelled_desc': list.sort((a, b) => (b.cancelled_at ?? '').localeCompare(a.cancelled_at ?? '')); break
      case 'cancelled_asc': list.sort((a, b) => (a.cancelled_at ?? '').localeCompare(b.cancelled_at ?? '')); break
      case 'subscribed_desc': list.sort((a, b) => (b.subscribed_at ?? '').localeCompare(a.subscribed_at ?? '')); break
      case 'subscribed_asc': list.sort((a, b) => (a.subscribed_at ?? '').localeCompare(b.subscribed_at ?? '')); break
      case 'days_active_desc': list.sort((a, b) => {
        const da = a.subscribed_at && a.cancelled_at ? daysActive(a.subscribed_at, a.cancelled_at) : 0
        const db = b.subscribed_at && b.cancelled_at ? daysActive(b.subscribed_at, b.cancelled_at) : 0
        return db - da
      }); break
    }
    return list
  }, [cancellations, cancelSearch, cancelSort, cancelDateFrom, cancelDateTo, cancelTypeFilter, cancelPlatformFilter])

  // ── Cancellation metrics ─────────────────────────────────────────────────
  const paidCancels = cancellations.filter(isPaidCancel)
  const trialCancels = cancellations.filter(isTrialCancel)
  const pendingCancels = cancellations.filter((c) => !isPaidCancel(c) && !isTrialCancel(c))
  // Non-trial cancellations = paid + pending (CSV imports without type info)
  const nonTrialCancels = cancellations.filter((c) => !isTrialCancel(c))
  // Only count cancellations with a known cancelled_at date for churn
  const thisMonthCancels = nonTrialCancels.filter((c) => {
    if (!c.cancelled_at) return false
    const d = new Date(c.cancelled_at)
    const now2 = new Date()
    return d.getFullYear() === now2.getFullYear() && d.getMonth() === now2.getMonth()
  })
  const unknownDateCancels = cancellations.filter((c) => !c.cancelled_at).length

  const mrrLost = paidCancels
    .filter((c) => c.cancelled_at && (c.cancelled_at.slice(0, 10) >= sixtyDaysAgo))
    .reduce((s, c) => s + (c.plan === 'annual' ? c.amount / 12 : c.amount), 0)

  // Trial churn rate
  const currentTrialCount = members.filter((m) => m.status === 'trial').length
  const totalTrialsEver = currentTrialCount + trialCancels.length +
    members.filter((m) => m.status === 'active' && (m.trial_end_date != null || (m.trial_days ?? 0) > 0)).length
  const trialChurnRate = totalTrialsEver > 0
    ? parseFloat(((trialCancels.length / totalTrialsEver) * 100).toFixed(1))
    : 0

  // Trial → paid conversion rate
  const convertedTrials = members.filter(
    (m) => m.status === 'active' && (m.trial_end_date != null || (m.trial_days ?? 0) > 0)
  ).length
  const trialConversionDenominator = convertedTrials + trialCancels.length
  const trialConversionRate = trialConversionDenominator > 0
    ? parseFloat(((convertedTrials / trialConversionDenominator) * 100).toFixed(1))
    : 0

  const cancelsThisMonth = thisMonthCancels.length
  const membersAtStartOfMonth = activeMembers.length + cancelsThisMonth
  const churnRate = membersAtStartOfMonth > 0
    ? parseFloat(((cancelsThisMonth / membersAtStartOfMonth) * 100).toFixed(1))
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
    revenue: cancellations.filter((c) => c.cancelled_at && c.cancelled_at.slice(0, 7) === month).length,
  }))

  // ── Growth period range ──────────────────────────────────────────────────
  const growthRange = useMemo(() => {
    const today = new Date()
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    const end = fmt(today)
    switch (growthPeriod) {
      case 'this_month': return { start: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10), end }
      case 'last_30d': { const d = new Date(today); d.setDate(d.getDate() - 30); return { start: fmt(d), end } }
      case 'last_90d': { const d = new Date(today); d.setDate(d.getDate() - 90); return { start: fmt(d), end } }
      case 'this_year': return { start: `${today.getFullYear()}-01-01`, end }
      case 'all': return { start: null, end }
    }
  }, [growthPeriod])

  const growthPeriodLabel = useMemo(() => {
    if (!growthRange.start) return 'All time'
    const fmtD = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    return `${fmtD(growthRange.start)} – ${fmtD(growthRange.end)}`
  }, [growthRange])

  function inGrowthPeriod(dateStr: string | null | undefined): boolean {
    if (!dateStr) return false
    const d = dateStr.slice(0, 10)
    if (growthRange.start && d < growthRange.start) return false
    if (d > growthRange.end) return false
    return true
  }

  // Churn scoped to growth period
  const growthNonTrialCancels = useMemo(() =>
    nonTrialCancels.filter((c) => {
      if (!c.cancelled_at) return false
      return inGrowthPeriod(c.cancelled_at)
    }),
    [nonTrialCancels, growthRange] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const growthCancelsCount = growthNonTrialCancels.length
  const growthMembersAtStart = activeMembers.length + growthCancelsCount
  const growthChurnRate = growthMembersAtStart > 0
    ? parseFloat(((growthCancelsCount / growthMembersAtStart) * 100).toFixed(1))
    : 0
  const growthChurnColor = growthChurnRate < 3 ? 'text-green-600' : growthChurnRate <= 6 ? 'text-amber-600' : 'text-red-600'
  const growthChurnBadge = growthChurnRate < 3 ? 'bg-green-100 text-green-700' : growthChurnRate <= 6 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'

  // Trial churn scoped to growth period
  const growthTrialCancels = useMemo(() =>
    trialCancels.filter((c) => inGrowthPeriod(c.cancelled_at)),
    [trialCancels, growthRange] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const growthTrialCancelsCount = growthTrialCancels.length
  const growthTrialChurnDenom = growthTrialCancelsCount + trialMembers.length
  const growthTrialChurnRate = growthTrialChurnDenom > 0
    ? parseFloat(((growthTrialCancelsCount / growthTrialChurnDenom) * 100).toFixed(1))
    : 0

  // New members in growth period
  const growthNewMembers = useMemo(() =>
    [...activeMembers].filter((m) => inGrowthPeriod(m.joined_at)).sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')),
    [activeMembers, growthRange] // eslint-disable-line react-hooks/exhaustive-deps
  )

  // ── Cancellation timeline (scoped to growth period) ──────────────────────
  const cancelTimelineData = useMemo(() => {
    const periodCancels = cancellations.filter((c) => c.cancelled_at && inGrowthPeriod(c.cancelled_at))
    const start = growthRange.start ? new Date(growthRange.start + 'T12:00:00') : null
    const end = new Date(growthRange.end + 'T12:00:00')
    const diffDays = start ? Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1 : 0

    // Choose grouping: day (<= 60), week (<= 180), month (> 180 or all)
    const groupBy = !start || diffDays > 180 ? 'month' : diffDays > 60 ? 'week' : 'day'

    if (groupBy === 'day' && start) {
      const result: { date: string; paid: number; trial: number }[] = []
      for (let i = 0; i < diffDays; i++) {
        const d = new Date(start)
        d.setDate(d.getDate() + i)
        const iso = d.toISOString().slice(0, 10)
        const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        let paid = 0, trial = 0
        for (const c of periodCancels) {
          if (c.cancelled_at!.slice(0, 10) !== iso) continue
          if (isPaidCancel(c)) paid++; else if (isTrialCancel(c)) trial++
        }
        result.push({ date: label, paid, trial })
      }
      return result
    }

    if (groupBy === 'week' && start) {
      const buckets: Record<string, { paid: number; trial: number }> = {}
      for (let i = 0; i < diffDays; i += 7) {
        const d = new Date(start)
        d.setDate(d.getDate() + i)
        const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const endOfWeek = new Date(d)
        endOfWeek.setDate(endOfWeek.getDate() + 6)
        const wStart = d.toISOString().slice(0, 10)
        const wEnd = endOfWeek.toISOString().slice(0, 10)
        let paid = 0, trial = 0
        for (const c of periodCancels) {
          const cd = c.cancelled_at!.slice(0, 10)
          if (cd >= wStart && cd <= wEnd) {
            if (isPaidCancel(c)) paid++; else if (isTrialCancel(c)) trial++
          }
        }
        buckets[label] = { paid, trial }
      }
      return Object.entries(buckets).map(([date, v]) => ({ date, ...v }))
    }

    // month grouping
    const monthBuckets: Record<string, { paid: number; trial: number }> = {}
    for (const c of periodCancels) {
      const m = c.cancelled_at!.slice(0, 7)
      if (!monthBuckets[m]) monthBuckets[m] = { paid: 0, trial: 0 }
      if (isPaidCancel(c)) monthBuckets[m].paid++; else if (isTrialCancel(c)) monthBuckets[m].trial++
    }
    return Object.entries(monthBuckets).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({
      date: new Date(k + '-01T12:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      ...v,
    }))
  }, [cancellations, growthRange]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Growth tab calculations ─────────────────────────────────────────────
  const mrrNowMonthly = activeMembers
    .filter((m) => m.plan === 'monthly')
    .reduce((s, m) => s + m.amount, 0)
  const mrrNowAnnual = activeMembers
    .filter((m) => m.plan === 'annual')
    .reduce((s, m) => s + m.amount / 12, 0)

  const growthNewMembersCount = growthNewMembers.length

  // Previous equivalent period for comparison
  const prevPeriodNewCount = useMemo(() => {
    if (!growthRange.start) return 0 // "all time" has no previous period
    const start = new Date(growthRange.start + 'T12:00:00')
    const end = new Date(growthRange.end + 'T12:00:00')
    const durationMs = end.getTime() - start.getTime()
    const prevEnd = new Date(start.getTime() - 1) // day before period start
    const prevStart = new Date(prevEnd.getTime() - durationMs)
    const ps = prevStart.toISOString().slice(0, 10)
    const pe = prevEnd.toISOString().slice(0, 10)
    return activeMembers.filter((m) => {
      const j = (m.joined_at ?? '').slice(0, 10)
      return j >= ps && j <= pe
    }).length
  }, [activeMembers, growthRange])

  const growthPct = prevPeriodNewCount > 0
    ? Math.round(((growthNewMembersCount - prevPeriodNewCount) / prevPeriodNewCount) * 100)
    : growthNewMembersCount > 0 ? 100 : 0

  // MRR & ARR added by new members in period
  const mrrAddedInPeriod = growthNewMembers.reduce((s, m) =>
    s + (m.plan === 'annual' ? m.amount / 12 : m.amount), 0)
  const arrAddedInPeriod = growthNewMembers.reduce((s, m) =>
    s + (m.plan === 'annual' ? m.amount : m.amount * 12), 0)

  // Verified trial conversions — all time
  const totalVerifiedConversions = useMemo(() => {
    const converted = members.filter((m) => m.converted_from_trial)
    console.log('[SPC] Members with converted_from_trial:', converted.length,
      '| Sample:', converted.slice(0, 3).map((m) => ({ email: m.email, status: m.status, converted_from_trial: m.converted_from_trial, converted_at: m.converted_at })),
      '| Total members:', members.length,
      '| Active members:', activeMembers.length
    )
    return converted.filter((m) => m.status === 'active').length
  }, [members, activeMembers])

  const totalTrialCancels = trialCancels.length
  const allTimeConversionRate = (totalVerifiedConversions + totalTrialCancels) > 0
    ? parseFloat(((totalVerifiedConversions / (totalVerifiedConversions + totalTrialCancels)) * 100).toFixed(1))
    : 0

  // Verified trial conversions in period
  const verifiedConversionCount = useMemo(() => {
    if (!growthRange.start) return totalVerifiedConversions // "All time" → show all
    return members.filter((m) =>
      m.converted_from_trial && m.status === 'active' && m.converted_at && inGrowthPeriod(m.converted_at)
    ).length
  }, [members, growthRange, totalVerifiedConversions]) // eslint-disable-line react-hooks/exhaustive-deps
  const growthConversionRate = (verifiedConversionCount + growthTrialCancelsCount) > 0
    ? parseFloat(((verifiedConversionCount / (verifiedConversionCount + growthTrialCancelsCount)) * 100).toFixed(1))
    : 0

  const progressMax = Math.max(monthlyCount, annualCount, 1)

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
    if (!m.trial_end_date) return <span className="text-xs text-zinc-400">—</span>
    const days = daysUntil(m.trial_end_date)
    if (days < 0) return <StatusPill label="Expired" variant="danger" />
    if (days <= 3) return <span className="text-xs font-semibold text-red-600 dark:text-red-400">{days}d left</span>
    if (days <= 7) return <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">{days}d left</span>
    if (days <= 14) return <span className="text-xs font-semibold text-green-600 dark:text-green-400">{days}d left</span>
    return <span className="text-xs text-zinc-500 dark:text-zinc-400">{days}d left</span>
  }

  // ── Export CSV ──────────────────────────────────────────────────────────
  function csvEscape(v: string | number | null | undefined): string {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }

  function downloadCSV(data: string, filename: string) {
    const blob = new Blob([data], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const todayStr = new Date().toISOString().slice(0, 10)

  function exportActiveMembers() {
    const header = 'Name,Email,Phone,Plan,Amount,Provider,Joined,Last Payment,Next Payment,Score,WhatsApp Active,Last Note Date'
    const rows = filteredActiveMembers.map((m) => [
      csvEscape(m.name), csvEscape(m.email), csvEscape(m.phone),
      m.plan, m.amount, m.provider, m.joined_at ?? '',
      lastPaymentByEmail[(m.email ?? '').toLowerCase()] ?? '',
      m.next_payment_date ?? calcNextPaymentISO(transactionsByEmail[(m.email ?? '').toLowerCase()], m.plan, m.joined_at),
      m.lead_score ?? 0, m.whatsapp_active ? 'Yes' : 'No',
      lastNoteByEmail[(m.email ?? '').toLowerCase()] ?? '',
    ].join(','))
    downloadCSV([header, ...rows].join('\n'), `spc-active-members-${todayStr}.csv`)
    toast.success(`Exported ${rows.length} active members`)
  }

  function exportTrials() {
    const header = 'Name,Email,Phone,Plan,Provider,Trial Start,Expires,Days Left,Score,Last Note Date'
    const rows = filteredTrialMembers.map((m) => [
      csvEscape(m.name), csvEscape(m.email), csvEscape(m.phone),
      m.plan, m.provider, m.joined_at ?? '',
      m.trial_end_date ?? '', m.trial_end_date ? daysUntil(m.trial_end_date) : '',
      m.lead_score ?? 0, lastNoteByEmail[(m.email ?? '').toLowerCase()] ?? '',
    ].join(','))
    downloadCSV([header, ...rows].join('\n'), `spc-free-trials-${todayStr}.csv`)
    toast.success(`Exported ${rows.length} free trials`)
  }

  function exportExpired() {
    const header = 'Name,Email,Phone,Plan,Amount,Provider,Joined,Last Payment,Next Payment,Days Expired,Score,Last Note Date'
    const rows = filteredExpiredMembers.map((m) => [
      csvEscape(m.name), csvEscape(m.email), csvEscape(m.phone),
      m.plan, m.amount, m.provider, m.joined_at ?? '',
      lastPaymentByEmail[(m.email ?? '').toLowerCase()] ?? '',
      m.next_payment_date ?? '', daysExpired(m),
      m.lead_score ?? 0, lastNoteByEmail[(m.email ?? '').toLowerCase()] ?? '',
    ].join(','))
    downloadCSV([header, ...rows].join('\n'), `spc-expired-${todayStr}.csv`)
    toast.success(`Exported ${rows.length} expired members`)
  }

  function exportCancellations() {
    const header = 'Name,Email,Phone,Type,Plan,Amount,Platform,Subscribed,Cancelled At,Days Active,Last Note Date'
    const rows = filteredCancellations.map((c) => {
      const type = isTrialCancel(c) ? 'Trial' : isPaidCancel(c) ? 'Paid' : 'Pending'
      const days = c.subscribed_at && c.cancelled_at ? daysActive(c.subscribed_at, c.cancelled_at) : ''
      return [
        csvEscape(c.name), csvEscape(c.email), csvEscape(c.customer_phone),
        type, c.plan ?? '', c.amount, c.source ?? '',
        c.subscribed_at ?? '', c.cancelled_at ?? '', days,
        lastNoteByEmail[(c.email ?? '').toLowerCase()] ?? '',
      ].join(',')
    })
    downloadCSV([header, ...rows].join('\n'), `spc-cancellations-${todayStr}.csv`)
    toast.success(`Exported ${rows.length} cancellations`)
  }

  // ── CSV helpers ───────────────────────────────────────────────────────────
  function parseCSVPreview(text: string, maxRows: number): { headers: string[]; rows: string[][] } {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
    if (lines.length === 0) return { headers: [], rows: [] }
    function parseRow(line: string): string[] {
      const fields: string[] = []
      let current = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
          else inQuotes = !inQuotes
        } else if (ch === ',' && !inQuotes) { fields.push(current); current = '' }
        else current += ch
      }
      fields.push(current)
      return fields
    }
    const headers = parseRow(lines[0])
    const rows = lines.slice(1, maxRows + 1).filter((l) => l.trim()).map(parseRow)
    return { headers, rows }
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportResult(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      setCsvContent(text)
      const { headers, rows } = parseCSVPreview(text, 5)
      setCsvHeaders(headers)
      setCsvPreviewRows(rows)
    }
    reader.readAsText(file)
  }

  async function handleImport() {
    if (!csvContent) return
    setImporting(true)
    const res = await fetch('/api/spc/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: csvContent, source: csvSource, mode: csvMode }),
    })
    const data = await res.json()
    setImporting(false)
    setImportResult(data)
    if (!res.ok) return

    // Determine what changed and refresh accordingly
    const hasNewCancels = (data.cancellations_upserted ?? data.cancellations_inserted ?? data.cancelled ?? data.imported ?? 0) > 0
    const hasMemberChanges = (data.members_updated_to_cancelled ?? 0) + (data.members_updated_to_trial ?? 0) +
      (data.members_updated_to_active ?? 0) + (data.new_members_inserted ?? 0) + (data.updated ?? 0) + (data.imported ?? 0) > 0

    const refreshes: Promise<void>[] = []
    if (hasNewCancels || csvMode === 'cancellations') {
      refreshes.push(
        Promise.resolve(
          supabase.from('spc_cancellations').select('*').order('cancelled_at', { ascending: false })
        ).then(({ data }) => { if (data) setCancellations(data) })
      )
    }
    if (hasMemberChanges || csvMode === 'members') {
      refreshes.push(
        Promise.resolve(
          supabase.from('spc_members').select('*').order('joined_at', { ascending: false })
        ).then(({ data }) => { if (data) setMembers(data) })
      )
    }
    await Promise.all(refreshes)
  }

  function resetCsvModal() {
    setCsvModalOpen(false)
    setCsvSource('kajabi')
    setCsvMode('cancellations')
    setCsvContent('')
    setCsvHeaders([])
    setCsvPreviewRows([])
    setImportResult(null)
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'active', label: `Active Members${!loading ? ` (${activeMembers.length})` : ''}` },
    { key: 'trials', label: `Free Trials${!loading ? ` (${trialMembers.length})` : ''}` },
    { key: 'expired', label: `Expired${!loading ? ` (${expiredMembers.length})` : ''}` },
    { key: 'cancellations', label: `Cancellations${!loading ? ` (${cancellations.length})` : ''}` },
  ]

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto">
        <PageHeader title="Secure Parent Collective" description="Subscription members and free trials" />

        {/* Tab bar */}
        <div className="border-b border-zinc-200 dark:border-zinc-800 mb-6">
          <div className="flex items-end justify-between">
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
          <div className="pb-2 shrink-0 flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={handleRecalculateScores}
                disabled={recalculating}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-50 transition-colors"
              >
                {recalculating ? 'Recalculating…' : '↻ Recalculate Scores'}
              </button>
            )}
            {isAdmin && (
              <button
                onClick={handleBackfillNextPayment}
                disabled={backfillingPayments}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-50 transition-colors"
              >
                {backfillingPayments ? 'Backfilling…' : '↻ Backfill Payments'}
              </button>
            )}
            {isAdmin && (
              <button
                onClick={handleBackfillConversions}
                disabled={backfillingConversions}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-50 transition-colors"
              >
                {backfillingConversions ? 'Backfilling…' : '↻ Backfill Conversions'}
              </button>
            )}
            <button
              onClick={() => { setZoomModalOpen(true); setZoomCsvContent(''); setZoomFileName(''); setZoomResult(null) }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 bg-violet-600"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload Zoom Class
            </button>
            {isAdmin && (
              <button
                onClick={() => setCsvModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#185FA5' }}
              >
                <Upload className="h-3.5 w-3.5" />
                Upload CSV
              </button>
            )}
          </div>
          </div>
        </div>

        {/* ── CRECIMIENTO ───────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Period filter */}
            <div>
              <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden w-fit">
                {([
                  ['this_month', 'This month'],
                  ['last_30d', 'Last 30d'],
                  ['last_90d', 'Last 90d'],
                  ['this_year', 'This year'],
                  ['all', 'All time'],
                ] as [GrowthPeriod, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setGrowthPeriod(key)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium transition-colors border-r border-zinc-200 dark:border-zinc-700 last:border-r-0',
                      growthPeriod === key
                        ? 'bg-[#185FA5] text-white'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1.5">{growthPeriodLabel}</p>
            </div>

            {/* 1. KPI Comparison Cards */}
            <div className="w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
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
                      <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                        {activeMembers.length}
                      </p>
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                        growthNewMembersCount > 0 ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'
                      )}>
                        +{growthNewMembersCount} new in period
                      </span>
                      {growthRange.start && (
                        <p className={cn('text-[10px] mt-1', growthPct > 0 ? 'text-green-600' : growthPct < 0 ? 'text-red-600' : 'text-zinc-400')}>
                          {growthPct > 0 ? '↑' : growthPct < 0 ? '↓' : '→'} {Math.abs(growthPct)}% vs prev period ({prevPeriodNewCount})
                        </p>
                      )}
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
                      <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                        {formatCurrency(mrr)}
                      </p>
                      {mrrAddedInPeriod > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          +{formatCurrency(mrrAddedInPeriod)}/mo added
                        </span>
                      ) : (
                        <p className="text-xs text-zinc-500">current monthly recurring</p>
                      )}
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
                      <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                        {formatCurrency(arr)}
                      </p>
                      {arrAddedInPeriod > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          +{formatCurrency(arrAddedInPeriod)}/yr added
                        </span>
                      ) : (
                        <p className="text-xs text-zinc-500">projected annual</p>
                      )}
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
                        <span className={`text-2xl font-semibold ${growthChurnColor}`}>
                          {growthChurnRate}%
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {growthCancelsCount} / {growthMembersAtStart} members
                      </p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${growthChurnBadge}`}>
                        {growthCancelsCount} paid cancellations
                      </span>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Trial Conversions */}
              <Card>
                <CardContent className="pt-5 pb-4">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 font-medium uppercase tracking-wide">
                    Trial Conversions
                  </p>
                  {loading ? (
                    <div className="h-12 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                  ) : (
                    <>
                      <p className="text-2xl font-semibold text-green-600 dark:text-green-400">
                        {verifiedConversionCount}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">
                        {growthRange.start ? 'in period' : 'all time'} · verified trial → paid
                      </p>
                      {(verifiedConversionCount + growthTrialCancelsCount) > 0 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                          {growthConversionRate}% conversion rate
                        </span>
                      )}
                      {growthRange.start && totalVerifiedConversions > verifiedConversionCount && (
                        <p className="text-[10px] text-zinc-400 mt-1">{totalVerifiedConversions} total all time</p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Expired Members */}
              <Card>
                <CardContent className="pt-5 pb-4">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 font-medium uppercase tracking-wide">
                    Expired Members
                  </p>
                  {loading ? (
                    <div className="h-12 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                  ) : (
                    <>
                      <p className="text-2xl font-semibold text-amber-600 dark:text-amber-400">
                        {expiredMembers.length}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">potential recovery leads</p>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Trial churn muted stat */}
            {!loading && growthTrialCancelsCount > 0 && (
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 -mt-4 mb-6 px-0.5">
                Trial churn in period: {growthTrialChurnRate}% ({growthTrialCancelsCount} trial cancellation{growthTrialCancelsCount !== 1 ? 's' : ''})
              </p>
            )}

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

            {/* Cancellations timeline */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Cancellations Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-52 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={cancelTimelineData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fill: '#71717a' }}
                        axisLine={false}
                        tickLine={false}
                        interval={cancelTimelineData.length > 30 ? Math.floor(cancelTimelineData.length / 10) : cancelTimelineData.length > 15 ? 2 : 0}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#71717a' }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        formatter={(v) => <span className="text-xs">{v === 'paid' ? 'Paid' : 'Trial'}</span>}
                      />
                      <Line type="monotone" dataKey="paid" name="paid" stroke="#E24B4A" strokeWidth={2} dot={{ r: 3, fill: '#E24B4A' }} />
                      <Line type="monotone" dataKey="trial" name="trial" stroke="#EF9F27" strokeWidth={2} dot={{ r: 3, fill: '#EF9F27' }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Trial Conversion Scenarios */}
            {!loading && trialMembers.length > 0 && (() => {
              const ct = trialMembers.length
              const scenarios = [
                { rate: 0.3, label: '30%', cls: 'border-red-200 dark:border-red-800', badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
                { rate: 0.5, label: '50%', cls: 'border-amber-200 dark:border-amber-800', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
                { rate: 0.7, label: '70%', cls: 'border-blue-200 dark:border-blue-800', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
                { rate: 1.0, label: '100%', cls: 'border-green-200 dark:border-green-800', badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
              ]
              return (
                <Card className="mb-6">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">Trial Conversion Scenarios</CardTitle>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Projected impact if we improve trial to active conversion rate</p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {/* Current state */}
                      <div className="min-w-[180px] flex-1 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-4">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 mb-2">
                          Current · {allTimeConversionRate}% rate
                        </span>
                        <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mt-1">{formatCurrency(mrr)}</p>
                        <p className="text-[10px] text-zinc-400 uppercase font-medium">MRR</p>
                        <p className="text-xs text-zinc-500 mt-2">{formatCurrency(arr)} ARR</p>
                        <p className="text-xs text-zinc-500">{activeMembers.length} active · {totalVerifiedConversions} converted</p>
                        <p className="text-xs text-zinc-500">{ct} trials pending</p>
                      </div>
                      {/* Scenario cards */}
                      {scenarios.map(({ rate, label, cls, badge }) => {
                        const converted = Math.floor(ct * rate)
                        const newMrr = converted * 0.8 * 47 + converted * 0.2 * (470 / 12)
                        const projMrr = mrr + newMrr
                        const projArr = projMrr * 12
                        const projMembers = activeMembers.length + converted
                        return (
                          <div key={label} className={cn('min-w-[180px] flex-1 rounded-xl border-2 p-4', cls)}>
                            <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold mb-2', badge)}>
                              {label} conversion
                            </span>
                            <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mt-1">{formatCurrency(projMrr)}</p>
                            <p className="text-[10px] text-zinc-400 uppercase font-medium">Projected MRR</p>
                            <p className="text-xs text-zinc-500 mt-2">{formatCurrency(projArr)} ARR</p>
                            <p className="text-xs text-zinc-500">{projMembers} total members</p>
                            <p className="text-xs text-zinc-500">{converted} of {ct} converted</p>
                            <p className="text-xs font-medium text-green-600 dark:text-green-400 mt-1">+{formatCurrency(newMrr)}/mo vs current</p>
                          </div>
                        )
                      })}
                    </div>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-3 italic">
                      * Projections assume 80% monthly ($47) and 20% annual ($470/12 per month) plans
                    </p>
                  </CardContent>
                </Card>
              )
            })()}

            {/* 3. New Members List */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">
                  New active members
                  {!loading && (
                    <span className="ml-2 text-xs font-normal text-zinc-500">
                      ({growthNewMembers.length} in period)
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
                ) : growthNewMembers.length === 0 ? (
                  <EmptyState title="No new members" description="No members joined during this period." />
                ) : (
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {growthNewMembers.map((m, i) => (
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
            {/* Membership & Cohort charts */}
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
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <CardTitle className="text-sm font-semibold">{activeMembers.length} Active Members</CardTitle>
                <div className="flex items-center gap-2 sm:ml-auto">
                  <div className="relative flex-1 sm:flex-initial">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                    <input
                      type="text"
                      value={activeSearch}
                      onChange={(e) => setActiveSearch(e.target.value)}
                      placeholder="Search by name or email..."
                      className="w-full sm:w-56 text-xs border border-zinc-200 dark:border-zinc-700 rounded-md pl-8 pr-3 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                  <select
                    value={activeSort}
                    onChange={(e) => setActiveSort(e.target.value as ActiveSort)}
                    className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="joined_desc">Joined (newest)</option>
                    <option value="joined_asc">Joined (oldest)</option>
                    <option value="last_payment_desc">Last Payment (newest)</option>
                    <option value="last_payment_asc">Last Payment (oldest)</option>
                    <option value="score_desc">Score (highest)</option>
                    <option value="last_note_desc">Last Note (recent)</option>
                  </select>
                  {isAdmin && (
                    <button
                      onClick={exportActiveMembers}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                      title="Export CSV"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-2">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-10 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                  ))}
                </div>
              ) : filteredActiveMembers.length === 0 ? (
                <EmptyState title={activeSearch ? 'No matching members' : 'No active members'} description={activeSearch ? 'Try a different search term.' : 'Active subscribers will appear here.'} />
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
                        <TableHead className="hidden md:table-cell">Last Payment</TableHead>
                        <TableHead className="hidden md:table-cell">Next Payment</TableHead>
                        <TableHead className="hidden lg:table-cell">Score</TableHead>
                        <TableHead className="hidden lg:table-cell">Last Note</TableHead>
                      </AnimatedTableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredActiveMembers.map((m, i) => (
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
                          <TableCell className="text-xs text-zinc-500 whitespace-nowrap hidden md:table-cell">{m.joined_at ? formatDate(m.joined_at) : '—'}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap hidden md:table-cell">
                            {(() => {
                              const lp = lastPaymentByEmail[(m.email ?? '').toLowerCase()]
                              if (!lp) return <span className="text-zinc-400">—</span>
                              const overdue = isPaymentOverdue(lp, m.plan)
                              return (
                                <span className={overdue ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-zinc-500'}>
                                  {formatDate(lp)}
                                </span>
                              )
                            })()}
                          </TableCell>
                          <TableCell className="text-xs text-zinc-500 whitespace-nowrap hidden md:table-cell">
                            {m.next_payment_date
                              ? formatDate(m.next_payment_date)
                              : calcNextPayment(transactionsByEmail[(m.email ?? '').toLowerCase()], m.plan)}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {(() => {
                              const cfg = leadScoreConfig(m.lead_score)
                              return (
                                <span className="inline-flex items-center gap-1.5">
                                  <span className={cn('w-2 h-2 rounded-full shrink-0', cfg.dot)} />
                                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{m.lead_score ?? 0}</span>
                                </span>
                              )
                            })()}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell" onClick={(e) => e.stopPropagation()}>
                            <LastNoteCell
                              lastNoteAt={lastNoteByEmail[(m.email ?? '').toLowerCase()]}
                              onClick={(e) => { e.stopPropagation(); openModal({ kind: 'member', data: m }, true) }}
                            />
                          </TableCell>
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
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <CardTitle className="text-sm font-semibold">{trialMembers.length} Free Trials</CardTitle>
                  <div className="flex items-center gap-2 sm:ml-auto">
                    <div className="relative flex-1 sm:flex-initial">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                      <input
                        type="text"
                        value={trialSearch}
                        onChange={(e) => setTrialSearch(e.target.value)}
                        placeholder="Search by name or email..."
                        className="w-full sm:w-56 text-xs border border-zinc-200 dark:border-zinc-700 rounded-md pl-8 pr-3 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                    <select
                      value={trialSort}
                      onChange={(e) => setTrialSort(e.target.value as TrialSort)}
                      className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                    >
                      <option value="trial_start_desc">Trial Start (newest)</option>
                      <option value="trial_start_asc">Trial Start (oldest)</option>
                      <option value="expires_asc">Expires (soonest)</option>
                      <option value="score_desc">Score (highest)</option>
                      <option value="last_note_desc">Last Note (recent)</option>
                    </select>
                    {isAdmin && (
                      <button
                        onClick={exportTrials}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                        title="Export CSV"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-6 space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-10 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                    ))}
                  </div>
                ) : filteredTrialMembers.length === 0 ? (
                  <EmptyState title={trialSearch ? 'No matching trials' : 'No free trials'} description={trialSearch ? 'Try a different search term.' : 'Trial members will appear here.'} />
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
                          <TableHead className="hidden lg:table-cell">Score</TableHead>
                          <TableHead className="hidden lg:table-cell">Last Note</TableHead>
                        </AnimatedTableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTrialMembers.map((m, i) => (
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
                            <TableCell className="hidden lg:table-cell">
                              {(() => {
                                const cfg = leadScoreConfig(m.lead_score)
                                return (
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className={cn('w-2 h-2 rounded-full shrink-0', cfg.dot)} />
                                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{m.lead_score ?? 0}</span>
                                  </span>
                                )
                              })()}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell" onClick={(e) => e.stopPropagation()}>
                              <LastNoteCell
                                lastNoteAt={lastNoteByEmail[(m.email ?? '').toLowerCase()]}
                                onClick={(e) => { e.stopPropagation(); openModal({ kind: 'member', data: m }, true) }}
                              />
                            </TableCell>
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

        {/* ── EXPIRED ───────────────────────────────────────────────────── */}
        {activeTab === 'expired' && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <CardTitle className="text-sm font-semibold">{expiredMembers.length} Expired Members</CardTitle>
                <div className="flex items-center gap-2 sm:ml-auto">
                  <div className="relative flex-1 sm:flex-initial">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                    <input
                      type="text"
                      value={expiredSearch}
                      onChange={(e) => setExpiredSearch(e.target.value)}
                      placeholder="Search by name or email..."
                      className="w-full sm:w-56 text-xs border border-zinc-200 dark:border-zinc-700 rounded-md pl-8 pr-3 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                  <select
                    value={expiredSort}
                    onChange={(e) => setExpiredSort(e.target.value as ExpiredSort)}
                    className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="days_expired_desc">Days Expired (most)</option>
                    <option value="joined_desc">Joined (newest)</option>
                    <option value="joined_asc">Joined (oldest)</option>
                    <option value="last_payment_desc">Last Payment (newest)</option>
                    <option value="score_desc">Score (highest)</option>
                  </select>
                  {isAdmin && (
                    <button
                      onClick={exportExpired}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                      title="Export CSV"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-10 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                  ))}
                </div>
              ) : filteredExpiredMembers.length === 0 ? (
                <EmptyState title={expiredSearch ? 'No matching members' : 'No expired members'} description={expiredSearch ? 'Try a different search term.' : 'Members with expired subscriptions will appear here.'} />
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
                        <TableHead className="hidden md:table-cell">Last Payment</TableHead>
                        <TableHead className="hidden md:table-cell">Next Payment</TableHead>
                        <TableHead>Days Expired</TableHead>
                        <TableHead className="hidden lg:table-cell">Score</TableHead>
                        <TableHead className="hidden lg:table-cell">Last Note</TableHead>
                      </AnimatedTableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredExpiredMembers.map((m, i) => {
                        const de = daysExpired(m)
                        const deCls = de > 30 ? 'text-red-600 dark:text-red-400' : de >= 7 ? 'text-amber-600 dark:text-amber-400' : 'text-yellow-600 dark:text-yellow-400'
                        return (
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
                            <TableCell className="text-xs text-zinc-500 whitespace-nowrap hidden md:table-cell">{m.joined_at ? formatDate(m.joined_at) : '—'}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap hidden md:table-cell">
                              {lastPaymentByEmail[(m.email ?? '').toLowerCase()]
                                ? formatDate(lastPaymentByEmail[(m.email ?? '').toLowerCase()])
                                : <span className="text-zinc-400">—</span>}
                            </TableCell>
                            <TableCell className="text-xs text-zinc-500 whitespace-nowrap hidden md:table-cell">
                              {m.next_payment_date ? formatDate(m.next_payment_date) : '—'}
                            </TableCell>
                            <TableCell>
                              <span className={cn('text-xs font-bold', deCls)}>{de}d</span>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              {(() => {
                                const cfg = leadScoreConfig(m.lead_score)
                                return (
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className={cn('w-2 h-2 rounded-full shrink-0', cfg.dot)} />
                                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{m.lead_score ?? 0}</span>
                                  </span>
                                )
                              })()}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell" onClick={(e) => e.stopPropagation()}>
                              <LastNoteCell
                                lastNoteAt={lastNoteByEmail[(m.email ?? '').toLowerCase()]}
                                onClick={(e) => { e.stopPropagation(); openModal({ kind: 'member', data: m }, true) }}
                              />
                            </TableCell>
                          </AnimatedTableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── CANCELACIONES ─────────────────────────────────────────────── */}
        {activeTab === 'cancellations' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
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
                    Trial cancellations
                  </p>
                  {loading ? (
                    <div className="h-10 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                  ) : (
                    <>
                      <p className="text-2xl font-semibold text-amber-600 dark:text-amber-400">
                        {trialCancels.length}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">never converted to paid</p>
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
                      <p className="text-xs text-zinc-500 mt-1">{cancelsThisMonth} / {membersAtStartOfMonth} members</p>
                      {unknownDateCancels > 0 && (
                        <p className="text-[10px] text-zinc-400 mt-1 italic">{unknownDateCancels} without date excluded</p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 pb-4">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 font-medium uppercase tracking-wide">
                    Trial Churn Rate
                  </p>
                  {loading ? (
                    <div className="h-10 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                  ) : (
                    <>
                      <p className={`text-2xl font-semibold ${
                        trialChurnRate < 30 ? 'text-green-600 dark:text-green-400'
                        : trialChurnRate <= 50 ? 'text-amber-600 dark:text-amber-400'
                        : 'text-red-600 dark:text-red-400'
                      }`}>
                        {trialChurnRate}%
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">trials that cancelled without paying</p>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 pb-4">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 font-medium uppercase tracking-wide">
                    Trial → Paid Conversion
                  </p>
                  {loading ? (
                    <div className="h-10 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                  ) : (
                    <>
                      <p className={`text-2xl font-semibold ${
                        trialConversionRate >= 60 ? 'text-green-600 dark:text-green-400'
                        : trialConversionRate >= 40 ? 'text-amber-600 dark:text-amber-400'
                        : 'text-red-600 dark:text-red-400'
                      }`}>
                        {trialConversionDenominator > 0 ? `${trialConversionRate}%` : '—'}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">trials that became paying members</p>
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

            {/* Unified cancellations list with pagination */}
            <Card>
              <CardHeader className="pb-2 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-semibold">All Cancellations</CardTitle>
                    <span className="text-xs text-zinc-400">{cancellations.length} total</span>
                    {(cancelFiltersActive > 0 || cancelSearch) && (
                      <span className="text-xs text-zinc-400">
                        · {filteredCancellations.length} shown
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 sm:ml-auto">
                    <div className="relative flex-1 sm:flex-initial">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                      <input
                        type="text"
                        value={cancelSearch}
                        onChange={(e) => { setCancelSearch(e.target.value); setCancelPage(0) }}
                        placeholder="Search by name or email..."
                        className="w-full sm:w-56 text-xs border border-zinc-200 dark:border-zinc-700 rounded-md pl-8 pr-3 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                    <select
                      value={cancelSort}
                      onChange={(e) => { setCancelSort(e.target.value as CancelSort); setCancelPage(0) }}
                      className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                    >
                      <option value="cancelled_desc">Cancelled (newest)</option>
                      <option value="cancelled_asc">Cancelled (oldest)</option>
                      <option value="subscribed_desc">Subscribed (newest)</option>
                      <option value="subscribed_asc">Subscribed (oldest)</option>
                      <option value="days_active_desc">Days Active (most)</option>
                    </select>
                    {isAdmin && (
                      <button
                        onClick={exportCancellations}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                        title="Export CSV"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {/* Filters row */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <label className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide shrink-0">From</label>
                    <input
                      type="date"
                      value={cancelDateFrom}
                      onChange={(e) => { setCancelDateFrom(e.target.value); setCancelPage(0) }}
                      className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide shrink-0">To</label>
                    <input
                      type="date"
                      value={cancelDateTo}
                      onChange={(e) => { setCancelDateTo(e.target.value); setCancelPage(0) }}
                      className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                  <select
                    value={cancelTypeFilter}
                    onChange={(e) => { setCancelTypeFilter(e.target.value as typeof cancelTypeFilter); setCancelPage(0) }}
                    className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="all">All types</option>
                    <option value="paid">Paid</option>
                    <option value="trial">Trial</option>
                    <option value="pending">Pending</option>
                    <option value="unknown_date">Unknown date</option>
                  </select>
                  <select
                    value={cancelPlatformFilter}
                    onChange={(e) => { setCancelPlatformFilter(e.target.value); setCancelPage(0) }}
                    className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="all">All platforms</option>
                    {cancelPlatforms.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  {cancelFiltersActive > 0 && (
                    <div className="flex items-center gap-2 ml-1">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        {cancelFiltersActive} filter{cancelFiltersActive > 1 ? 's' : ''} active
                      </span>
                      <button
                        onClick={resetCancelFilters}
                        className="text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Reset filters
                      </button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-6 space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-10 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                    ))}
                  </div>
                ) : filteredCancellations.length === 0 ? (
                  <EmptyState title={(cancelSearch || cancelFiltersActive > 0) ? 'No matching cancellations' : 'No cancellations'} description={(cancelSearch || cancelFiltersActive > 0) ? 'Try adjusting your search or filters.' : 'Import cancellations using the Upload CSV button.'} />
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <AnimatedTableRow variants={rowVariants} initial="hidden" animate="visible" custom={0}>
                            <TableHead>Name</TableHead>
                            <TableHead className="hidden md:table-cell">Email</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Plan</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="hidden md:table-cell">Platform</TableHead>
                            <TableHead className="hidden lg:table-cell">Subscribed</TableHead>
                            <TableHead className="hidden sm:table-cell">Cancelled</TableHead>
                            <TableHead className="hidden lg:table-cell">Last Payment</TableHead>
                            <TableHead className="text-right hidden sm:table-cell">Days</TableHead>
                            <TableHead className="hidden lg:table-cell">Last Note</TableHead>
                          </AnimatedTableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredCancellations
                            .slice(cancelPage * CANCEL_PAGE_SIZE, (cancelPage + 1) * CANCEL_PAGE_SIZE)
                            .map((c, i) => (
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
                                  {isTrialCancel(c) ? (
                                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Trial</span>
                                  ) : isPaidCancel(c) ? (
                                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">Paid</span>
                                  ) : (
                                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Pending</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {c.plan && (
                                    <StatusPill label={c.plan === 'annual' ? 'Annual' : 'Monthly'} variant={c.plan === 'annual' ? 'success' : 'info'} />
                                  )}
                                </TableCell>
                                <TableCell className="text-right font-semibold text-sm whitespace-nowrap">{formatCurrency(c.amount)}</TableCell>
                                <TableCell className="text-xs text-zinc-500 hidden md:table-cell">{c.source}</TableCell>
                                <TableCell className="text-xs text-zinc-500 whitespace-nowrap hidden lg:table-cell">{c.subscribed_at ? formatDate(c.subscribed_at) : '—'}</TableCell>
                                <TableCell className="text-xs text-zinc-500 whitespace-nowrap hidden sm:table-cell">{c.cancelled_at ? formatDate(c.cancelled_at) : '—'}</TableCell>
                                <TableCell className="text-xs text-zinc-500 whitespace-nowrap hidden lg:table-cell">{lastPaymentByEmail[(c.email ?? '').toLowerCase()] ? formatDate(lastPaymentByEmail[(c.email ?? '').toLowerCase()]) : '—'}</TableCell>
                                <TableCell className="text-right text-xs text-zinc-500 whitespace-nowrap hidden sm:table-cell">
                                  {c.subscribed_at && c.cancelled_at ? `${daysActive(c.subscribed_at, c.cancelled_at)}d` : '—'}
                                </TableCell>
                                <TableCell className="hidden lg:table-cell" onClick={(e) => e.stopPropagation()}>
                                  <LastNoteCell
                                    lastNoteAt={lastNoteByEmail[(c.email ?? '').toLowerCase()]}
                                    onClick={(e) => { e.stopPropagation(); openModal({ kind: 'cancellation', data: c }, true) }}
                                  />
                                </TableCell>
                              </AnimatedTableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                    {/* Pagination */}
                    {filteredCancellations.length > CANCEL_PAGE_SIZE && (
                      <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100 dark:border-zinc-800">
                        <p className="text-xs text-zinc-400">
                          {cancelPage * CANCEL_PAGE_SIZE + 1}–{Math.min((cancelPage + 1) * CANCEL_PAGE_SIZE, filteredCancellations.length)} of {filteredCancellations.length}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setCancelPage((p) => Math.max(0, p - 1))}
                            disabled={cancelPage === 0}
                            className="px-2.5 py-1 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 disabled:opacity-30 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                          >
                            Previous
                          </button>
                          <span className="text-xs text-zinc-500">
                            Page {cancelPage + 1} of {Math.ceil(filteredCancellations.length / CANCEL_PAGE_SIZE)}
                          </span>
                          <button
                            onClick={() => setCancelPage((p) => Math.min(Math.ceil(filteredCancellations.length / CANCEL_PAGE_SIZE) - 1, p + 1))}
                            disabled={cancelPage >= Math.ceil(filteredCancellations.length / CANCEL_PAGE_SIZE) - 1}
                            className="px-2.5 py-1 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 disabled:opacity-30 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* ── Zoom Class Upload Modal ── */}
      {zoomModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setZoomModalOpen(false)} />
          <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-lg border border-zinc-200 dark:border-zinc-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Upload Zoom Class Attendance</h3>
              <button onClick={() => setZoomModalOpen(false)} className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
              Select the Zoom participant CSV exported from your Zoom account. Required columns: <span className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 rounded">Name (original name)</span>, <span className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 rounded">Email</span>, <span className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 rounded">Join time</span>, <span className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 rounded">Duration (minutes)</span>, <span className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 rounded">Guest</span>.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">CSV file</label>
              <input
                key={zoomModalOpen ? 'open' : 'closed'}
                type="file"
                accept=".csv"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setZoomResult(null)
                  setZoomFileName(file.name)
                  const reader = new FileReader()
                  reader.onload = (ev) => setZoomCsvContent(ev.target?.result as string ?? '')
                  reader.readAsText(file)
                }}
                className="block w-full text-sm text-zinc-600 dark:text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-zinc-100 dark:file:bg-zinc-800 file:text-zinc-700 dark:file:text-zinc-300 hover:file:bg-zinc-200 dark:hover:file:bg-zinc-700 cursor-pointer"
              />
              {zoomFileName && (
                <p className="mt-1.5 text-xs text-zinc-400">{zoomFileName}</p>
              )}
            </div>
            {zoomResult && !zoomResult.error && (
              <div className="mb-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3 text-xs text-emerald-800 dark:text-emerald-300">
                <p className="font-semibold mb-0.5">Uploaded — Class date: {zoomResult.class_date}</p>
                <p>{zoomResult.total} rows · {zoomResult.matched} matched members · {zoomResult.unmatched} unmatched</p>
              </div>
            )}
            {zoomResult?.error && (
              <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-xs text-red-700 dark:text-red-300">
                {zoomResult.error}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setZoomModalOpen(false)} className="px-4 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                Close
              </button>
              <button
                onClick={handleZoomImport}
                disabled={!zoomCsvContent.trim() || zoomImporting}
                className="px-4 py-2 text-xs rounded-lg bg-violet-600 text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {zoomImporting ? 'Uploading…' : 'Upload Attendance'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CSV Import Modal ── */}
      {csvModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={resetCsvModal} />
          <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-zinc-200 dark:border-zinc-700 p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Import from CSV</h2>
              <button
                onClick={resetCsvModal}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Mode selection */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">Import type</label>
              <div className="flex gap-2">
                {(['cancellations', 'members'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setCsvMode(m); setCsvContent(''); setCsvHeaders([]); setCsvPreviewRows([]); setImportResult(null) }}
                    className={cn(
                      'px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all',
                      csvMode === m
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
                    )}
                  >
                    {m === 'cancellations' ? 'Cancellations' : 'Active Members'}
                  </button>
                ))}
              </div>
            </div>

            {/* Source selection */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">Source</label>
              <div className="flex gap-2">
                {(['kajabi', 'ghl'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => { setCsvSource(s); setCsvContent(''); setCsvHeaders([]); setCsvPreviewRows([]); setImportResult(null) }}
                    className={cn(
                      'px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all',
                      csvSource === s
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
                    )}
                  >
                    {s === 'kajabi' ? 'Kajabi' : 'GHL'}
                  </button>
                ))}
              </div>
            </div>

            {/* File input */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">CSV file</label>
              <input
                key={csvSource + csvMode}
                type="file"
                accept=".csv"
                onChange={handleCsvFile}
                className="block w-full text-sm text-zinc-600 dark:text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-zinc-100 dark:file:bg-zinc-800 file:text-zinc-700 dark:file:text-zinc-300 hover:file:bg-zinc-200 dark:hover:file:bg-zinc-700 cursor-pointer"
              />
            </div>

            {/* Preview table */}
            {csvHeaders.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">
                  Preview — first {csvPreviewRows.length} rows
                </p>
                <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-700 rounded-xl">
                  <table className="w-full text-xs">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                      <tr>
                        {csvHeaders.map((h) => (
                          <th key={h} className="text-left py-2 px-3 font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreviewRows.map((row, i) => (
                        <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800">
                          {row.map((cell, j) => (
                            <td key={j} className="py-2 px-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap max-w-[10rem] truncate">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-zinc-400 mt-1">{csvHeaders.length} columns detected</p>
              </div>
            )}

            {/* Import result */}
            {importResult && (
              <div className={cn(
                'mb-4 rounded-xl px-4 py-3 text-sm',
                importResult.error
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                  : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
              )}>
                {importResult.error ? (
                  <p>Error: {importResult.error}</p>
                ) : (importResult.parsed_total != null || importResult.total_rows != null) ? (
                  /* GHL result */
                  <div className="space-y-1.5">
                    <p className="font-semibold">{importResult.total_rows ?? importResult.parsed_total} rows parsed</p>
                    {importResult.status_counts && (
                      <p className="text-xs opacity-70">
                        CSV statuses: {Object.entries(importResult.status_counts).map(([k, v]) => `${k}: ${v}`).join(', ')}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs mt-1">
                      {(importResult.cancelled_rows_found ?? 0) > 0 && <p>Cancelled rows found: <strong>{importResult.cancelled_rows_found}</strong></p>}
                      {(importResult.cancellations_upserted ?? importResult.cancellations_inserted ?? 0) > 0 && <p>Cancellations upserted: <strong>{importResult.cancellations_upserted ?? importResult.cancellations_inserted}</strong></p>}
                      {(importResult.trial_cancels_imported ?? 0) > 0 && <p>Trial cancels: <strong>{importResult.trial_cancels_imported}</strong></p>}
                      {(importResult.paid_cancels_imported ?? 0) > 0 && <p>Paid cancels: <strong>{importResult.paid_cancels_imported}</strong></p>}
                      {(importResult.members_updated_to_cancelled ?? 0) > 0 && <p>Members → cancelled: <strong>{importResult.members_updated_to_cancelled}</strong></p>}
                      {(importResult.skipped_already_cancelled ?? 0) > 0 && <p>Already cancelled: <strong>{importResult.skipped_already_cancelled}</strong></p>}
                      {(importResult.members_updated_to_trial ?? 0) > 0 && <p>Members → trial: <strong>{importResult.members_updated_to_trial}</strong></p>}
                      {(importResult.members_updated_to_active ?? 0) > 0 && <p>Members → active: <strong>{importResult.members_updated_to_active}</strong></p>}
                      {(importResult.new_members_inserted ?? 0) > 0 && <p>New members: <strong>{importResult.new_members_inserted}</strong></p>}
                    </div>
                    {(importResult.errors?.length ?? 0) > 0 && (
                      <details className="mt-1.5">
                        <summary className="text-xs cursor-pointer opacity-70">{importResult.errors!.length} warnings</summary>
                        <ul className="mt-1 text-xs space-y-0.5 opacity-60 max-h-32 overflow-y-auto">
                          {importResult.errors!.map((e, i) => <li key={i}>• {e}</li>)}
                        </ul>
                      </details>
                    )}
                  </div>
                ) : (
                  /* Legacy Kajabi / members mode result */
                  <>
                    <p className="font-semibold">
                      {importResult.imported ?? 0} records imported
                      {(importResult.updated ?? 0) > 0 && `, ${importResult.updated} updated`}
                      {(importResult.skipped ?? 0) > 0 && `, ${importResult.skipped} skipped (already exist)`}
                    </p>
                    {(importResult.errors?.length ?? 0) > 0 && (
                      <ul className="mt-1.5 text-xs space-y-0.5 opacity-70">
                        {importResult.errors!.map((e, i) => <li key={i}>• {e}</li>)}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <button
                onClick={resetCsvModal}
                className="px-4 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                {importResult ? 'Close' : 'Cancel'}
              </button>
              {!importResult && (
                <button
                  onClick={handleImport}
                  disabled={!csvContent || importing}
                  className="px-4 py-2 text-xs rounded-lg text-white font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: '#185FA5' }}
                >
                  {importing ? 'Importing…' : 'Import'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedMember && (
        <MemberProfileModal
          selected={selectedMember}
          notes={notes}
          noteText={noteText}
          addingNote={addingNote}
          onNoteChange={setNoteText}
          onAddNote={handleAddNote}
          onClose={() => setSelectedMember(null)}
          memberTransactions={
            transactionsByEmail[(selectedMember.data.email ?? '').toLowerCase()] ?? []
          }
          memberAttendance={memberAttendance}
          highlightNotes={highlightNotes}
          onMemberUpdate={(updated) => {
            setMembers((prev) => prev.map((m) => m.id === updated.id ? updated : m))
            setSelectedMember({ kind: 'member', data: updated })
          }}
          onSave={(updated) => {
            if (!updated) return
            setMembers((prev) => prev.map((m) => m.id === updated.id ? updated : m))
            setSelectedMember({ kind: 'member', data: updated })
            if (updated.status === 'cancelled') {
              Promise.resolve(
                supabase.from('spc_cancellations').select('*').order('cancelled_at', { ascending: false })
              ).then(({ data }) => { if (data) setCancellations(data) })
            }
          }}
          onSaveCancellation={(updated) => {
            if (!updated) return
            setCancellations((prev) => prev.map((c) => c.id === updated.id ? updated : c))
            setSelectedMember({ kind: 'cancellation', data: updated })
          }}
          onReactivate={(cancellationId, member) => {
            setCancellations((prev) => prev.filter((c) => c.id !== cancellationId))
            setMembers((prev) => {
              const exists = prev.some((m) => m.id === member.id)
              return exists ? prev.map((m) => m.id === member.id ? member : m) : [...prev, member]
            })
            setSelectedMember(null)
          }}
        />
      )}
    </PageTransition>
  )
}
