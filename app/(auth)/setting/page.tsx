'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { KPICard } from '@/components/shared/KPICard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StackedBarChart } from '@/components/charts/StackedBarChart'
import { EmptyState } from '@/components/shared/EmptyState'
import { StatusPill } from '@/components/shared/StatusPill'
import { formatDate, getMonthRange } from '@/lib/utils'
import { SetterReport } from '@/types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
} from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { motion } from 'framer-motion'
import { PageTransition } from '@/components/motion/PageTransition'
import { KPICardGrid } from '@/components/motion/KPICardGrid'
import { AnimatedTableRow, rowVariants } from '@/components/motion/AnimatedTableRow'

export const dynamic = 'force-dynamic'

const chartVariants = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, delay: 0.2, ease: 'easeOut' as const } },
}

export default function SettingPage() {
  const supabase = useMemo(() => createClient(), [])
  const [reports, setReports] = useState<SetterReport[]>([])
  const [loading, setLoading] = useState(true)
  const [fromDate, setFromDate] = useState(getMonthRange().from)
  const [toDate, setToDate] = useState(getMonthRange().to)
  const [selectedSetter, setSelectedSetter] = useState('all')

  useEffect(() => {
    async function fetchReports() {
      setLoading(true)
      const { data } = await supabase
        .from('setter_reports')
        .select('*')
        .gte('date', fromDate)
        .lte('date', toDate)
        .order('date', { ascending: false })

      setReports(data ?? [])
      setLoading(false)
    }
    fetchReports()
  }, [fromDate, toDate])

  const setterNames = Array.from(new Set(reports.map((r) => r.setter_name)))
  const filtered = selectedSetter === 'all' ? reports : reports.filter((r) => r.setter_name === selectedSetter)

  const totalConvos = filtered.reduce((s, r) => s + r.total_convos, 0)
  const totalQualified = filtered.reduce((s, r) => s + r.qualified_calls, 0)
  const totalProposed = filtered.reduce((s, r) => s + r.call_proposed, 0)
  const totalFollowUps = filtered.reduce((s, r) => s + r.follow_ups, 0)
  const totalOutbound = filtered.reduce((s, r) => s + r.outbound, 0)
  const avgPerformance = filtered.length > 0
    ? (filtered.reduce((s, r) => s + r.performance_score, 0) / filtered.length).toFixed(1)
    : '0'

  function pct(num: number, den: number, decimals = 1) {
    return den > 0 ? `${((num / den) * 100).toFixed(decimals)}%` : '—'
  }

  const conversionRatePct = pct(totalQualified, totalProposed)
  const proposalRatePct = pct(totalProposed, totalConvos)
  const followUpRatePct = pct(totalFollowUps, totalConvos)
  const outboundRatePct = pct(totalOutbound, totalConvos)

  const chartData = filtered
    .slice()
    .reverse()
    .map((r) => ({
      date: formatDate(r.date),
      follow_ups: r.follow_ups,
      inbound: r.inbound,
      outbound: r.outbound,
    }))

  const chartSeries = [
    { key: 'follow_ups', label: 'Follow-ups', color: '#185FA5' },
    { key: 'inbound', label: 'Inbound', color: '#3B6D11' },
    { key: 'outbound', label: 'Outbound', color: '#BA7517' },
  ]

  function performancePill(score: number) {
    if (score >= 80) return <StatusPill label={`${score}`} variant="success" />
    if (score >= 60) return <StatusPill label={`${score}`} variant="warning" />
    return <StatusPill label={`${score}`} variant="danger" />
  }

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto">
        <PageHeader title="Setter Performance" description="DM conversations and qualified calls">
          <div className="flex items-center gap-2 flex-wrap">
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
            <Select value={selectedSetter} onValueChange={(v) => setSelectedSetter(v ?? 'all')}>
              <SelectTrigger className="h-8 text-xs w-40">
                <SelectValue placeholder="All setters" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Setters</SelectItem>
                {setterNames.map((n) => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </PageHeader>

        <KPICardGrid className="grid gap-4 grid-cols-2 lg:grid-cols-3 mb-6">
          <KPICard title="Total Convos" value={totalConvos} loading={loading} />
          <KPICard title="Qualified Calls" value={totalQualified} subtitle={`${conversionRatePct} conversion`} loading={loading} />
          <KPICard title="Call Proposed" value={totalProposed} subtitle={`${proposalRatePct} proposal rate`} loading={loading} />
          <KPICard title="Follow-ups" value={totalFollowUps} subtitle={`${followUpRatePct} of convos`} loading={loading} />
          <KPICard title="Outbound" value={totalOutbound} subtitle={`${outboundRatePct} outbound`} loading={loading} />
          <KPICard title="Avg Performance" value={avgPerformance} subtitle="/ 100" loading={loading} />
        </KPICardGrid>

        <motion.div className="mb-6" variants={chartVariants} initial="hidden" animate="visible">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Daily Volume Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-64 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
              ) : chartData.length === 0 ? (
                <EmptyState title="No data for this period" />
              ) : (
                <StackedBarChart data={chartData} series={chartSeries} />
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          className="mb-6"
          variants={chartVariants}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' as const }}
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Conversion Funnel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[
                  { label: 'Total Conversations', value: totalConvos, color: 'bg-blue-500' },
                  { label: 'Call Proposed', value: totalProposed, color: 'bg-amber-500' },
                  { label: 'Qualified Calls', value: totalQualified, color: 'bg-emerald-500' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">{value}</span>
                    </div>
                    <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full">
                      <div
                        className={`h-full ${color} rounded-full transition-all`}
                        style={{ width: totalConvos > 0 ? `${(value / totalConvos) * 100}%` : '0%' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Daily Reports</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-10 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState title="No setter reports" description="Reports will appear here once submitted." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <AnimatedTableRow variants={rowVariants} initial="hidden" animate="visible" custom={0}>
                      <TableHead>Date</TableHead>
                      <TableHead>Setter</TableHead>
                      <TableHead className="text-center">Convos</TableHead>
                      <TableHead className="text-center">Qualified</TableHead>
                      <TableHead className="text-center hidden md:table-cell">DQ&apos;d</TableHead>
                      <TableHead className="text-center hidden md:table-cell">Hours</TableHead>
                      <TableHead className="text-center">Score</TableHead>
                    </AnimatedTableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r, i) => (
                      <AnimatedTableRow key={r.id} variants={rowVariants} initial="hidden" animate="visible" custom={i}>
                        <TableCell className="text-xs text-zinc-500 whitespace-nowrap">{formatDate(r.date)}</TableCell>
                        <TableCell className="text-sm font-medium">{r.setter_name}</TableCell>
                        <TableCell className="text-center text-sm">{r.total_convos}</TableCell>
                        <TableCell className="text-center">
                          <StatusPill label={String(r.qualified_calls)} variant="success" />
                        </TableCell>
                        <TableCell className="text-center hidden md:table-cell">
                          {r.disqualified > 0 ? <StatusPill label={String(r.disqualified)} variant="danger" /> : <span className="text-xs text-zinc-400">0</span>}
                        </TableCell>
                        <TableCell className="text-center text-sm hidden md:table-cell">{r.hours_worked}h</TableCell>
                        <TableCell className="text-center">{performancePill(r.performance_score)}</TableCell>
                      </AnimatedTableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {!loading && filtered.some((r) => r.highs || r.lows) && (
          <div className="grid gap-4 lg:grid-cols-2 mt-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-emerald-600">Highs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {filtered.filter((r) => r.highs).map((r) => (
                  <div key={r.id} className="text-xs text-zinc-600 dark:text-zinc-400 border-l-2 border-emerald-400 pl-3 py-1">
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">{r.setter_name} ({formatDate(r.date)}): </span>
                    {r.highs}
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-red-600">Lows</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {filtered.filter((r) => r.lows).map((r) => (
                  <div key={r.id} className="text-xs text-zinc-600 dark:text-zinc-400 border-l-2 border-red-400 pl-3 py-1">
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">{r.setter_name} ({formatDate(r.date)}): </span>
                    {r.lows}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </PageTransition>
  )
}
