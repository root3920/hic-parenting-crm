import { Database } from 'lucide-react'

interface EmptyStateProps {
  title?: string
  description?: string
  icon?: React.ReactNode
}

export function EmptyState({
  title = 'No data found',
  description = 'There are no records to display.',
  icon,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 text-zinc-300 dark:text-zinc-600">
        {icon ?? <Database className="h-10 w-10" />}
      </div>
      <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{title}</p>
      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{description}</p>
    </div>
  )
}
