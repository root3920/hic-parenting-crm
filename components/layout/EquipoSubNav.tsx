'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, BarChart2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
  { href: '/equipo/csm', label: 'Client Success HT', icon: Users },
  { href: '/equipo/setter', label: 'Setting Team', icon: BarChart2 },
]

export function EquipoSubNav() {
  const pathname = usePathname()

  return (
    <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 mb-6">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <nav className="flex gap-1 -mb-px">
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                  active
                    ? 'border-[#185FA5] text-[#185FA5] dark:text-blue-400 dark:border-blue-400'
                    : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-600'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
