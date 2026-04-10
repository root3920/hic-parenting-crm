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

export default function SpcPage() {
  const supabase = useMemo(() => createClient(), [])
  const [members, setMembers] = useState<SpcMember[]>([])
  const [cancellations, setCancellations] = useState<SpcCancellation[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('growth')

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
    .map(([date, revenue]) => ({ date, revenue }))

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
      label: 'Antes (Mar 27)',
      monthly: BASELINE.mrrMonthly,
      annual: BASELINE.mrrAnnual,
      total: BASELINE.mrr,
    },
    {
      label: 'Ahora',
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
    { key: 'growth', label: 'Crecimiento' },
    { key: 'overview', label: 'Overview' },
    { key: 'active', label: `Active Members${!loading ? ` (${activeMembers.length})` : ''}` },
    { key: 'trials', label: `Free Trials${!loading ? ` (${trialMembers.length})` : ''}` },
    { key: 'cancellations', label: `Cancelaciones${!loading ? ` (${paidCancels.length + pendingCancels.length})` : ''}` },
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
                        +{deltaMembersCount} nuevos · ↑{deltaMembersPct}%
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
                        <span className="text-sm text-zinc-400">mensual</span>
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${churnBadgeClass}`}>
                        {thisMonthCancels.length} cancelaciones este mes
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
                  <CardTitle className="text-sm font-semibold">Mensuales vs Anuales</CardTitle>
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
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">Mensual</span>
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
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">Anual</span>
                          <span className="text-zinc-600 dark:text-zinc-400 font-medium">
                            {BASELINE.annualMembers} → {annualCount}{' '}
                            <span className="text-zinc-500 font-normal">
                              {annualCount === BASELINE.annualMembers
                                ? '(sin cambio)'
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
                        Todo el crecimiento vino de planes mensuales
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Right: MRR Antes vs Ahora stacked bar */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">MRR Antes vs Ahora</CardTitle>
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
                            name === 'monthly' ? 'Mensual' : 'Anual (prorrateado)',
                          ]}
                          cursor={{ fill: '#f4f4f5' }}
                        />
                        <Legend
                          iconType="circle"
                          iconSize={8}
                          formatter={(value) => (
                            <span className="text-xs text-zinc-600 dark:text-zinc-400">
                              {value === 'monthly' ? 'Mensual' : 'Anual (prorrateado)'}
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
                  Nuevos miembros activos
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
                  <EmptyState title="Sin nuevos miembros" description="Los miembros que se unan después de Mar 27 aparecerán aquí." />
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
                          Mensual ${m.amount}
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
                          className={i % 2 === 0 ? 'bg-white dark:bg-zinc-900' : 'bg-zinc-50 dark:bg-zinc-800/50'}
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
                            className={i % 2 === 0 ? 'bg-white dark:bg-zinc-900' : 'bg-zinc-50 dark:bg-zinc-800/50'}
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
                    Cancelaciones pagadas
                  </p>
                  {loading ? (
                    <div className="h-10 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                  ) : (
                    <>
                      <p className="text-2xl font-semibold text-red-600 dark:text-red-400">
                        {paidCancels.length}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">suscripciones pagadas perdidas</p>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 pb-4">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 font-medium uppercase tracking-wide">
                    Pendientes de cancelar
                  </p>
                  {loading ? (
                    <div className="h-10 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                  ) : (
                    <>
                      <p className="text-2xl font-semibold text-amber-600 dark:text-amber-400">
                        {pendingCancels.length}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">aún tienen acceso activo</p>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 pb-4">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 font-medium uppercase tracking-wide">
                    MRR perdido
                  </p>
                  {loading ? (
                    <div className="h-10 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                  ) : (
                    <>
                      <p className="text-2xl font-semibold text-red-600">
                        {formatCurrency(mrrLost)}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">últimos 60 días</p>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 pb-4">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 font-medium uppercase tracking-wide">
                    Churn mensual
                  </p>
                  {loading ? (
                    <div className="h-10 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                  ) : (
                    <>
                      <p className={`text-2xl font-semibold ${churnColor}`}>
                        {churnRate}%
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">solo cancelaciones pagadas</p>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Cancelaciones por mes chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Cancelaciones por mes</CardTitle>
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
                        formatter={(val) => [`${val} cancelaciones`, '']}
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
                  <CardTitle className="text-sm font-semibold">Cancelaciones pagadas</CardTitle>
                  <span className="ml-auto text-xs text-red-600 dark:text-red-400 font-medium">{paidCancels.length} registros</span>
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
                  <EmptyState title="Sin cancelaciones pagadas" description="No hay suscripciones pagadas canceladas." />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <AnimatedTableRow variants={rowVariants} initial="hidden" animate="visible" custom={0}>
                          <TableHead>Nombre</TableHead>
                          <TableHead className="hidden md:table-cell">Email</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                          <TableHead className="hidden md:table-cell">Plataforma</TableHead>
                          <TableHead className="hidden lg:table-cell">Suscrito desde</TableHead>
                          <TableHead className="hidden sm:table-cell">Canceló</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">Días activo</TableHead>
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
                            className={i % 2 === 0 ? 'bg-white dark:bg-zinc-900' : 'bg-zinc-50 dark:bg-zinc-800/50'}
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
                  <CardTitle className="text-sm font-semibold">Cancelaciones pendientes</CardTitle>
                  <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    ⚠️ Oportunidad de retención
                  </span>
                  <span className="ml-auto text-xs text-amber-600 dark:text-amber-400 font-medium">{pendingCancels.length} registros</span>
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
                  <EmptyState title="Sin cancelaciones pendientes" description="No hay miembros con cancelación solicitada." />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <AnimatedTableRow variants={rowVariants} initial="hidden" animate="visible" custom={0}>
                          <TableHead>Nombre</TableHead>
                          <TableHead className="hidden md:table-cell">Email</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                          <TableHead className="hidden md:table-cell">Plataforma</TableHead>
                          <TableHead className="hidden lg:table-cell">Suscrito desde</TableHead>
                          <TableHead className="hidden sm:table-cell">Acceso hasta</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">Días activo</TableHead>
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
                            className={cn(i % 2 === 0 ? 'bg-white dark:bg-zinc-900' : 'bg-zinc-50 dark:bg-zinc-800/50')}
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
                  <CardTitle className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Trials cancelados</CardTitle>
                  <span className="ml-1 text-xs text-zinc-400 italic">Nunca realizaron un pago · no afectan el churn</span>
                  <span className="ml-auto text-xs text-zinc-400 font-medium">{trialCancels.length} registros</span>
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
                  <EmptyState title="Sin trials cancelados" description="Los trials cancelados aparecerán aquí." />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <AnimatedTableRow variants={rowVariants} initial="hidden" animate="visible" custom={0}>
                          <TableHead>Nombre</TableHead>
                          <TableHead className="hidden md:table-cell">Email</TableHead>
                          <TableHead className="hidden md:table-cell">Plataforma</TableHead>
                          <TableHead className="hidden sm:table-cell">Inicio trial</TableHead>
                          <TableHead className="hidden sm:table-cell">Canceló</TableHead>
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
                            className={i % 2 === 0 ? 'bg-white dark:bg-zinc-900' : 'bg-zinc-50 dark:bg-zinc-800/50'}
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
    </PageTransition>
  )
}
