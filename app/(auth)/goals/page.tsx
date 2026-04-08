'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { KpiGoalCard } from '@/components/shared/KpiGoalCard'
import { GOALS, getGoalStatus, getStatusColors } from '@/lib/goals'
import { PageTransition } from '@/components/motion/PageTransition'
import { SetterReport, CloserReport } from '@/types'
import { cn } from '@/lib/utils'
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'

export const dynamic = 'force-dynamic'

function getLast30Days() {
  const today = new Date()
  const from = new Date(today)
  from.setDate(today.getDate() - 30)
  return {
    from: from.toISOString().split('T')[0],
    to: today.toISOString().split('T')[0],
  }
}

export default function GoalsPage() {
  const supabase = useMemo(() => createClient(), [])
  const [setterReports, setSetterReports] = useState<SetterReport[]>([])
  const [closerReports, setCloserReports] = useState<CloserReport[]>([])
  const [loading, setLoading] = useState(true)
  const defaults = getLast30Days()
  const [fromDate, setFromDate] = useState(defaults.from)
  const [toDate, setToDate] = useState(defaults.to)

  useEffect(() => {
    async function fetchAll() {
      setLoading(true)
      const [{ data: sr }, { data: cr }] = await Promise.all([
        supabase.from('setter_reports').select('*').gte('date', fromDate).lte('date', toDate).order('date', { ascending: true }),
        supabase.from('closer_reports').select('*').gte('date', fromDate).lte('date', toDate).order('date', { ascending: true }),
      ])
      setSetterReports(sr ?? [])
      setCloserReports(cr ?? [])
      setLoading(false)
    }
    fetchAll()
  }, [fromDate, toDate])

  const settingKPIs = useMemo(() => {
    const totalConvos = setterReports.reduce((s, r) => s + r.total_convos, 0)
    const totalProposed = setterReports.reduce((s, r) => s + r.call_proposed, 0)
    const totalQualified = setterReports.reduce((s, r) => s + r.qualified_calls, 0)
    return {
      pitchRate: totalConvos > 0 ? (totalProposed / totalConvos) * 100 : NaN,
      bookingRate: totalProposed > 0 ? (totalQualified / totalProposed) * 100 : NaN,
      conversionGeneral: totalConvos > 0 ? (totalQualified / totalConvos) * 100 : NaN,
    }
  }, [setterReports])

  const totalWeeks = useMemo(() => {
    const daysDiff = Math.max(1, Math.round(
      (new Date(toDate).getTime() - new Date(fromDate).getTime()) / (1000 * 60 * 60 * 24)
    ))
    return daysDiff / 7
  }, [fromDate, toDate])

  const caliReports = useMemo(() => closerReports.filter(r => r.closer_name === 'Cali Luna'), [closerReports])
  const marcelaReports = useMemo(() => closerReports.filter(r => r.closer_name === 'Marcela HIC Parenting'), [closerReports])

  function computeCloserKPIs(reps: CloserReport[], weeks: number) {
    const m = reps.reduce((s, r) => s + r.total_meetings, 0)
    const sh = reps.reduce((s, r) => s + r.showed_meetings, 0)
    const of = reps.reduce((s, r) => s + r.offers_proposed, 0)
    const wo = reps.reduce((s, r) => s + r.won_deals, 0)
    return {
      showRate: m > 0 ? (sh / m) * 100 : NaN,
      offerRate: sh > 0 ? (of / sh) * 100 : NaN,
      closeRate: of > 0 ? (wo / of) * 100 : NaN,
      callsPerWeek: weeks > 0 ? m / weeks : NaN,
    }
  }

  const caliKPIs = useMemo(() => computeCloserKPIs(caliReports, totalWeeks), [caliReports, totalWeeks])
  const marcelaKPIs = useMemo(() => computeCloserKPIs(marcelaReports, totalWeeks), [marcelaReports, totalWeeks])

  const { onTargetCount, totalKPIs, settingOnTarget } = useMemo(() => {
    const settingStatuses = [
      getGoalStatus(settingKPIs.pitchRate, GOALS.setting.pitchRate),
      getGoalStatus(settingKPIs.bookingRate, GOALS.setting.bookingRate),
      getGoalStatus(settingKPIs.conversionGeneral, GOALS.setting.conversionGeneral),
    ]
    const caliStatuses = [
      getGoalStatus(caliKPIs.showRate, GOALS.closing.showRate),
      getGoalStatus(caliKPIs.offerRate, GOALS.closing.offerRate),
      getGoalStatus(caliKPIs.closeRate, GOALS.closing.closeRate),
      getGoalStatus(caliKPIs.callsPerWeek, GOALS.closing.callsPerWeek),
    ]
    const marcelaStatuses = [
      getGoalStatus(marcelaKPIs.showRate, GOALS.closing.showRate),
      getGoalStatus(marcelaKPIs.offerRate, GOALS.closing.offerRate),
      getGoalStatus(marcelaKPIs.closeRate, GOALS.closing.closeRate),
      getGoalStatus(marcelaKPIs.callsPerWeek, GOALS.closing.callsPerWeek),
    ]
    const all = [...settingStatuses, ...caliStatuses, ...marcelaStatuses]
    return {
      onTargetCount: all.filter(s => s === 'on_target').length,
      totalKPIs: all.length,
      settingOnTarget: settingStatuses.filter(s => s === 'on_target').length,
    }
  }, [settingKPIs, caliKPIs, marcelaKPIs])

  const trendData = useMemo(() => {
    const start = new Date(fromDate).getTime()
    const end = new Date(toDate).getTime()
    const periodMs = Math.max((end - start) / 4, 1)

    return Array.from({ length: 4 }, (_, i) => {
      const pStart = new Date(start + i * periodMs).toISOString().split('T')[0]
      const pEnd = new Date(start + (i + 1) * periodMs).toISOString().split('T')[0]

      const sr = setterReports.filter(r => r.date >= pStart && r.date <= pEnd)
      const convos = sr.reduce((s, r) => s + r.total_convos, 0)
      const proposed = sr.reduce((s, r) => s + r.call_proposed, 0)
      const qualified = sr.reduce((s, r) => s + r.qualified_calls, 0)

      const cali = closerReports.filter(r => r.closer_name === 'Cali Luna' && r.date >= pStart && r.date <= pEnd)
      const marcela = closerReports.filter(r => r.closer_name === 'Marcela HIC Parenting' && r.date >= pStart && r.date <= pEnd)

      const cM = cali.reduce((s, r) => s + r.total_meetings, 0)
      const cSh = cali.reduce((s, r) => s + r.showed_meetings, 0)
      const cOf = cali.reduce((s, r) => s + r.offers_proposed, 0)
      const cWo = cali.reduce((s, r) => s + r.won_deals, 0)

      const mM = marcela.reduce((s, r) => s + r.total_meetings, 0)
      const mSh = marcela.reduce((s, r) => s + r.showed_meetings, 0)
      const mOf = marcela.reduce((s, r) => s + r.offers_proposed, 0)
      const mWo = marcela.reduce((s, r) => s + r.won_deals, 0)

      return {
        label: `S${i + 1}`,
        pitchRate: convos > 0 ? (proposed / convos) * 100 : null,
        bookingRate: proposed > 0 ? (qualified / proposed) * 100 : null,
        conversionGeneral: convos > 0 ? (qualified / convos) * 100 : null,
        caliShowRate: cM > 0 ? (cSh / cM) * 100 : null,
        caliOfferRate: cSh > 0 ? (cOf / cSh) * 100 : null,
        caliCloseRate: cOf > 0 ? (cWo / cOf) * 100 : null,
        marcelaShowRate: mM > 0 ? (mSh / mM) * 100 : null,
        marcelaOfferRate: mSh > 0 ? (mOf / mSh) * 100 : null,
        marcelaCloseRate: mOf > 0 ? (mWo / mOf) * 100 : null,
      }
    })
  }, [setterReports, closerReports, fromDate, toDate])

  function Sparkline({ dataKey, color }: { dataKey: string; color: string }) {
    return (
      <ResponsiveContainer width="100%" height={40}>
        <LineChart data={trendData}>
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Tooltip
            formatter={(value) => {
              if (typeof value !== 'number') return '—'
              return `${value.toFixed(1)}%`
            }}
            contentStyle={{ fontSize: 10, padding: '2px 6px' }}
            labelFormatter={(label) => String(label)}
          />
        </LineChart>
      </ResponsiveContainer>
    )
  }

  function StatusCell({ value, goal }: { value: number; goal: typeof GOALS.setting.pitchRate }) {
    const hasValue = !isNaN(value)
    const status = hasValue ? getGoalStatus(value, goal) : 'alert'
    const colors = getStatusColors(status)
    const displayValue = hasValue ? `${value.toFixed(1)}${goal.unit}` : '—'
    const icon = status === 'on_target' ? '✓' : status === 'warning' ? '⚠' : '✗'
    return (
      <td className={cn('px-4 py-3 text-center text-sm font-medium whitespace-nowrap', colors.bg, colors.text)}>
        {displayValue} {icon}
      </td>
    )
  }

  const closingRows = [
    {
      label: 'Show Rate',
      goal: GOALS.closing.showRate,
      metaLabel: `≥ ${GOALS.closing.showRate.target}%`,
      caliValue: caliKPIs.showRate,
      marcelaValue: marcelaKPIs.showRate,
      caliSparkKey: 'caliShowRate',
      marcelaSparkKey: 'marcelaShowRate',
    },
    {
      label: 'Offer Rate',
      goal: GOALS.closing.offerRate,
      metaLabel: `≥ ${GOALS.closing.offerRate.target}%`,
      caliValue: caliKPIs.offerRate,
      marcelaValue: marcelaKPIs.offerRate,
      caliSparkKey: 'caliOfferRate',
      marcelaSparkKey: 'marcelaOfferRate',
    },
    {
      label: 'Close Rate',
      goal: GOALS.closing.closeRate,
      metaLabel: `${GOALS.closing.closeRate.target}–${GOALS.closing.closeRate.targetMax}%`,
      caliValue: caliKPIs.closeRate,
      marcelaValue: marcelaKPIs.closeRate,
      caliSparkKey: 'caliCloseRate',
      marcelaSparkKey: 'marcelaCloseRate',
    },
    {
      label: 'Calls / semana',
      goal: GOALS.closing.callsPerWeek,
      metaLabel: `${GOALS.closing.callsPerWeek.target}–${GOALS.closing.callsPerWeek.targetMax}`,
      caliValue: caliKPIs.callsPerWeek,
      marcelaValue: marcelaKPIs.callsPerWeek,
      caliSparkKey: null as string | null,
      marcelaSparkKey: null as string | null,
    },
  ]

  const scoreBarPct = totalKPIs > 0 ? (onTargetCount / totalKPIs) * 100 : 0
  const scoreColor = scoreBarPct >= 70 ? '#3B6D11' : scoreBarPct >= 40 ? '#BA7517' : '#A32D2D'

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto">
        <PageHeader title="Metas del Equipo" description="KPIs comparados contra benchmarks del equipo">
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

        {/* Overall team score */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide font-semibold mb-0.5">
                  Score del equipo
                </p>
                <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                  {onTargetCount}{' '}
                  <span className="text-zinc-400 dark:text-zinc-500 font-normal text-xl">/ {totalKPIs}</span>
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">KPIs en meta</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold" style={{ color: scoreColor }}>
                  {Math.round(scoreBarPct)}%
                </p>
              </div>
            </div>
            <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${scoreBarPct}%`, backgroundColor: scoreColor }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Setting section */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Setters</h2>
            <span className={cn(
              'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold',
              settingOnTarget === 3
                ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                : settingOnTarget >= 2
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
            )}>
              {settingOnTarget}/3 KPIs en meta
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <KpiGoalCard
              label={GOALS.setting.pitchRate.label}
              description={GOALS.setting.pitchRate.description}
              value={settingKPIs.pitchRate}
              unit="%"
              goal={GOALS.setting.pitchRate}
              isLoading={loading}
            />
            <KpiGoalCard
              label={GOALS.setting.bookingRate.label}
              description={GOALS.setting.bookingRate.description}
              value={settingKPIs.bookingRate}
              unit="%"
              goal={GOALS.setting.bookingRate}
              isLoading={loading}
            />
            <KpiGoalCard
              label={GOALS.setting.conversionGeneral.label}
              description={GOALS.setting.conversionGeneral.description}
              value={settingKPIs.conversionGeneral}
              unit="%"
              goal={GOALS.setting.conversionGeneral}
              isLoading={loading}
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Tendencia (4 períodos)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-6">
                {[
                  { label: 'Pitch Rate', key: 'pitchRate', color: '#185FA5' },
                  { label: 'Booking Rate', key: 'bookingRate', color: '#3B6D11' },
                  { label: 'Conversión General', key: 'conversionGeneral', color: '#BA7517' },
                ].map(({ label, key, color }) => (
                  <div key={key}>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{label}</p>
                    <Sparkline dataKey={key} color={color} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Closing section */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Closers</h2>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                        KPI
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                        Meta
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                        Cali Luna
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide hidden md:table-cell">
                        Trend Cali
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                        Marcela HIC
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide hidden md:table-cell">
                        Trend Marcela
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8">
                          <div className="space-y-2">
                            {[...Array(4)].map((_, i) => (
                              <div key={i} className="h-8 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
                            ))}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      closingRows.map((row) => (
                        <tr key={row.label}>
                          <td className="px-4 py-3 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                            {row.label}
                          </td>
                          <td className="px-4 py-3 text-center text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                            {row.metaLabel}
                          </td>
                          <StatusCell value={row.caliValue} goal={row.goal} />
                          <td className="px-2 py-1 w-28 hidden md:table-cell">
                            {row.caliSparkKey
                              ? <Sparkline dataKey={row.caliSparkKey} color="#185FA5" />
                              : <span className="text-xs text-zinc-300 dark:text-zinc-600 block text-center">—</span>
                            }
                          </td>
                          <StatusCell value={row.marcelaValue} goal={row.goal} />
                          <td className="px-2 py-1 w-28 hidden md:table-cell">
                            {row.marcelaSparkKey
                              ? <Sparkline dataKey={row.marcelaSparkKey} color="#3B6D11" />
                              : <span className="text-xs text-zinc-300 dark:text-zinc-600 block text-center">—</span>
                            }
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageTransition>
  )
}
