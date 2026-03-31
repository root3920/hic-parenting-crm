'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Settings, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase'
import { useMemo } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/sales', label: 'Sales' },
  { href: '/setting', label: 'Setters' },
  { href: '/closing', label: 'Closers' },
  { href: '/spc', label: 'SPC Members' },
]

export function TopNav() {
  const supabase = useMemo(() => createClient(), [])
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <motion.header
      className="fixed top-0 inset-x-0 z-50 h-14 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' as const }}
    >
      <div className="w-full flex items-center px-8 gap-6">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-600">
            <span className="text-white font-bold text-xs">H</span>
          </div>
          <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
            HIC Parenting
          </span>
        </div>

        {/* Nav pills */}
        <nav className="flex items-center gap-1 flex-1">
          {navItems.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'relative px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap',
                  active ? 'text-white' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active-pill"
                    className="absolute inset-0 rounded-full bg-[#185FA5]"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <Link
            href="/settings"
            className={cn(
              'relative flex items-center justify-center h-8 w-8 rounded-full',
              pathname === '/settings'
                ? 'text-white'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            )}
          >
            {pathname === '/settings' && (
              <motion.span
                layoutId="nav-active-pill"
                className="absolute inset-0 rounded-full bg-[#185FA5]"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <Settings className="h-4 w-4 relative z-10" />
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full text-zinc-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            onClick={handleLogout}
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
          </Button>
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
              AD
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </motion.header>
  )
}
