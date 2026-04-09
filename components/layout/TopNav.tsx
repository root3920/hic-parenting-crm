'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Settings,
  LogOut,
  Menu,
  X,
  LayoutDashboard,
  DollarSign,
  Phone,
  Target,
  Users,
  UsersRound,
  Plus,
  FileText,
  BarChart2,
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase'
import { useMemo, useState, useRef, useEffect } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { motion, AnimatePresence } from 'framer-motion'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/sales', label: 'Sales', icon: DollarSign },

  { href: '/llamadas', label: 'Llamadas', icon: Phone },
  { href: '/spc', label: 'SPC Members', icon: Users },
  { href: '/equipo/csm', label: 'Equipo', icon: UsersRound },
  { href: '/goals', label: 'Metas', icon: Target },
]

export function TopNav() {
  const supabase = useMemo(() => createClient(), [])
  const pathname = usePathname()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [quickMenuOpen, setQuickMenuOpen] = useState(false)
  const quickMenuRef = useRef<HTMLDivElement>(null)

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (quickMenuRef.current && !quickMenuRef.current.contains(e.target as Node)) {
        setQuickMenuOpen(false)
      }
    }
    if (quickMenuOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [quickMenuOpen])

  return (
    <>
      <motion.header
        className="fixed top-0 inset-x-0 z-50 h-14 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' as const }}
      >
        <div className="w-full flex items-center px-4 md:px-8 gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-600">
              <span className="text-white font-bold text-xs">H</span>
            </div>
            <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 whitespace-nowrap hidden sm:block">
              HIC Parenting
            </span>
          </div>

          {/* Desktop nav pills */}
          <nav className="hidden md:flex items-center gap-1 flex-1">
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

            {/* Quick action + button (desktop only) */}
            <div ref={quickMenuRef} className="relative hidden md:block">
              <button
                onClick={() => setQuickMenuOpen((v) => !v)}
                className={cn(
                  'flex items-center justify-center h-7 w-7 rounded-full border transition-colors',
                  quickMenuOpen
                    ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600'
                    : 'border-zinc-300 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-200'
                )}
                aria-label="Quick actions"
              >
                <Plus className="h-4 w-4" />
              </button>

              <AnimatePresence>
                {quickMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg z-50 py-1.5 overflow-hidden"
                  >
                    <Link
                      href="/equipo/csm/nuevo"
                      onClick={() => setQuickMenuOpen(false)}
                      className="flex items-start gap-3 px-3.5 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <FileText className="h-4 w-4 mt-0.5 text-zinc-400 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Reporte CSM diario</p>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">Client Success HT</p>
                      </div>
                    </Link>
                    <Link
                      href="/equipo/setter/nuevo"
                      onClick={() => setQuickMenuOpen(false)}
                      className="flex items-start gap-3 px-3.5 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <BarChart2 className="h-4 w-4 mt-0.5 text-zinc-400 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Reporte Setter diario</p>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">Setting Team</p>
                      </div>
                    </Link>
                    <Link
                      href="/equipo/closer/nuevo"
                      onClick={() => setQuickMenuOpen(false)}
                      className="flex items-start gap-3 px-3.5 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <TrendingUp className="h-4 w-4 mt-0.5 text-zinc-400 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Reporte Closer diario</p>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">Closing Team</p>
                      </div>
                    </Link>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

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
              className="hidden md:flex h-8 w-8 rounded-full text-zinc-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
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
            {/* Hamburger — mobile only */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-9 w-9 rounded-full text-zinc-600 dark:text-zinc-300"
              onClick={() => setIsOpen((v) => !v)}
              aria-label={isOpen ? 'Close menu' : 'Open menu'}
            >
              {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </motion.header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/40 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              className="fixed top-0 left-0 z-50 h-full w-[280px] bg-white dark:bg-zinc-900 shadow-xl flex flex-col pt-14 md:hidden"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                {navItems.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href || pathname.startsWith(href + '/')
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setIsOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-4 h-12 rounded-xl text-sm font-medium transition-colors',
                        active
                          ? 'bg-[#185FA5] text-white'
                          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {label}
                    </Link>
                  )
                })}
                {/* Quick actions in mobile drawer */}
                <Link
                  href="/equipo/csm/nuevo"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 px-4 h-12 rounded-xl text-sm font-medium transition-colors text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  Reporte CSM diario
                </Link>
                <Link
                  href="/equipo/setter/nuevo"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 px-4 h-12 rounded-xl text-sm font-medium transition-colors text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <BarChart2 className="h-4 w-4 shrink-0" />
                  Reporte Setter diario
                </Link>
                <Link
                  href="/equipo/closer/nuevo"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 px-4 h-12 rounded-xl text-sm font-medium transition-colors text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <TrendingUp className="h-4 w-4 shrink-0" />
                  Reporte Closer diario
                </Link>
              </nav>
              <div className="px-3 pb-6 space-y-1 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                <Link
                  href="/settings"
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-4 h-12 rounded-xl text-sm font-medium transition-colors',
                    pathname === '/settings'
                      ? 'bg-[#185FA5] text-white'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  )}
                >
                  <Settings className="h-4 w-4 shrink-0" />
                  Settings
                </Link>
                <button
                  onClick={() => { setIsOpen(false); handleLogout() }}
                  className="flex items-center gap-3 px-4 h-12 rounded-xl text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-red-600 dark:hover:text-red-400 transition-colors w-full text-left"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  Logout
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
