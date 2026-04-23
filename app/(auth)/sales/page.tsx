'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { KPICard } from '@/components/shared/KPICard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RevenueBarChart } from '@/components/charts/RevenueBarChart'
import { DonutChart } from '@/components/charts/DonutChart'
import { EmptyState } from '@/components/shared/EmptyState'
import { StatusPill } from '@/components/shared/StatusPill'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getCanonicalProduct } from '@/lib/products'
import { Transaction } from '@/types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, Plus, Upload, X, Trash2, RotateCcw, ChevronRight, Copy, CheckCircle2, Download } from 'lucide-react'
import { motion } from 'framer-motion'
import { PageTransition } from '@/components/motion/PageTransition'
import { KPICardGrid } from '@/components/motion/KPICardGrid'
import { AnimatedTableRow, rowVariants } from '@/components/motion/AnimatedTableRow'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useProfile } from '@/hooks/useProfile'
import { usePreviewRole } from '@/contexts/PreviewRoleContext'

export const dynamic = 'force-dynamic'

interface ProductStat {
  name: string
  revenue: number
  count: number
}

const chartVariants = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, delay: 0.2, ease: 'easeOut' as const } },
}

type DateMode = '7d' | '30d' | '1y' | 'all' | 'custom'

type GroupBy = 'year' | 'month' | 'week' | 'day'

function getGroupBy(mode: DateMode, customFrom: string, customTo: string): GroupBy {
  if (mode === 'all') return 'year'
  if (mode === '1y') return 'month'
  if (mode === '7d' || mode === '30d') return 'day'
  // custom
  const days = customFrom && customTo
    ? (new Date(customTo).getTime() - new Date(customFrom).getTime()) / 86_400_000
    : 0
  if (days > 365) return 'month'
  if (days > 60) return 'week'
  return 'day'
}

function groupTransactions(
  active: Transaction[],
  mode: DateMode,
  customFrom: string,
  customTo: string
): { label: string; revenue: number }[] {
  const groupBy = getGroupBy(mode, customFrom, customTo)
  const groups: Record<string, { label: string; revenue: number }> = {}

  for (const t of active) {
    if (!t.date) continue
    const d = new Date(t.date + 'T12:00:00')
    let sortKey = ''
    let label = ''

    if (groupBy === 'year') {
      sortKey = String(d.getFullYear())
      label = sortKey
    } else if (groupBy === 'month') {
      sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    } else if (groupBy === 'week') {
      // Anchor to Monday of the week
      const dayOfWeek = d.getDay()
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
      const monday = new Date(d)
      monday.setDate(d.getDate() + diffToMonday)
      const y = monday.getFullYear()
      const mo = String(monday.getMonth() + 1).padStart(2, '0')
      const dy = String(monday.getDate()).padStart(2, '0')
      sortKey = `${y}-${mo}-${dy}`
      label = monday.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
    } else {
      // day
      sortKey = t.date
      label = mode === '7d'
        ? d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
        : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
    }

    if (!groups[sortKey]) groups[sortKey] = { label, revenue: 0 }
    groups[sortKey].revenue += Number(t.cost) || 0
  }

  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({ label: v.label, revenue: v.revenue }))
}

const CHART_TITLE: Record<DateMode, string> = {
  all:    'Revenue by year',
  '1y':   'Monthly Revenue — last year',
  '30d':  'Daily Revenue — last 30 days',
  '7d':   'Daily Revenue — last 7 days',
  custom: 'Revenue — custom range',
}

function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getDateRange(mode: DateMode): { from: string; to: string } {
  const today = new Date()
  const from = new Date()
  switch (mode) {
    case '7d':  from.setDate(today.getDate() - 7); break
    case '30d': from.setDate(today.getDate() - 30); break
    case '1y':  from.setFullYear(today.getFullYear() - 1); break
    case 'all': from.setFullYear(2021, 0, 1); break
    default:    from.setDate(today.getDate() - 30)
  }
  return { from: localDateStr(from), to: localDateStr(today) }
}

function todayStr() {
  return localDateStr(new Date())
}

const DATE_MODES: { label: string; value: DateMode }[] = [
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: '1 year', value: '1y' },
  { label: 'All', value: 'all' },
  { label: 'Custom', value: 'custom' },
]

