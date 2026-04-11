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
import { Search, Plus, X, Trash2, RotateCcw } from 'lucide-react'
import { motion } from 'framer-motion'
import { PageTransition } from '@/components/motion/PageTransition'
import { KPICardGrid } from '@/components/motion/KPICardGrid'
import { AnimatedTableRow, rowVariants } from '@/components/motion/AnimatedTableRow'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

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
      label = d.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })
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
      label = monday.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    } else {
      // day
      sortKey = t.date
      label = mode === '7d'
        ? d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
        : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    }

    if (!groups[sortKey]) groups[sortKey] = { label, revenue: 0 }
    groups[sortKey].revenue += Number(t.cost) || 0
  }

  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({ label: v.label, revenue: v.revenue }))
}

const CHART_TITLE: Record<DateMode, string> = {
  all:    'Revenue por año',
  '1y':   'Revenue mensual — último año',
  '30d':  'Revenue diario — últimos 30 días',
  '7d':   'Revenue diario — últimos 7 días',
  custom: 'Revenue — rango personalizado',
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
  { label: '1 año', value: '1y' },
  { label: 'Todo', value: 'all' },
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
  }, [fromDate, toDate])

  function setField(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.date || !form.offer_title || !form.cost || !form.buyer_name) {
      toast.error('Completa los campos obligatorios')
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
    toast.success('Transacción guardada')
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
        toast.error('Error al eliminar')
      } else {
        setTransactions((prev) => prev.filter((t) => t.id !== confirm.tx.id))
        toast.success('Transacción eliminada')
      }
    } else {
      const newStatus = confirm.tx.status === 'refunded' ? 'completed' : 'refunded'
      const { error } = await supabase
        .from('transactions')
        .update({ status: newStatus })
        .eq('id', confirm.tx.id)

      if (error) {
        toast.error('Error al actualizar')
      } else {
        setTransactions((prev) =>
          prev.map((t) => (t.id === confirm.tx.id ? { ...t, status: newStatus } : t))
        )
        toast.success(
          newStatus === 'refunded' ? 'Marcado como reembolso' : 'Reembolso deshecho'
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

  // Active = non-refunded; used for all revenue calculations
  const active = transactions.filter((t) => t.status !== 'refunded')
  const refunded = transactions.filter((t) => t.status === 'refunded')

  const grossRevenue = transactions.reduce((s, t) => s + (Number(t.cost) || 0), 0)
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

  const productMap: Record<string, ProductStat> = {}
  active.forEach((t) => {
    const key = t.offer_title ?? '(sin título)'
    if (!productMap[key]) {
      productMap[key] = { name: key, revenue: 0, count: 0 }
    }
    productMap[key].revenue += Number(t.cost) || 0
    productMap[key].count++
  })
  const products = Object.values(productMap).sort((a, b) => b.revenue - a.revenue)
  const maxRevenue = products[0]?.revenue ?? 1

  const confirmMeta = confirm
    ? confirm.type === 'delete'
      ? {
          title: '¿Eliminar esta transacción?',
          body: 'Esta acción no se puede deshacer.',
          confirmLabel: 'Eliminar',
          confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
        }
      : confirm.tx.status === 'refunded'
      ? {
          title: '¿Deshacer el reembolso?',
          body: 'La transacción volverá a contarse en el revenue.',
          confirmLabel: 'Deshacer reembolso',
          confirmClass: 'bg-amber-500 hover:bg-amber-600 text-white',
        }
      : {
          title: '¿Marcar como reembolsada?',
          body: 'El monto se descontará del revenue total.',
          confirmLabel: 'Marcar reembolso',
          confirmClass: 'bg-amber-500 hover:bg-amber-600 text-white',
        }
    : null

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto">
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

            <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Agregar venta
            </Button>
          </div>
        </PageHeader>

        <KPICardGrid className="grid gap-4 grid-cols-2 lg:grid-cols-5 mb-6">
          {/* Total Revenue — custom card to fit gross/refund sub-line */}
          <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } } }}>
            <Card className="h-full">
              <CardContent className="pt-4 md:pt-6 px-4 md:px-6">
                {loading ? (
                  <div className="space-y-2">
                    <div className="h-3 w-24 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                    <div className="h-7 w-32 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                    {loadedCount > 0 && (
                      <p className="text-xs text-zinc-400 dark:text-zinc-500">{loadedCount.toLocaleString()} cargadas…</p>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Total Revenue</p>
                    <p className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2">{formatCurrency(totalRevenue)}</p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                      Bruto: {formatCurrency(grossRevenue)}
                      {refundedAmount > 0 && (
                        <span className="text-red-500 dark:text-red-400"> · -{formatCurrency(refundedAmount)}</span>
                      )}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <KPICard title="Transactions" value={active.length} subtitle="completadas" loading={loading} />
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
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Reembolsos</p>
                    <p className="text-xl md:text-2xl font-bold text-red-600 dark:text-red-400 mt-2">
                      {refundedAmount > 0 ? `-${formatCurrency(refundedAmount)}` : '—'}
                    </p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                      {refunded.length} transacc. reembolsadas
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </KPICardGrid>

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
                        <span className="text-xs text-zinc-400">{p.count} sales</span>
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
                      <TableHead className="hidden lg:table-cell">Método de pago</TableHead>
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
                                Reembolsado
                              </span>
                            )}
                            <span className={`font-semibold text-sm ${tx.status === 'refunded' ? 'line-through text-zinc-400' : ''}`}>
                              {formatCurrency(tx.cost, tx.currency)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="w-20">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              title={tx.status === 'refunded' ? 'Deshacer reembolso' : 'Marcar como reembolso'}
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
                              title="Eliminar transacción"
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
      </div>

      {/* Confirmation dialog */}
      {confirm && confirmMeta && (
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
                Cancelar
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

      {/* Slide-over panel */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="flex-1 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowForm(false)}
          />
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 h-full shadow-xl flex flex-col overflow-y-auto animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Agregar transacción manual</h2>
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
                  <label className={labelClass}>Fecha *</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setField('date', e.target.value)}
                    required
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Fuente</label>
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
                    <option>Otro</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={labelClass}>Producto / Oferta *</label>
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
                <label className={labelClass}>Monto *</label>
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
                <label className={labelClass}>Nombre del comprador *</label>
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
                  <label className={labelClass}>Teléfono</label>
                  <input
                    type="text"
                    value={form.buyer_phone}
                    onChange={(e) => setField('buyer_phone', e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Moneda</label>
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
                  placeholder="txn_xxx o referencia interna"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Método de pago</label>
                <select
                  value={form.payment_source}
                  onChange={(e) => setField('payment_source', e.target.value)}
                  className={selectClass}
                >
                  <option value="">— Seleccionar —</option>
                  <option>Stripe</option>
                  <option>PayPal</option>
                  <option>Kajabi Payments</option>
                  <option>Credit Card</option>
                  <option>Bank Transfer</option>
                  <option>Cash</option>
                  <option>Otro</option>
                </select>
              </div>

              <div className="mt-auto pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? 'Guardando...' : 'Guardar transacción'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageTransition>
  )
}
