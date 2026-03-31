'use client'

import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { AnimatedNumber } from '@/components/motion/AnimatedNumber'

// Variants are defined here so the parent KPICardGrid can stagger them.
// The motion.div is always rendered (even during loading) so the stagger
// parent has motion children present when it runs — avoiding the issue
// where children mount *after* the parent has already animated.
const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
}

interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: number
  trendLabel?: string
  icon?: React.ReactNode
  loading?: boolean
  className?: string
}

export function KPICard({
  title,
  value,
  subtitle,
  trend,
  trendLabel,
  icon,
  loading,
  className,
}: KPICardProps) {
  // motion.div is always rendered so the parent stagger container
  // always has it as a motion child, regardless of loading state.
  return (
    <motion.div
      variants={cardVariants}
      whileHover={
        loading
          ? undefined
          : {
              scale: 1.02,
              boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
              transition: { duration: 0.15, ease: 'easeOut' as const },
            }
      }
      whileTap={loading ? undefined : { scale: 0.98, transition: { duration: 0.1 } }}
    >
      <Card className={cn('h-full', className)}>
        <CardContent className="pt-6">
          {loading ? (
            <>
              <Skeleton className="h-4 w-24 mb-3 animate-shimmer" />
              <Skeleton className="h-8 w-32 mb-2 animate-shimmer" />
              <Skeleton className="h-3 w-20 animate-shimmer" />
            </>
          ) : (
            <>
              <div className="flex items-start justify-between">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                  {title}
                </p>
                {icon && (
                  <div className="text-zinc-400 dark:text-zinc-500">{icon}</div>
                )}
              </div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2">
                {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
              </p>
              <div className="flex items-center gap-2 mt-1">
                {trend !== undefined && (
                  <span
                    className={cn(
                      'flex items-center gap-0.5 text-xs font-medium',
                      trend >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    )}
                  >
                    {trend >= 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {Math.abs(trend)}%
                  </span>
                )}
                {subtitle && (
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    {subtitle}
                  </span>
                )}
                {trendLabel && !subtitle && (
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    {trendLabel}
                  </span>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
