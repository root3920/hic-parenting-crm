'use client'

import { cn } from '@/lib/utils'

type ChipColor = 'coral' | 'blue' | 'purple' | 'amber' | 'gray' | 'teal'

interface ChipSelectorProps {
  options: string[]
  value: string[]
  onChange: (value: string[]) => void
  color?: ChipColor
}

const activeStyles: Record<ChipColor, string> = {
  coral:  'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700',
  blue:   'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700',
  purple: 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700',
  amber:  'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700',
  gray:   'bg-zinc-200 text-zinc-700 border-zinc-400 dark:bg-zinc-700 dark:text-zinc-200 dark:border-zinc-500',
  teal:   'bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-700',
}

const inactiveStyle =
  'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300 hover:text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500'

export function ChipSelector({ options, value, onChange, color = 'gray' }: ChipSelectorProps) {
  function toggle(option: string) {
    if (value.includes(option)) {
      onChange(value.filter((v) => v !== option))
    } else {
      onChange([...value, option])
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isActive = value.includes(option)
        return (
          <button
            key={option}
            type="button"
            onClick={() => toggle(option)}
            className={cn(
              'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border transition-colors',
              isActive ? activeStyles[color] : inactiveStyle
            )}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}
