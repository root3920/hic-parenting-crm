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
  Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase'
import { useMemo, useState, useRef, useEffect } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { motion, AnimatePresence } from 'framer-motion'
import { useProfile } from '@/hooks/useProfile'
import type { UserRole } from '@/hooks/useProfile'
import { usePreviewRole } from '@/contexts/PreviewRoleContext'

const ROLE_LABELS: Record<UserRole, string> = {
  admin:   'Admin',
  closer:  'Closer',
  setter:  'Setter',
  csm_spc: 'Client Success SPC',
  csm_ht:  'Client Success HT',
}

const ALL_NAV_ITEMS = [
  { href: '/dashboard',    label: 'Dashboard',   icon: LayoutDashboard, roles: ['admin'] as UserRole[] },
  { href: '/sales',        label: 'Sales',        icon: DollarSign,      roles: ['admin'] as UserRole[] },
  { href: '/llamadas',     label: 'Calls',        icon: Phone,           roles: ['admin', 'closer'] as UserRole[] },
  { href: '/spc',          label: 'SPC Members',  icon: Users,           roles: ['admin', 'csm_spc'] as UserRole[] },
  { href: '/students',     label: 'Students',     icon: UsersRound,      roles: ['admin', 'csm_ht'] as UserRole[] },
  { href: '/equipo/csm',   label: 'Team',         icon: UsersRound,      roles: ['admin', 'csm_ht'] as UserRole[] },
  { href: '/equipo/spc',   label: 'Team',         icon: UsersRound,      roles: ['csm_spc'] as UserRole[] },
  { href: '/goals',        label: 'Goals',        icon: Target,          roles: ['admin'] as UserRole[] },
]

// Quick-action menu items filtered by role
const ALL_QUICK_ACTIONS = [
  {
    href: '/equipo/csm/nuevo',
    label: 'Daily CSM Report',
    sub: 'Client Success HT',
    icon: FileText,
    roles: ['admin', 'csm_ht'] as UserRole[],
  },
  {
    href: '/equipo/spc/nuevo',
    label: 'Daily SPC Report',
    sub: 'Client Success SPC',
    icon: FileText,
    roles: ['admin', 'csm_spc'] as UserRole[],
  },
  {
    href: '/equipo/setter/nuevo',
    label: 'Daily Setter Report',
    sub: 'Setting Team',
    icon: BarChart2,
    roles: ['admin', 'setter'] as UserRole[],
  },
  {
    href: '/equipo/closer/nuevo',
    label: 'Daily Closer Report',
    sub: 'Closing Team',
    icon: TrendingUp,
    roles: ['admin', 'closer'] as UserRole[],
  },
]

function getInitials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

export function TopNav() {
  const supabase = useMemo(() => createClient(), [])
  const pathname = usePathname()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [quickMenuOpen, setQuickMenuOpen] = useState(false)
  const quickMenuRef = useRef<HTMLDivElement>(null)
  const { profile, loading: profileLoading } = useProfile()
  const { previewRole, setPreviewRole } = usePreviewRole()
  const actualRole = profile?.role ?? null
  const role = previewRole ?? actualRole

  // Wait for profile to load before showing nav to avoid flashing all items
  const navItems = profileLoading
    ? []
    : ALL_NAV_ITEMS.filter((item) => !role || item.roles.includes(role))
  const quickActions = profileLoading
    ? []
    : ALL_QUICK_ACTIONS.filter((item) => !role || item.roles.includes(role))

  const initials = profile?.full_name ? getInitials(profile.full_name) : 'AD'

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
          <div className="flex items-center shrink-0">
            <img
              src="/logo.png"
              alt="HIC Parenting Education"
              className="h-9 w-auto object-contain"
            />
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

            {/* Quick action + button (desktop only) — only show if there are actions */}
            {quickActions.length > 0 && (
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
                      {quickActions.map(({ href, label, sub, icon: Icon }) => (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => setQuickMenuOpen(false)}
                          className="flex items-start gap-3 px-3.5 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                        >
                          <Icon className="h-4 w-4 mt-0.5 text-zinc-400 shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{label}</p>
                            <p className="text-xs text-zinc-400 dark:text-zinc-500">{sub}</p>
                          </div>
                        </Link>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

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
                {initials}
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

      {/* Preview role banner */}
      {previewRole && (
        <div className="fixed top-14 inset-x-0 z-40 bg-amber-100 dark:bg-amber-900/60 border-b border-amber-300 dark:border-amber-700">
          <div className="max-w-screen-2xl mx-auto px-4 md:px-8 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-100">
              <Eye className="h-4 w-4" />
              Previewing as: <span className="font-bold">{ROLE_LABELS[previewRole]}</span>
            </div>
            <button
              onClick={() => setPreviewRole(null)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 hover:bg-amber-300 dark:hover:bg-amber-700 transition-colors"
            >
              <X className="h-3 w-3" />
              Exit Preview
            </button>
          </div>
        </div>
      )}

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
                {quickActions.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-3 px-4 h-12 rounded-xl text-sm font-medium transition-colors text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                  </Link>
                ))}
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
