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
import { formatCurrency, formatDate, formatShortDate, getMonthRange } from '@/lib/utils'
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
import { Search, Plus, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { PageTransition } from '@/components/motion/PageTransition'
import { KPICardGrid } from '@/components/motion/KPICardGrid'
import { AnimatedTableRow, rowVariants } from '@/components/motion/AnimatedTableRow'
import { toast } from 'sonner'

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

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

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
}

type FormData = typeof emptyForm

const inputClass =
  'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400'

const selectClass =
  'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400'

const labelClass = 'block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1'

export default function SalesPage() {
  const supabase = useMemo(() => createClient(), [])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState(getMonthRange().from)
  const [toDate, setToDate] = useState(getMonthRange().to)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function fetchTransactions() {
      setLoading(true)
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .gte('date', fromDate)
        .lte('date', toDate)
        .order('date', { ascending: false })

      setTransactions(data ?? [])
      setLoading(false)
    }
    fetchTransactions()
  }, [fromDate, toDate])

  function set(field: keyof FormData, value: string) {
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
      })
      .select()
      .single()

    setSubmitting(false)

    if (error) {
      toast.error(`Error: ${error.message}`)
      return
    }

    // Optimistic update
    setTransactions((prev) => [data as Transaction, ...prev])
    setShowForm(false)
    setForm({ ...emptyForm, date: todayStr() })
    toast.success('Transacción guardada')
  }

  const filtered = transactions.filter(
    (t) =>
      t.buyer_name.toLowerCase().includes(search.toLowerCase()) ||
      (t.buyer_email ?? '').toLowerCase().includes(search.toLowerCase()) ||
      t.offer_title.toLowerCase().includes(search.toLowerCase())
  )

  const totalRevenue = transactions.reduce((s, t) => s + t.cost, 0)
  const avgTicket = transactions.length > 0 ? totalRevenue / transactions.length : 0

  const dailyMap: Record<string, number> = {}
  transactions.forEach((t) => {
    dailyMap[t.date] = (dailyMap[t.date] ?? 0) + t.cost
  })
  const dailyRevenue = Object.entries(dailyMap)
    .map(([date, revenue]) => ({ date: formatShortDate(date), revenue }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const bestDay = Object.entries(dailyMap).sort((a, b) => b[1] - a[1])[0]

  const kajabi = transactions.filter((t) => t.source === 'Kajabi').reduce((s, t) => s + t.cost, 0)
  const ghl = transactions.filter((t) => t.source === 'GoHighLevel').reduce((s, t) => s + t.cost, 0)
  const sourceData = [
    { name: 'Kajabi', value: kajabi, color: '#185FA5' },
    { name: 'GoHighLevel', value: ghl, color: '#3B6D11' },
  ]

  const productMap: Record<string, ProductStat> = {}
  transactions.forEach((t) => {
    if (!productMap[t.offer_title]) {
      productMap[t.offer_title] = { name: t.offer_title, revenue: 0, count: 0 }
    }
    productMap[t.offer_title].revenue += t.cost
    productMap[t.offer_title].count++
  })
  const products = Object.values(productMap).sort((a, b) => b.revenue - a.revenue)
  const maxRevenue = products[0]?.revenue ?? 1

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto">
        <PageHeader title="Sales Report" description="Revenue and transaction analytics">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            />
            <span className="text-xs text-zinc-400">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            />
            <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Agregar venta
            </Button>
          </div>
        </PageHeader>

        <KPICardGrid className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
          <KPICard title="Total Revenue" value={formatCurrency(totalRevenue)} subtitle="selected period" loading={loading} />
          <KPICard title="Transactions" value={transactions.length} subtitle="total" loading={loading} />
          <KPICard title="Avg Ticket" value={formatCurrency(avgTicket)} subtitle="per transaction" loading={loading} />
          <KPICard
            title="Best Day"
            value={bestDay ? formatCurrency(bestDay[1]) : '—'}
            subtitle={bestDay ? formatDate(bestDay[0]) : 'no data'}
            loading={loading}
          />
        </KPICardGrid>

        <div className="grid gap-4 grid-cols-1 lg:grid-cols-3 mb-6">
          <motion.div className="lg:col-span-2" variants={chartVariants} initial="hidden" animate="visible">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Daily Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-64 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
                ) : dailyRevenue.length === 0 ? (
                  <EmptyState title="No revenue data" description="No transactions in selected period." />
                ) : (
                  <RevenueBarChart data={dailyRevenue} />
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
                      <TableHead className="text-right">Amount</TableHead>
                    </AnimatedTableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((tx, i) => (
                      <AnimatedTableRow key={tx.id} variants={rowVariants} initial="hidden" animate="visible" custom={i}>
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
                        <TableCell className="text-right font-semibold text-sm whitespace-nowrap">
                          {formatCurrency(tx.cost, tx.currency)}
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

      {/* Slide-over panel */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="flex-1 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowForm(false)}
          />
          {/* Panel */}
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 h-full shadow-xl flex flex-col overflow-y-auto animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Agregar transacción manual</h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col p-5 gap-4">
              {/* Date + Source */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Fecha *</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => set('date', e.target.value)}
                    required
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Fuente</label>
                  <select
                    value={form.source}
                    onChange={(e) => set('source', e.target.value)}
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

              {/* Product / Offer */}
              <div>
                <label className={labelClass}>Producto / Oferta *</label>
                <input
                  type="text"
                  value={form.offer_title}
                  onChange={(e) => set('offer_title', e.target.value)}
                  placeholder="Ej: Parenting With Understanding GROUP Coaching"
                  required
                  className={inputClass}
                />
              </div>

              {/* Amount */}
              <div>
                <label className={labelClass}>Monto *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-base font-semibold select-none">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.cost}
                    onChange={(e) => set('cost', e.target.value)}
                    placeholder="0.00"
                    required
                    className={`${inputClass} pl-7 text-lg font-semibold`}
                  />
                </div>
              </div>

              {/* Buyer name */}
              <div>
                <label className={labelClass}>Nombre del comprador *</label>
                <input
                  type="text"
                  value={form.buyer_name}
                  onChange={(e) => set('buyer_name', e.target.value)}
                  required
                  className={inputClass}
                />
              </div>

              {/* Email */}
              <div>
                <label className={labelClass}>Email</label>
                <input
                  type="email"
                  value={form.buyer_email}
                  onChange={(e) => set('buyer_email', e.target.value)}
                  className={inputClass}
                />
              </div>

              {/* Phone + Currency */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Teléfono</label>
                  <input
                    type="text"
                    value={form.buyer_phone}
                    onChange={(e) => set('buyer_phone', e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Moneda</label>
                  <select
                    value={form.currency}
                    onChange={(e) => set('currency', e.target.value)}
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

              {/* Transaction ID */}
              <div>
                <label className={labelClass}>Transaction ID</label>
                <input
                  type="text"
                  value={form.transaction_id}
                  onChange={(e) => set('transaction_id', e.target.value)}
                  placeholder="txn_xxx o referencia interna"
                  className={inputClass}
                />
              </div>

              {/* Spacer + Submit */}
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
