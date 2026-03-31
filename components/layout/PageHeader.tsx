interface PageHeaderProps {
  title: string
  description?: string
  children?: React.ReactNode
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-6">
      <div>
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </h2>
        {description && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            {description}
          </p>
        )}
      </div>
      {children && <div className="flex items-center gap-2 flex-wrap">{children}</div>}
    </div>
  )
}