const emptyForm = {
  date: todayStr(),
  offer_title: '',
  cost: '',
  buyer_name: '',
  buyer_email: '',
  buyer_phone: '',
  currency: 'USD',
  transaction_id: '',
  source: 'Manual',
  payment_source: '',
}

type FormData = typeof emptyForm

type ConfirmAction =
  | { type: 'delete'; tx: Transaction }
  | { type: 'refund'; tx: Transaction }
  | null

const inputClass =
  'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400'

const selectClass =
  'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400'

const labelClass = 'block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1'

export default function SalesPage() {
  const { profile } = useProfile()
  const { previewRole } = usePreviewRole()
  const effectiveRole = previewRole || profile?.role
  const isRestrictedRole = effectiveRole === 'csm_spc' || effectiveRole === 'csm_ht'
  const supabase = useMemo(() => createClient(), [])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [loadedCount, setLoadedCount] = useState(0)
  const [search, setSearch] = useState('')

  const [dateMode, setDateMode] = useState<DateMode>('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [submitting, setSubmitting] = useState(false)

  const [confirm, setConfirm] = useState<ConfirmAction>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const [refreshKey, setRefreshKey] = useState(0)

  const [showRecoveryPanel, setShowRecoveryPanel] = useState(false)
  const [recoverySearch, setRecoverySearch] = useState('')
  const [recoveryTab, setRecoveryTab] = useState<'all' | 'week' | 'month'>('all')
  const [confirmRecover, setConfirmRecover] = useState<Transaction | null>(null)
  const [recoverLoading, setRecoverLoading] = useState(false)

  // ── CSV upload state ──────────────────────────────────────────────────────
  const [csvModalOpen, setCsvModalOpen] = useState(false)
  const [csvSource, setCsvSource] = useState<'kajabi' | 'ghl'>('kajabi')
  const [csvContent, setCsvContent] = useState('')
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvPreviewRows, setCsvPreviewRows] = useState<string[][]>([])
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[]; error?: string } | null>(null)

  const { from: fromDate, to: toDate } = useMemo(() => {
    if (dateMode === 'custom') {
      return {
        from: customFrom || localDateStr(new Date()),
        to: customTo || localDateStr(new Date()),
      }
    }
    return getDateRange(dateMode)
  }, [dateMode, customFrom, customTo])

  useEffect(() => {
    let cancelled = false

    async function fetchTransactions() {
      setLoading(true)
      setLoadedCount(0)

      const pageSize = 1000
      let allData: Transaction[] = []
      let page = 0

      while (true) {
        const { data, error } = await supabase
          .from('transactions')
          .select('*')
          .gte('date', fromDate)
          .lte('date', toDate)
          .order('date', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1)

        if (cancelled) return
        if (error || !data || data.length === 0) break

        allData = [...allData, ...(data as Transaction[])]
        setLoadedCount(allData.length)

        if (data.length < pageSize) break
        page++
      }

      if (!cancelled) {
        setTransactions(allData)
        setLoading(false)
      }
    }

    fetchTransactions()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate, refreshKey])

  function setField(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.date || !form.offer_title || !form.cost || !form.buyer_name) {
      toast.error('Please fill in all required fields')
      return
    }

    setSubmitting(true)
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        date: form.date,
        offer_title: form.offer_title,
        cost: parseFloat(form.cost) || 0,
        buyer_name: form.buyer_name,
        buyer_email: form.buyer_email || null,
        buyer_phone: form.buyer_phone || null,
        currency: form.currency,
        transaction_id: form.transaction_id || null,
        source: form.source,
        payment_source: form.payment_source || null,
        status: 'completed',
      })
      .select()
      .single()

    setSubmitting(false)

    if (error) {
      toast.error(`Error: ${error.message}`)
      return
    }

    setTransactions((prev) => [data as Transaction, ...prev])
    setShowForm(false)
    setForm({ ...emptyForm, date: todayStr() })
    toast.success('Transaction saved')
  }

  async function handleConfirm() {
    if (!confirm) return
    setActionLoading(true)

    if (confirm.type === 'delete') {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', confirm.tx.id)

      if (error) {
        toast.error('Error deleting')
      } else {
        setTransactions((prev) => prev.filter((t) => t.id !== confirm.tx.id))
        toast.success('Transaction deleted')
      }
    } else {
      const newStatus = confirm.tx.status === 'refunded' ? 'completed' : 'refunded'
      const { error } = await supabase
        .from('transactions')
        .update({ status: newStatus })
        .eq('id', confirm.tx.id)

      if (error) {
        toast.error('Error updating')
      } else {
        setTransactions((prev) =>
          prev.map((t) => (t.id === confirm.tx.id ? { ...t, status: newStatus } : t))
        )
        toast.success(
          newStatus === 'refunded' ? 'Marked as refunded' : 'Refund undone'
        )
      }
    }

    setActionLoading(false)
    setConfirm(null)
  }

  const q = search.toLowerCase()
  const filtered = transactions.filter(
    (t) =>
      (t.buyer_name ?? '').toLowerCase().includes(q) ||
      (t.buyer_email ?? '').toLowerCase().includes(q) ||
      (t.offer_title ?? '').toLowerCase().includes(q)
  )

  // Active = completed or recovered; failed/refunded never count toward revenue
  const active = transactions.filter((t) => t.status === 'completed' || t.status === 'recovered')
  const refunded = transactions.filter((t) => t.status === 'refunded')

  const grossRevenue = active.reduce((s, t) => s + (Number(t.cost) || 0), 0)
  const refundedAmount = refunded.reduce((s, t) => s + (Number(t.cost) || 0), 0)
  const totalRevenue = grossRevenue - refundedAmount
  const avgTicket = active.length > 0 ? totalRevenue / active.length : 0

  const groupedRevenue = groupTransactions(active, dateMode, customFrom, customTo)

  const bestDayMap: Record<string, number> = {}
  active.forEach((t) => {
    if (!t.date) return
    bestDayMap[t.date] = (bestDayMap[t.date] ?? 0) + (Number(t.cost) || 0)
  })
  const bestDay = Object.entries(bestDayMap).sort((a, b) => b[1] - a[1])[0]

  const kajabi = active.filter((t) => t.source === 'Kajabi').reduce((s, t) => s + (Number(t.cost) || 0), 0)
  const ghl = active.filter((t) => t.source === 'GoHighLevel').reduce((s, t) => s + (Number(t.cost) || 0), 0)
  const sourceData = [
    { name: 'Kajabi', value: kajabi, color: '#185FA5' },
    { name: 'GoHighLevel', value: ghl, color: '#3B6D11' },
  ]

  const canonicalProductMap = new Map<string, { revenue: number; count: number }>()
  for (const tx of transactions) {
    if (tx.status === 'refunded' || tx.status === 'failed') continue
    const canonical = getCanonicalProduct(tx.offer_title || '')
    const existing = canonicalProductMap.get(canonical) || { revenue: 0, count: 0 }
    canonicalProductMap.set(canonical, {
      revenue: existing.revenue + (Number(tx.cost) || 0),
      count: existing.count + 1,
    })
  }
  const products = Array.from(canonicalProductMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .filter((p) => p.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
  const maxRevenue = products[0]?.revenue ?? 1

  // ── Recuperación de compras ──────────────────────────────────────────────
  const failedEmails = useMemo(() => new Set(
    transactions.filter(t => t.status === 'failed').map(t => t.buyer_email?.toLowerCase()).filter(Boolean) as string[]
  ), [transactions])

  // 'completed' OR 'recovered' both count as "bought"
  const completedEmails = useMemo(() => new Set(
    transactions
      .filter(t => t.status === 'completed' || t.status === 'recovered')
      .map(t => t.buyer_email?.toLowerCase()).filter(Boolean) as string[]
  ), [transactions])

  const recoveredEmails = useMemo(() =>
    Array.from(failedEmails).filter(email => completedEmails.has(email)),
    [failedEmails, completedEmails]
  )

  const totalFailed = failedEmails.size
  const totalRecovered = recoveredEmails.length
  const recoveryRate = totalFailed > 0 ? (totalRecovered / totalFailed * 100).toFixed(1) : '0'
  const recoveredRevenue = useMemo(() =>
    transactions
      .filter(t => (t.status === 'completed' || t.status === 'recovered') && recoveredEmails.includes(t.buyer_email?.toLowerCase() ?? ''))
      .reduce((sum, t) => sum + (Number(t.cost) || 0), 0),
    [transactions, recoveredEmails]
  )

  const failedByProduct = useMemo(() => {
    const map: Record<string, number> = {}
    transactions.filter(t => t.status === 'failed').forEach(t => {
      const key = getCanonicalProduct(t.offer_title || '')
      map[key] = (map[key] ?? 0) + 1
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [transactions])

  const maxFailed = failedByProduct[0]?.[1] ?? 1

  // Leads: failed and NOT yet bought (deduped by email, most recent per person)
  const toRecover = useMemo(() => {
    const raw = transactions.filter(t =>
      t.status === 'failed' && !completedEmails.has(t.buyer_email?.toLowerCase() ?? '')
    )
    const map = new Map<string, Transaction>()
    raw.forEach(t => {
      const email = t.buyer_email?.toLowerCase()
      if (!email) return
      if (!map.has(email) || new Date(t.date) > new Date(map.get(email)!.date)) {
        map.set(email, t)
      }
    })
    return Array.from(map.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [transactions, completedEmails])

  const pendingRecovery = toRecover.length

  function daysAgo(dateStr: string): string {
    const diff = Math.floor((Date.now() - new Date(dateStr + 'T12:00:00').getTime()) / 86_400_000)
    if (diff === 0) return 'today'
    if (diff === 1) return 'yesterday'
    return `${diff}d ago`
  }

  function filterRecoveryByTab(list: Transaction[]) {
    const now = new Date()
    if (recoveryTab === 'week') {
      const cutoff = new Date(now); cutoff.setDate(now.getDate() - 7)
      return list.filter(t => new Date(t.date + 'T12:00:00') >= cutoff)
    }
    if (recoveryTab === 'month') {
      const cutoff = new Date(now); cutoff.setDate(now.getDate() - 30)
      return list.filter(t => new Date(t.date + 'T12:00:00') >= cutoff)
    }
    return list
  }

  const filteredToRecover = useMemo(() => {
    const q = recoverySearch.toLowerCase()
    return filterRecoveryByTab(toRecover).filter(t =>
      (t.buyer_name ?? '').toLowerCase().includes(q) ||
      (t.buyer_email ?? '').toLowerCase().includes(q)
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toRecover, recoverySearch, recoveryTab])

  function exportRecoveryCSV() {
    const rows = [
      ['name', 'email', 'product', 'amount', 'date'],
      ...filteredToRecover.map(t => [
        t.buyer_name ?? '',
        t.buyer_email ?? '',
        t.offer_title ?? '',
        String(t.cost),
        t.date,
      ])
    ]
    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'purchase_recovery.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  async function handleMarkRecovered(tx: Transaction) {
    setRecoverLoading(true)
    const { error } = await supabase.from('transactions').update({ status: 'recovered' }).eq('id', tx.id)
    setRecoverLoading(false)
    if (error) { toast.error('Error updating'); return }
    setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, status: 'recovered' } : t))
    setConfirmRecover(null)
    toast.success(`${tx.buyer_name} marked as recovered`)
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
    const res = await fetch('/api/sales/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: csvContent, source: csvSource }),
    })
    const data = await res.json()
    setImporting(false)
    setImportResult(data)
    if (res.ok && data.imported > 0) {
      setRefreshKey((k) => k + 1)
    }
  }

  function resetCsvModal() {
    setCsvModalOpen(false)
    setCsvSource('kajabi')
    setCsvContent('')
    setCsvHeaders([])
    setCsvPreviewRows([])
    setImportResult(null)
  }

  const confirmMeta = confirm
    ? confirm.type === 'delete'
      ? {
          title: 'Delete this transaction?',
          body: 'This action cannot be undone.',
          confirmLabel: 'Delete',
          confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
        }
      : confirm.tx.status === 'refunded'
      ? {
          title: 'Undo refund?',
          body: 'The transaction will be counted back in revenue.',
          confirmLabel: 'Undo refund',
          confirmClass: 'bg-amber-500 hover:bg-amber-600 text-white',
        }
      : {
          title: 'Mark as refunded?',
          body: 'The amount will be deducted from total revenue.',
          confirmLabel: 'Mark as refund',
          confirmClass: 'bg-amber-500 hover:bg-amber-600 text-white',
        }
    : null

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto">
        {!isRestrictedRole ? (
          <PageHeader title="Sales Report" description="Revenue and transaction analytics">
            <div className="flex flex-wrap items-center gap-2">
              {/* Date mode buttons */}
              <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                {DATE_MODES.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setDateMode(m.value)}
                    className={cn(
                      'px-2.5 py-1.5 text-xs font-medium transition-colors border-r border-zinc-200 dark:border-zinc-700 last:border-r-0',
                      dateMode === m.value
                        ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                        : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Custom date inputs — only shown in custom mode */}
              {dateMode === 'custom' && (
                <>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                  <span className="text-xs text-zinc-400">→</span>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                </>
              )}

              <button
                onClick={() => setCsvModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload CSV
              </button>
              <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Add Sale
              </Button>
            </div>
          </PageHeader>
        ) : (
          <PageHeader title="Purchase Recovery" description="Follow up on failed purchases to recover revenue" />
        )}

        {!isRestrictedRole && <KPICardGrid className="grid gap-4 grid-cols-2 lg:grid-cols-5 mb-6">
          {/* Total Revenue — custom card to fit gross/refund sub-line */}
          <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } } }}>
            <Card className="h-full">
              <CardContent className="pt-4 md:pt-6 px-4 md:px-6">
                {loading ? (
                  <div className="space-y-2">
                    <div className="h-3 w-24 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                    <div className="h-7 w-32 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                    {loadedCount > 0 && (
                      <p className="text-xs text-zinc-400 dark:text-zinc-500">{loadedCount.toLocaleString()} loaded…</p>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Total Revenue</p>
                    <p className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2">{formatCurrency(totalRevenue)}</p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                      Gross: {formatCurrency(grossRevenue)}
                      {refundedAmount > 0 && (
                        <span className="text-red-500 dark:text-red-400"> · -{formatCurrency(refundedAmount)}</span>
                      )}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <KPICard title="Transactions" value={active.length} subtitle="completed" loading={loading} />
          <KPICard title="Avg Ticket" value={formatCurrency(avgTicket)} subtitle="per transaction" loading={loading} />
          <KPICard
            title="Best Day"
            value={bestDay ? formatCurrency(bestDay[1]) : '—'}
            subtitle={bestDay ? formatDate(bestDay[0]) : 'no data'}
            loading={loading}
          />

          {/* Refunds card */}
          <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } } }}>
            <Card className="h-full">
              <CardContent className="pt-4 md:pt-6 px-4 md:px-6">
                {loading ? (
                  <div className="space-y-2">
                    <div className="h-3 w-24 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                    <div className="h-7 w-28 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                    <div className="h-3 w-32 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                  </div>
                ) : (
                  <>
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Refunds</p>
                    <p className="text-xl md:text-2xl font-bold text-red-600 dark:text-red-400 mt-2">
                      {refundedAmount > 0 ? `-${formatCurrency(refundedAmount)}` : '—'}
                    </p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                      {refunded.length} refunded transactions
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </KPICardGrid>}

        {/* ── Recuperación de compras ──────────────────────────────────── */}
        {!loading && totalFailed > 0 && (
          <motion.div variants={chartVariants} initial="hidden" animate="visible" className="mb-6">
            <Card
              className="cursor-pointer transition-shadow hover:shadow-lg"
              onClick={() => setShowRecoveryPanel(true)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">Purchase Recovery</CardTitle>
                  {pendingRecovery > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                      {pendingRecovery} pending
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 4 metric cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2.5">
                    <p className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wide">Failed Purchases</p>
                    <p className="text-2xl font-bold text-red-700 dark:text-red-300 mt-1">{totalFailed}</p>
                    <p className="text-xs text-red-500 dark:text-red-400 mt-0.5">unique emails</p>
                  </div>
                  <div className="rounded-lg bg-green-50 dark:bg-green-900/20 px-3 py-2.5">
                    <p className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide">Recovered</p>
                    <p className="text-2xl font-bold text-green-700 dark:text-green-300 mt-1">{totalRecovered}</p>
                    <p className="text-xs text-green-500 dark:text-green-400 mt-0.5">purchased after</p>
                  </div>
                  <div className={cn('rounded-lg px-3 py-2.5', Number(recoveryRate) >= 50 ? 'bg-green-50 dark:bg-green-900/20' : Number(recoveryRate) >= 20 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-red-50 dark:bg-red-900/20')}>
                    <p className={cn('text-xs font-medium uppercase tracking-wide', Number(recoveryRate) >= 50 ? 'text-green-600 dark:text-green-400' : Number(recoveryRate) >= 20 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400')}>Recovery Rate</p>
                    <p className={cn('text-2xl font-bold mt-1', Number(recoveryRate) >= 50 ? 'text-green-700 dark:text-green-300' : Number(recoveryRate) >= 20 ? 'text-amber-700 dark:text-amber-300' : 'text-red-700 dark:text-red-300')}>{recoveryRate}%</p>
                    <p className={cn('text-xs mt-0.5', Number(recoveryRate) >= 50 ? 'text-green-500 dark:text-green-400' : Number(recoveryRate) >= 20 ? 'text-amber-500 dark:text-amber-400' : 'text-red-500 dark:text-red-400')}>of failed recovered</p>
                  </div>
                  <div className="rounded-lg bg-green-50 dark:bg-green-900/20 px-3 py-2.5">
                    <p className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide">Recovered Revenue</p>
                    <p className="text-2xl font-bold text-green-700 dark:text-green-300 mt-1">{formatCurrency(recoveredRevenue)}</p>
                    <p className="text-xs text-green-500 dark:text-green-400 mt-0.5">from recovered buyers</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Recovery progress</span>
                    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{totalRecovered} / {totalFailed}</span>
                  </div>
                  <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', Number(recoveryRate) >= 50 ? 'bg-green-500' : Number(recoveryRate) >= 20 ? 'bg-amber-500' : 'bg-red-500')}
                      style={{ width: `${Math.min(Number(recoveryRate), 100)}%` }}
                    />
                  </div>
                </div>

                {/* Top 5 products with most failures */}
                {failedByProduct.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-2">Top products with most failures</p>
                    <div className="space-y-2">
                      {failedByProduct.map(([name, count]) => (
                        <div key={name} className="flex items-center gap-3">
                          <span className="text-xs text-zinc-600 dark:text-zinc-400 w-40 truncate shrink-0">{name}</span>
                          <div className="flex-1 h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-red-400 dark:bg-red-500 rounded-full"
                              style={{ width: `${(count / maxFailed) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 w-6 text-right shrink-0">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer link */}
                <div className="flex justify-end pt-1">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400 hover:underline">
                    View leads <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {!isRestrictedRole && <>
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-3 mb-6">
          <motion.div className="lg:col-span-2" variants={chartVariants} initial="hidden" animate="visible">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">{CHART_TITLE[dateMode]}</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-64 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
                ) : groupedRevenue.length === 0 ? (
                  <EmptyState title="No revenue data" description="No transactions in selected period." />
                ) : (
                  <RevenueBarChart data={groupedRevenue} rotateLabels={dateMode !== 'all'} />
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={chartVariants} initial="hidden" animate="visible" transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' as const }}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Revenue by Source</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-52 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
                ) : kajabi === 0 && ghl === 0 ? (
                  <EmptyState title="No data" />
                ) : (
                  <DonutChart data={sourceData} />
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Revenue by Product</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-8 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                ))}
              </div>
            ) : products.length === 0 ? (
              <EmptyState title="No product data" />
            ) : (
              <div className="space-y-3">
                {products.map((p) => (
                  <div key={p.name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate text-zinc-700 dark:text-zinc-300 max-w-xs">{p.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full">{p.count} sales</span>
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">{formatCurrency(p.revenue)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${(p.revenue / maxRevenue) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">All Transactions</CardTitle>
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs w-56"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-10 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState title="No transactions found" description="Try adjusting your filters." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <AnimatedTableRow variants={rowVariants} initial="hidden" animate="visible" custom={0}>
                      <TableHead>Date</TableHead>
                      <TableHead>Buyer</TableHead>
                      <TableHead className="hidden md:table-cell">Offer</TableHead>
                      <TableHead className="hidden md:table-cell">Source</TableHead>
                      <TableHead className="hidden lg:table-cell">Payment Method</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-20" />
                    </AnimatedTableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((tx, i) => (
                      <AnimatedTableRow
                        key={tx.id}
                        variants={rowVariants}
                        initial="hidden"
                        animate="visible"
                        custom={i}
                        className="group"
                      >
                        <TableCell className="text-xs text-zinc-500 whitespace-nowrap">{formatDate(tx.date)}</TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{tx.buyer_name}</div>
                          <div className="text-xs text-zinc-400 hidden md:block">{tx.buyer_email}</div>
                        </TableCell>
                        <TableCell className="text-sm text-zinc-700 dark:text-zinc-300 max-w-56 truncate hidden md:table-cell">{tx.offer_title}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          <StatusPill
                            label={tx.source}
                            variant={tx.source === 'Kajabi' ? 'info' : 'purple'}
                          />
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-zinc-500 dark:text-zinc-400">
                          {tx.payment_source ?? '—'}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            {tx.status === 'refunded' && (
                              <span className="text-xs font-medium text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 px-2 py-0.5 rounded-full">
                                Refunded
                              </span>
                            )}
                            {tx.status === 'recovered' && (
                              <span className="text-xs font-medium text-teal-700 bg-teal-50 dark:bg-teal-900/20 dark:text-teal-300 px-2 py-0.5 rounded-full">
                                Recovered ✓
                              </span>
                            )}
                            {tx.status === 'failed' && (
                              <span className="text-xs font-medium text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400 px-2 py-0.5 rounded-full">
                                Failed
                              </span>
                            )}
                            <span className={`font-semibold text-sm ${tx.status === 'refunded' ? 'line-through text-zinc-400' : tx.status === 'failed' ? 'text-zinc-400' : ''}`}>
                              {formatCurrency(tx.cost, tx.currency)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="w-20">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              title={tx.status === 'refunded' ? 'Undo refund' : 'Mark as refund'}
                              onClick={() => setConfirm({ type: 'refund', tx })}
                              className={`p-1.5 rounded-md transition-colors ${
                                tx.status === 'refunded'
                                  ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                                  : 'text-zinc-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                              }`}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </button>
                            <button
                              title="Delete transaction"
                              onClick={() => setConfirm({ type: 'delete', tx })}
                              className="p-1.5 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </TableCell>
                      </AnimatedTableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        </>}
      </div>

      {/* ── CSV Import Modal ── */}
      {!isRestrictedRole && csvModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={resetCsvModal} />
          <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-zinc-200 dark:border-zinc-700 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Import Failed / Refunded Transactions</h2>
              <button
                onClick={resetCsvModal}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Source selection */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">Template source</label>
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
                key={csvSource}
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
                ) : (
                  <>
                    <p className="font-semibold">
                      {importResult.imported} records imported
                      {importResult.skipped > 0 && `, ${importResult.skipped} skipped (already exist)`}
                    </p>
                    {importResult.errors?.length > 0 && (
                      <ul className="mt-1.5 text-xs space-y-0.5 text-zinc-500 dark:text-zinc-400">
                        {importResult.errors.map((e, i) => <li key={i}>• {e}</li>)}
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

      {/* Confirmation dialog */}
      {!isRestrictedRole && confirm && confirmMeta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setConfirm(null)} />
          <div className="relative bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-6 w-full max-w-sm animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">{confirmMeta.title}</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5">{confirmMeta.body}</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirm(null)}
                className="px-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={actionLoading}
                className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors disabled:opacity-60 ${confirmMeta.confirmClass}`}
              >
                {actionLoading ? 'Procesando...' : confirmMeta.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Recovery leads panel ──────────────────────────────────────── */}
      {showRecoveryPanel && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={() => setShowRecoveryPanel(false)} />
          <div className="w-full max-w-2xl bg-white dark:bg-zinc-900 h-full shadow-xl flex flex-col animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Recovery Leads</h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {pendingRecovery} {pendingRecovery === 1 ? 'person who attempted to buy but did not complete' : 'people who attempted to buy but did not complete'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={exportRecoveryCSV}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </button>
                <button
                  onClick={() => setShowRecoveryPanel(false)}
                  className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Filter tabs + search */}
            <div className="px-5 pt-3 pb-2 border-b border-zinc-100 dark:border-zinc-800 shrink-0 space-y-2.5">
              <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden w-fit">
                {([['all', 'All'], ['week', 'This week'], ['month', 'This month']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setRecoveryTab(val)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium transition-colors border-r border-zinc-200 dark:border-zinc-700 last:border-r-0',
                      recoveryTab === val
                        ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                        : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  placeholder="Search by name or email..."
                  value={recoverySearch}
                  onChange={e => setRecoverySearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto">
              {filteredToRecover.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-zinc-400 dark:text-zinc-500">
                  <CheckCircle2 className="h-8 w-8 mb-2 text-green-400" />
                  <p className="text-sm font-medium">No pending leads</p>
                  <p className="text-xs mt-1">All failed purchases have been recovered</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-800/80 backdrop-blur z-10">
                    <tr>
                      <th className="text-left px-5 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Name</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400 hidden md:table-cell">Product</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Amount</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400 hidden sm:table-cell">Last attempt</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {filteredToRecover.map(t => (
                      <tr key={t.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 leading-tight">{t.buyer_name}</div>
                          <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{t.buyer_email}</div>
                        </td>
                        <td className="px-3 py-3 hidden md:table-cell">
                          <span className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 max-w-[180px]">
                            {getCanonicalProduct(t.offer_title || '')}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">${Number(t.cost).toLocaleString()}</span>
                        </td>
                        <td className="px-3 py-3 text-right hidden sm:table-cell">
                          <span className="text-xs text-zinc-400 dark:text-zinc-500">{daysAgo(t.date)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 justify-end">
                            <button
                              title="Copy email"
                              onClick={() => {
                                navigator.clipboard.writeText(t.buyer_email ?? '')
                                toast.success('Email copied')
                              }}
                              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <button
                              title="Mark as recovered"
                              onClick={() => setConfirmRecover(t)}
                              className="p-1.5 rounded-md text-zinc-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm recover dialog */}
      {confirmRecover && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmRecover(null)} />
          <div className="relative bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-6 w-full max-w-sm animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Mark as recovered?</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5">
              Mark <strong className="text-zinc-700 dark:text-zinc-300">{confirmRecover.buyer_name}</strong> as manually recovered?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmRecover(null)}
                className="px-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleMarkRecovered(confirmRecover)}
                disabled={recoverLoading}
                className="px-3 py-1.5 text-xs rounded-md font-medium bg-teal-600 hover:bg-teal-700 text-white transition-colors disabled:opacity-60"
              >
                {recoverLoading ? 'Saving...' : 'Mark recovered'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-over panel */}
      {!isRestrictedRole && showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="flex-1 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowForm(false)}
          />
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 h-full shadow-xl flex flex-col overflow-y-auto animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Add Manual Transaction</h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 flex flex-col p-5 gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Date *</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setField('date', e.target.value)}
                    required
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Source</label>
                  <select
                    value={form.source}
                    onChange={(e) => setField('source', e.target.value)}
                    className={selectClass}
                  >
                    <option>Kajabi</option>
                    <option>GoHighLevel</option>
                    <option>Manual</option>
                    <option>Stripe</option>
                    <option>PayPal</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={labelClass}>Product / Offer *</label>
                <input
                  type="text"
                  value={form.offer_title}
                  onChange={(e) => setField('offer_title', e.target.value)}
                  placeholder="Ej: Parenting With Understanding GROUP Coaching"
                  required
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Amount *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-base font-semibold select-none">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.cost}
                    onChange={(e) => setField('cost', e.target.value)}
                    placeholder="0.00"
                    required
                    className={`${inputClass} pl-7 text-lg font-semibold`}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Buyer name *</label>
                <input
                  type="text"
                  value={form.buyer_name}
                  onChange={(e) => setField('buyer_name', e.target.value)}
                  required
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Email</label>
                <input
                  type="email"
                  value={form.buyer_email}
                  onChange={(e) => setField('buyer_email', e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Phone</label>
                  <input
                    type="text"
                    value={form.buyer_phone}
                    onChange={(e) => setField('buyer_phone', e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Currency</label>
                  <select
                    value={form.currency}
                    onChange={(e) => setField('currency', e.target.value)}
                    className={selectClass}
                  >
                    <option>USD</option>
                    <option>EUR</option>
                    <option>MXN</option>
                    <option>CAD</option>
                    <option>GBP</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={labelClass}>Transaction ID</label>
                <input
                  type="text"
                  value={form.transaction_id}
                  onChange={(e) => setField('transaction_id', e.target.value)}
                  placeholder="txn_xxx or internal reference"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Payment method</label>
                <select
                  value={form.payment_source}
                  onChange={(e) => setField('payment_source', e.target.value)}
                  className={selectClass}
                >
                  <option value="">— Select —</option>
                  <option>Stripe</option>
                  <option>PayPal</option>
                  <option>Kajabi Payments</option>
                  <option>Credit Card</option>
                  <option>Bank Transfer</option>
                  <option>Cash</option>
                  <option>Other</option>
                </select>
              </div>

              <div className="mt-auto pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? 'Saving...' : 'Save transaction'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageTransition>
  )
}
