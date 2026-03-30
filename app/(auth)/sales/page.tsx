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
import { Search } from 'lucide-react'
import { motion } from 'framer-motion'
import { PageTransition } from '@/components/motion/PageTransition'
import { KPICardGrid } from '@/components/motion/KPICardGrid'
import { AnimatedTableRow, rowVariants } from '@/components/motion/AnimatedTableRow'

export const dynamic = 'force-dynamic'

interface ProductStat {
  name: string
  revenue: number
  count: number
}

const chartVariants = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, delay: 0.2, ease: 'easeOut' } },
}

export default function SalesPage() {
  const supabase = useMemo(() => createClient(), [])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState(getMonthRange().from)
  const [toDate, setToDate] = useState(getMonthRange().to)

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

  const filtered = transactions.filter(
    (t) =>
      t.buyer_name.toLowerCase().includes(search.toLowerCase()) ||
      t.buyer_email.toLowerCase().includes(search.toLowerCase()) ||
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

        <div className="grid gap-4 lg:grid-cols-3 mb-6">
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

          <motion.div variants={chartVariants} initial="hidden" animate="visible" transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}>
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
              <Table>
                <TableHeader>
                  <AnimatedTableRow variants={rowVariants} initial="hidden" animate="visible" custom={0}>
                    <TableHead>Date</TableHead>
                    <TableHead>Buyer</TableHead>
                    <TableHead>Offer</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </AnimatedTableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((tx, i) => (
                    <AnimatedTableRow key={tx.id} variants={rowVariants} initial="hidden" animate="visible" custom={i}>
                      <TableCell className="text-xs text-zinc-500 whitespace-nowrap">{formatDate(tx.date)}</TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{tx.buyer_name}</div>
                        <div className="text-xs text-zinc-400">{tx.buyer_email}</div>
                      </TableCell>
                      <TableCell className="text-sm text-zinc-700 dark:text-zinc-300 max-w-56 truncate">{tx.offer_title}</TableCell>
                      <TableCell>
                        <StatusPill
                          label={tx.source}
                          variant={tx.source === 'Kajabi' ? 'info' : 'purple'}
                        />
                      </TableCell>
                      <TableCell className="text-right font-semibold text-sm">
                        {formatCurrency(tx.cost, tx.currency)}
                      </TableCell>
                    </AnimatedTableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  )
}
