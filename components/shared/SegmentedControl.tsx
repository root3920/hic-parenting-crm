'use client'

import { cn } from '@/lib/utils'

interface SegmentedControlProps {
  options: string[]
  value: string
  onChange: (value: string) => void
}

export function SegmentedControl({ options, value, onChange }: SegmentedControlProps) {
  return (
    <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 p-0.5 gap-0.5">
      {options.map((option) => {
        const isActive = value === option
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              'px-4 py-1.5 rounded-md text-xs font-semibold transition-colors',
              isActive
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
            )}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}
