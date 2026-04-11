'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { KPICard } from '@/components/shared/KPICard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RevenueBarChart } from '@/components/charts/RevenueBarChart'
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
import { DollarSign, Users, TrendingUp, Phone } from 'lucide-react'
import { motion } from 'framer-motion'
import { PageTransition } from '@/components/motion/PageTransition'
import { KPICardGrid } from '@/components/motion/KPICardGrid'
import { AnimatedTableRow, rowVariants } from '@/components/motion/AnimatedTableRow'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const SPC_CUTOFF = '2026-03-27'

interface DashboardStats {
  totalRevenue: number
  activeMembers: number
  trialMembers: number
  totalTransactions: number
  qualifiedCalls: number
  wonDeals: number
  mrr: number
  mrrBefore: number
  spcNewMembers: number
  churnRate: number
  recentTransactions: Transaction[]
  dailyRevenue: { label: string; revenue: number }[]
}

const chartVariants = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, delay: 0.2, ease: 'easeOut' as const } },
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      const { from, to } = getMonthRange()

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)

      const [txResult, spcResult, setterResult, closerResult, cancelsResult] =
        await Promise.all([
          supabase
            .from('transactions')
            .select('*')
            .gte('date', from)
            .lte('date', to)
            .order('date', { ascending: false }),
          supabase.from('spc_members').select('*'),
          supabase.from('setter_reports').select('qualified_calls').gte('date', from).lte('date', to),
          supabase.from('closer_reports').select('won_deals, cash_collected').gte('date', from).lte('date', to),
          supabase
            .from('spc_cancellations')
            .select('id')
            .eq('cancel_type', 'paid_cancel')
            .gte('cancelled_at', thirtyDaysAgo),
        ])

      const transactions: Transaction[] = txResult.data ?? []
      const members: { status: string; plan: string; amount: number; created_at: string }[] = spcResult.data ?? []
      const setterReports: { qualified_calls: number }[] = setterResult.data ?? []
      const closerReports: { won_deals: number; cash_collected: number }[] = closerResult.data ?? []
      const recentCancels: { id: string }[] = cancelsResult.data ?? []

      const totalRevenue = transactions.reduce((s, t) => s + t.cost, 0)
      const activeMembers = members.filter((m) => m.status === 'active').length
      const trialMembers = members.filter((m) => m.status === 'trial').length
      const qualifiedCalls = setterReports.reduce((s, r) => s + (r.qualified_calls ?? 0), 0)
      const wonDeals = closerReports.reduce((s, r) => s + (r.won_deals ?? 0), 0)

      const activeMembersList = members.filter((m) => m.status === 'active')
      const mrr = activeMembersList.reduce(
        (s, m) => s + (m.plan === 'annual' ? m.amount / 12 : m.amount),
        0
      )

      const membersBefore = activeMembersList.filter(
        (m) => (m.created_at?.slice(0, 10) ?? '') <= SPC_CUTOFF
      )
      const mrrBefore = membersBefore.reduce(
        (s, m) => s + (m.plan === 'annual' ? m.amount / 12 : m.amount),
        0
      )
      const spcNewMembers = activeMembersList.filter(
        (m) => (m.created_at?.slice(0, 10) ?? '') > SPC_CUTOFF
      ).length

      const churnRate =
        activeMembersList.length > 0
          ? parseFloat(
              ((recentCancels.length / activeMembersList.length) * 100).toFixed(1)
            )
          : 0

      const dailyMap: Record<string, number> = {}
      transactions.forEach((t) => {
        const d = formatShortDate(t.date)
        dailyMap[d] = (dailyMap[d] ?? 0) + t.cost
      })
      const dailyRevenue = Object.entries(dailyMap)
        .map(([date, revenue]) => ({ label: date, revenue }))
        .sort((a, b) => a.label.localeCompare(b.label))

      setStats({
        totalRevenue,
        activeMembers,
        trialMembers,
        totalTransactions: transactions.length,
        qualifiedCalls,
        wonDeals,
        mrr,
        mrrBefore,
        spcNewMembers,
        churnRate,
        recentTransactions: transactions.slice(0, 10),
        dailyRevenue,
      })
      setLoading(false)
    }

    fetchStats()
  }, [])

  const arr = (stats?.mrr ?? 0) * 12
  const mrrPct =
    stats && stats.mrrBefore > 0
      ? Math.round(((stats.mrr - stats.mrrBefore) / stats.mrrBefore) * 1000) / 10
      : 0

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto">
        <PageHeader
          title="Dashboard"
          description="Overview of your business this month"
        />

        <KPICardGrid className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
          <KPICard
            title="Monthly Revenue"
            value={loading ? '—' : formatCurrency(stats?.totalRevenue ?? 0)}
            subtitle="current month"
            icon={<DollarSign className="h-4 w-4" />}
            loading={loading}
          />
          <KPICard
            title="MRR"
            value={loading ? '—' : formatCurrency(stats?.mrr ?? 0)}
            subtitle="from SPC members"
            icon={<TrendingUp className="h-4 w-4" />}
            loading={loading}
          />
          <KPICard
            title="Active Members"
            value={loading ? '—' : stats?.activeMembers ?? 0}
            subtitle={`${stats?.trialMembers ?? 0} on trial`}
            icon={<Users className="h-4 w-4" />}
            loading={loading}
          />
          <KPICard
            title="Qualified Calls"
            value={loading ? '—' : stats?.qualifiedCalls ?? 0}
            subtitle={`${stats?.wonDeals ?? 0} deals won`}
            icon={<Phone className="h-4 w-4" />}
            loading={loading}
          />
        </KPICardGrid>

        <div className="grid gap-4 grid-cols-1 lg:grid-cols-3 mb-6">
          <motion.div className="lg:col-span-2" variants={chartVariants} initial="hidden" animate="visible">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Daily Revenue — {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-64 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
                ) : stats?.dailyRevenue.length === 0 ? (
                  <EmptyState title="No revenue data" description="Transactions will appear here." />
                ) : (
                  <RevenueBarChart data={stats?.dailyRevenue ?? []} />
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={chartVariants} initial="hidden" animate="visible" transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' as const }}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Quick Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: 'Total Transactions', value: stats?.totalTransactions ?? 0 },
                  { label: 'Avg Ticket', value: stats && stats.totalTransactions > 0 ? formatCurrency(stats.totalRevenue / stats.totalTransactions) : '—' },
                  { label: 'Qualified Calls', value: stats?.qualifiedCalls ?? 0 },
                  { label: 'Won Deals', value: stats?.wonDeals ?? 0 },
                  { label: 'Free Trials', value: stats?.trialMembers ?? 0 },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {loading ? '—' : value}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* SPC Growth Widget */}
        <motion.div
          variants={chartVariants}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.4, delay: 0.35, ease: 'easeOut' as const }}
          className="mb-6"
        >
          <Link href="/spc" className="block group">
            <Card className="border-l-4 border-l-[#185FA5] hover:shadow-md transition-shadow duration-200 cursor-pointer">
              <CardContent className="py-4 px-5">
                {loading ? (
                  <div className="h-8 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                ) : (
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    {/* Members */}
                    <div className="flex items-center gap-2">
                      <span className="text-base leading-none">👥</span>
                      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {stats?.activeMembers ?? 0} miembros activos
                      </span>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-medium">
                        ↑{stats?.spcNewMembers ?? 0} nuevos
                      </span>
                    </div>

                    <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 hidden sm:block" />

                    {/* MRR */}
                    <div className="flex items-center gap-2">
                      <span className="text-base leading-none">💰</span>
                      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {formatCurrency(stats?.mrr ?? 0)} MRR
                      </span>
                      {mrrPct > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-medium">
                          ↑{mrrPct}%
                        </span>
                      )}
                    </div>

                    <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 hidden sm:block" />

                    {/* ARR */}
                    <div className="flex items-center gap-2">
                      <span className="text-base leading-none">📈</span>
                      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {formatCurrency(arr)} ARR
                      </span>
                    </div>

                    <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 hidden sm:block" />

                    {/* Churn */}
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-semibold ${
                          (stats?.churnRate ?? 0) < 3
                            ? 'text-green-600'
                            : (stats?.churnRate ?? 0) <= 6
                            ? 'text-amber-600'
                            : 'text-red-600'
                        }`}
                      >
                        {(stats?.churnRate ?? 0) === 0 ? '✓ ' : ''}
                        {stats?.churnRate ?? 0}% Churn
                      </span>
                    </div>

                    {/* Right arrow hint */}
                    <span className="ml-auto text-xs text-zinc-400 group-hover:text-[#185FA5] transition-colors hidden sm:block">
                      Ver SPC →
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        </motion.div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-10 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                ))}
              </div>
            ) : !stats?.recentTransactions.length ? (
              <EmptyState title="No transactions yet" description="Transactions from Kajabi and GoHighLevel will appear here." />
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
                    {stats.recentTransactions.map((tx, i) => (
                      <AnimatedTableRow key={tx.id} variants={rowVariants} initial="hidden" animate="visible" custom={i}>
                        <TableCell className="text-xs text-zinc-500 whitespace-nowrap">{formatDate(tx.date)}</TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{tx.buyer_name}</div>
                          <div className="text-xs text-zinc-400 hidden md:block">{tx.buyer_email}</div>
                        </TableCell>
                        <TableCell className="text-sm max-w-48 truncate hidden md:table-cell">{tx.offer_title}</TableCell>
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
    </PageTransition>
  )
}
