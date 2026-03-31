'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { KPICard } from '@/components/shared/KPICard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DonutChart } from '@/components/charts/DonutChart'
import { RevenueBarChart } from '@/components/charts/RevenueBarChart'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency, formatDate, getMonthRange } from '@/lib/utils'
import { CloserReport } from '@/types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { PageTransition } from '@/components/motion/PageTransition'
import { KPICardGrid } from '@/components/motion/KPICardGrid'
import { AnimatedTableRow, rowVariants } from '@/components/motion/AnimatedTableRow'

export const dynamic = 'force-dynamic'

const CLOSERS = ['All', 'Cali Luna', 'Marcela HIC Parenting']

const chartVariants = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, delay: 0.2, ease: 'easeOut' as const } },
}

export default function ClosingPage() {
  const supabase = useMemo(() => createClient(), [])
  const [reports, setReports] = useState<CloserReport[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCloser, setSelectedCloser] = useState('All')
  const [fromDate, setFromDate] = useState(getMonthRange().from)
  const [toDate, setToDate] = useState(getMonthRange().to)

  useEffect(() => {
    async function fetchReports() {
      setLoading(true)
      const { data } = await supabase
        .from('closer_reports')
        .select('*')
        .gte('date', fromDate)
        .lte('date', toDate)
        .order('date', { ascending: false })

      setReports(data ?? [])
      setLoading(false)
    }
    fetchReports()
  }, [fromDate, toDate])

  const filtered = selectedCloser === 'All' ? reports : reports.filter((r) => r.closer_name === selectedCloser)

  const totalMeetings = filtered.reduce((s, r) => s + r.total_meetings, 0)
  const showed = filtered.reduce((s, r) => s + r.showed_meetings, 0)
  const noShows = filtered.reduce((s, r) => s + r.no_show_meetings, 0)
  const rescheduled = filtered.reduce((s, r) => s + r.rescheduled_meetings, 0)
  const offersProposed = filtered.reduce((s, r) => s + r.offers_proposed, 0)
  const wonDeals = filtered.reduce((s, r) => s + r.won_deals, 0)
  const cashCollected = filtered.reduce((s, r) => s + r.cash_collected, 0)

  function pct(num: number, den: number, decimals = 1) {
    return den > 0 ? `${((num / den) * 100).toFixed(decimals)}%` : '—'
  }

  const showRatePct = pct(showed, totalMeetings)
  const noShowRatePct = pct(noShows, totalMeetings)
  const wonRatePct = pct(wonDeals, offersProposed)
  const rescheduleRatePct = pct(rescheduled, totalMeetings)

  const outcomeData = [
    { name: 'Won', value: filtered.reduce((s, r) => s + r.won_deals, 0), color: '#3B6D11' },
    { name: 'Lost', value: filtered.reduce((s, r) => s + r.lost_deals, 0), color: '#A32D2D' },
    { name: 'No Show', value: filtered.reduce((s, r) => s + r.no_show_meetings, 0), color: '#BA7517' },
    { name: 'Cancelled', value: filtered.reduce((s, r) => s + r.cancelled_meetings, 0), color: '#71717a' },
  ].filter((d) => d.value > 0)

  const dailyCashData = [...filtered]
    .reverse()
    .map((r) => ({ date: formatDate(r.date), revenue: r.cash_collected }))

  const closerMap: Record<string, { meetings: number; won: number; cash: number; showRate: number }> = {}
  reports.forEach((r) => {
    if (!closerMap[r.closer_name]) {
      closerMap[r.closer_name] = { meetings: 0, won: 0, cash: 0, showRate: 0 }
    }
    closerMap[r.closer_name].meetings += r.total_meetings
    closerMap[r.closer_name].won += r.won_deals
    closerMap[r.closer_name].cash += r.cash_collected
  })
  Object.entries(closerMap).forEach(([name, stats]) => {
    const showed = reports.filter((r) => r.closer_name === name).reduce((s, r) => s + r.showed_meetings, 0)
    closerMap[name].showRate = stats.meetings > 0 ? Math.round((showed / stats.meetings) * 100) : 0
  })

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto">
        <PageHeader title="Closer Performance" description="Meeting outcomes and revenue closed">
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

        {/* Closer tabs */}
        <div className="border-b border-zinc-200 dark:border-zinc-800 mb-6">
          <nav className="flex items-end gap-0 -mb-px">
            {CLOSERS.map((c) => {
              const isActive = selectedCloser === c
              return (
                <button
                  key={c}
                  onClick={() => setSelectedCloser(c)}
                  className={cn(
                    'relative px-4 h-10 text-sm font-medium whitespace-nowrap',
                    isActive
                      ? 'text-[#185FA5] font-semibold'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                  )}
                >
                  {c}
                  {isActive && (
                    <motion.span
                      layoutId="closer-tab-underline"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#185FA5]"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                </button>
              )
            })}
          </nav>
        </div>

        <KPICardGrid className="grid gap-4 grid-cols-2 lg:grid-cols-3 mb-6">
          <KPICard title="Total Meetings" value={totalMeetings} loading={loading} />
          <KPICard title="Showed" value={showed} subtitle={`${showRatePct} show rate`} loading={loading} />
          <KPICard title="No-Shows" value={noShows} subtitle={`${noShowRatePct} no-show`} loading={loading} />
          <KPICard title="Won Deals" value={wonDeals} subtitle={`${wonRatePct} close rate`} loading={loading} />
          <KPICard title="Reschedules" value={rescheduled} subtitle={`${rescheduleRatePct} rescheduled`} loading={loading} />
          <KPICard title="Cash Collected" value={formatCurrency(cashCollected)} loading={loading} />
        </KPICardGrid>

        <div className="grid gap-4 grid-cols-1 lg:grid-cols-3 mb-6">
          <motion.div variants={chartVariants} initial="hidden" animate="visible">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Meeting Outcomes</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-52 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
                ) : outcomeData.length === 0 ? (
                  <EmptyState title="No data" />
                ) : (
                  <DonutChart data={outcomeData} />
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            className="lg:col-span-2"
            variants={chartVariants}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' as const }}
          >
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Daily Cash Collected</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-52 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
                ) : dailyCashData.length === 0 ? (
                  <EmptyState title="No data" />
                ) : (
                  <RevenueBarChart data={dailyCashData} color="#3B6D11" />
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Closer comparison */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Closer Comparison</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-10 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                ))}
              </div>
            ) : Object.keys(closerMap).length === 0 ? (
              <EmptyState title="No closer data" />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <AnimatedTableRow variants={rowVariants} initial="hidden" animate="visible" custom={0}>
                      <TableHead>Closer</TableHead>
                      <TableHead className="text-center">Meetings</TableHead>
                      <TableHead className="text-center hidden md:table-cell">Show Rate</TableHead>
                      <TableHead className="text-center">Won</TableHead>
                      <TableHead className="text-right">Cash Collected</TableHead>
                    </AnimatedTableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(closerMap).map(([name, stats], i) => (
                      <AnimatedTableRow key={name} variants={rowVariants} initial="hidden" animate="visible" custom={i}>
                        <TableCell className="font-medium text-sm">{name}</TableCell>
                        <TableCell className="text-center text-sm">{stats.meetings}</TableCell>
                        <TableCell className="text-center text-sm hidden md:table-cell">{stats.showRate}%</TableCell>
                        <TableCell className="text-center text-sm">{stats.won}</TableCell>
                        <TableCell className="text-right font-semibold text-sm whitespace-nowrap">
                          {formatCurrency(stats.cash)}
                        </TableCell>
                      </AnimatedTableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Session detail */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Session Details</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-10 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState title="No sessions found" />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <AnimatedTableRow variants={rowVariants} initial="hidden" animate="visible" custom={0}>
                      <TableHead>Date</TableHead>
                      <TableHead>Closer</TableHead>
                      <TableHead className="text-center">Meetings</TableHead>
                      <TableHead className="text-center hidden md:table-cell">Showed</TableHead>
                      <TableHead className="text-center">Won</TableHead>
                      <TableHead className="text-center hidden md:table-cell">Lost</TableHead>
                      <TableHead className="text-right">Cash</TableHead>
                    </AnimatedTableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r, i) => (
                      <AnimatedTableRow key={r.id} variants={rowVariants} initial="hidden" animate="visible" custom={i}>
                        <TableCell className="text-xs text-zinc-500 whitespace-nowrap">{formatDate(r.date)}</TableCell>
                        <TableCell className="text-sm font-medium">{r.closer_name}</TableCell>
                        <TableCell className="text-center text-sm">{r.total_meetings}</TableCell>
                        <TableCell className="text-center text-sm hidden md:table-cell">{r.showed_meetings}</TableCell>
                        <TableCell className="text-center text-sm text-emerald-600 dark:text-emerald-400 font-medium">{r.won_deals}</TableCell>
                        <TableCell className="text-center text-sm text-red-600 dark:text-red-400 hidden md:table-cell">{r.lost_deals}</TableCell>
                        <TableCell className="text-right font-semibold text-sm whitespace-nowrap">
                          {formatCurrency(r.cash_collected)}
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
    </PageTransition>
  )
}
