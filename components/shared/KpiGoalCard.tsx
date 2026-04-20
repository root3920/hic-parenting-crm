'use client'

import { motion } from 'framer-motion'
import { GoalConfig, GoalStatus, getGoalStatus, getStatusColors } from '@/lib/goals'
import { cn } from '@/lib/utils'

interface KpiGoalCardProps {
  label: string
  description: string
  value: number
  unit: string
  goal: GoalConfig
  isLoading?: boolean
  decimals?: number
}

export function KpiGoalCard({ label, description, value, unit, goal, isLoading, decimals = 1 }: KpiGoalCardProps) {
  const hasValue = !isNaN(value)
  const status: GoalStatus = hasValue ? getGoalStatus(value, goal) : 'alert'
  const colors = getStatusColors(status)

  const fillBasis = goal.targetMax ?? goal.target
  const fillPct = hasValue
    ? Math.min((value / fillBasis) * 100, 100)
    : 0

  const metaLabel =
    goal.targetMax !== undefined
      ? `Meta: ${goal.target}–${goal.targetMax}${goal.unit}`
      : `Meta: ≥ ${goal.target}${goal.unit}`

  const displayValue = hasValue
    ? `${value.toFixed(decimals)}${unit}`
    : '—'

  return (
    <div
      className={cn(
        'relative rounded-lg border border-zinc-200 dark:border-zinc-800 border-l-4 p-4 transition-colors',
        colors.border,
        isLoading ? 'bg-white dark:bg-zinc-900' : colors.bg
      )}
    >
      {/* Label row */}
      <div className="flex items-center gap-1.5 mb-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {label}
        </p>
        <span
          className="text-zinc-400 dark:text-zinc-500 cursor-help text-xs leading-none"
          title={description}
        >
          ⓘ
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-2 mt-2">
          <div className="h-7 w-20 animate-pulse bg-zinc-200 dark:bg-zinc-700 rounded" />
          <div className="h-2 animate-pulse bg-zinc-200 dark:bg-zinc-700 rounded-full" />
          <div className="h-5 w-16 animate-pulse bg-zinc-200 dark:bg-zinc-700 rounded-full" />
        </div>
      ) : (
        <>
          {/* Value + meta */}
          <div className="flex items-baseline justify-between mb-2 mt-1">
            <span className={cn('text-2xl font-semibold', colors.text)}>
              {displayValue}
            </span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">{metaLabel}</span>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden mb-2">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: colors.bar }}
              initial={{ width: 0 }}
              animate={{ width: `${fillPct}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>

          {/* Status badge */}
          <span
            className={cn(
              'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
              colors.badge
            )}
          >
            {colors.label}
          </span>
        </>
      )}
    </div>
  )
}
