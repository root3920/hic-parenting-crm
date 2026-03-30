'use client'

import { motion, type HTMLMotionProps } from 'framer-motion'
import { cn } from '@/lib/utils'

// Use motion.tr directly rather than motion(TableRow).
// Wrapping a forwardRef component via motion() HOC in framer-motion v12
// does not reliably forward children to the underlying <tr>, producing
// visually empty rows. motion.tr is a first-class element and always works.
interface AnimatedTableRowProps extends HTMLMotionProps<'tr'> {
  className?: string
}

export function AnimatedTableRow({ className, children, ...props }: AnimatedTableRowProps) {
  return (
    <motion.tr
      className={cn(
        'border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted',
        className
      )}
      {...props}
    >
      {children}
    </motion.tr>
  )
}

export const rowVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.04, duration: 0.2, ease: 'easeOut' as const },
  }),
}
