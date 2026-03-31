'use client'

import { useEffect, useState, useMemo } from 'react'
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

export const dynamic = 'force-dynamic'

type Tab = 'overview' | 'active' | 'trials'

const chartVariants = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, delay: 0.2, ease: 'easeOut' as const } },
}

export default function SpcPage() {
  const supabase = useMemo(() => createClient(), [])
  const [members, setMembers] = useState<SpcMember[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  useEffect(() => {
    async function fetchMembers() {
      const { data } = await supabase
        .from('spc_members')
        .select('*')
        .order('joined_at', { ascending: false })

      setMembers(data ?? [])
      setLoading(false)
    }
    fetchMembers()
  }, [])

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
    .map(([date, revenue]) => ({ date, revenue }))

  const urgentTrials = trialMembers
    .filter((m) => m.trial_end_date && daysUntil(m.trial_end_date) <= 14)
    .sort((a, b) => daysUntil(a.trial_end_date!) - daysUntil(b.trial_end_date!))

  const sortedTrials = [...trialMembers].sort((a, b) => {
    const da = a.trial_end_date ? daysUntil(a.trial_end_date) : 9999
    const db = b.trial_end_date ? daysUntil(b.trial_end_date) : 9999
    return da - db
  })

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
    { key: 'overview', label: 'Overview' },
    { key: 'active', label: `Active Members${!loading ? ` (${activeMembers.length})` : ''}` },
    { key: 'trials', label: `Free Trials${!loading ? ` (${trialMembers.length})` : ''}` },
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

            <div className="grid gap-4 lg:grid-cols-2 mb-6">
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
                <div className="grid grid-cols-3 gap-6">
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
                <Table>
                  <TableHeader>
                    <AnimatedTableRow variants={rowVariants} initial="hidden" animate="visible" custom={0}>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Next Payment</TableHead>
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
                        className={i % 2 === 0 ? 'bg-white dark:bg-zinc-900' : 'bg-zinc-50 dark:bg-zinc-800/50'}
                      >
                        <TableCell className="font-medium text-sm">{m.name}</TableCell>
                        <TableCell className="text-xs text-zinc-500">{m.email}</TableCell>
                        <TableCell>
                          <StatusPill
                            label={m.plan === 'annual' ? 'Annual' : 'Monthly'}
                            variant={m.plan === 'annual' ? 'success' : 'info'}
                          />
                        </TableCell>
                        <TableCell className="text-right font-semibold text-sm">
                          {formatCurrency(m.amount)}
                        </TableCell>
                        <TableCell className="text-xs text-zinc-500">{m.provider}</TableCell>
                        <TableCell className="text-xs text-zinc-500 whitespace-nowrap">{formatDate(m.joined_at)}</TableCell>
                        <TableCell className="text-xs text-zinc-500 whitespace-nowrap">{formatDate(m.next_payment_date)}</TableCell>
                      </AnimatedTableRow>
                    ))}
                  </TableBody>
                </Table>
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
                  <Table>
                    <TableHeader>
                      <AnimatedTableRow variants={rowVariants} initial="hidden" animate="visible" custom={0}>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Trial Start</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead>Days Left</TableHead>
                        <TableHead>Payment Method</TableHead>
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
                          className={i % 2 === 0 ? 'bg-white dark:bg-zinc-900' : 'bg-zinc-50 dark:bg-zinc-800/50'}
                        >
                          <TableCell className="font-medium text-sm">{m.name}</TableCell>
                          <TableCell className="text-xs text-zinc-500">{m.email}</TableCell>
                          <TableCell className="text-xs text-zinc-500 whitespace-nowrap">{formatDate(m.joined_at)}</TableCell>
                          <TableCell className="text-xs text-zinc-500 whitespace-nowrap">
                            {m.trial_end_date ? formatDate(m.trial_end_date) : '—'}
                          </TableCell>
                          <TableCell>{trialUrgencyPill(m)}</TableCell>
                          <TableCell className="text-xs text-zinc-500">{m.provider}</TableCell>
                        </AnimatedTableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </PageTransition>
  )
}
