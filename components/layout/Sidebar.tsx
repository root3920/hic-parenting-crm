'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  DollarSign,
  Phone,
  Users,
  GraduationCap,
  UsersRound,
  Target,
  TrendingUp,
  BookUser,
  ClipboardList,
  CalendarDays,
  Briefcase,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Plus,
  FileText,
  BarChart2,
  Eye,
  Sprout,
  HeartHandshake,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase'
import { useState, useMemo, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useProfile } from '@/hooks/useProfile'
import type { UserRole } from '@/hooks/useProfile'
import { usePreviewRole } from '@/contexts/PreviewRoleContext'
import { useSidebar } from '@/contexts/SidebarContext'

const ROLE_LABELS: Record<UserRole, string> = {
  admin:   'Admin',
  closer:  'Closer',
  setter:  'Setter',
  csm_spc: 'Client Success SPC',
  csm_ht:  'Client Success HT',
  coach:   'Coach',
}

const ALL_NAV_ITEMS = [
  { href: '/dashboard',    label: 'Dashboard',    icon: LayoutDashboard, roles: ['admin'] as UserRole[] },
  { href: '/sales',        label: 'Sales',        icon: DollarSign,      roles: ['admin', 'csm_spc', 'csm_ht'] as UserRole[] },
  { href: '/llamadas',     label: 'Calls',        icon: Phone,           roles: ['admin', 'closer'] as UserRole[] },
  { href: '/spc',          label: 'SPC Members',  icon: Users,           roles: ['admin', 'csm_spc'] as UserRole[] },
  { href: '/students',        label: 'Students',        icon: GraduationCap,   roles: ['admin', 'csm_ht'] as UserRole[] },
  { href: '/client-success', label: 'Client Success',  icon: HeartHandshake,  roles: ['admin', 'csm_ht'] as UserRole[] },
  { href: '/equipo/csm',     label: 'Team',            icon: UsersRound,      roles: ['admin', 'csm_ht'] as UserRole[] },
  { href: '/equipo/spc',   label: 'Team',         icon: UsersRound,      roles: ['csm_spc'] as UserRole[] },
  { href: '/finance',      label: 'Finance',      icon: DollarSign,      roles: ['admin'] as UserRole[] },
  { href: '/goals',        label: 'Goals',        icon: Target,          roles: ['admin'] as UserRole[] },
  { href: '/growth',       label: 'Growth',       icon: Sprout,          roles: ['admin', 'closer', 'csm_spc', 'csm_ht', 'coach'] as UserRole[] },
  { href: '/contacts',     label: 'Clients',      icon: BookUser,        roles: ['admin', 'setter'] as UserRole[] },
  { href: '/surveys',      label: 'Surveys',      icon: ClipboardList,   roles: ['admin', 'closer', 'setter', 'csm_spc', 'csm_ht'] as UserRole[] },
  { href: '/calendar',     label: 'Calendar',     icon: CalendarDays,    roles: ['admin', 'closer', 'setter', 'csm_spc', 'csm_ht'] as UserRole[] },
  { href: '/careers',      label: 'Careers',      icon: Briefcase,       roles: ['admin'] as UserRole[] },
]

const ALL_QUICK_ACTIONS = [
  { href: '/equipo/csm/nuevo',    label: 'Daily CSM Report',    sub: 'Client Success HT', icon: FileText,   roles: ['admin', 'csm_ht'] as UserRole[] },
  { href: '/equipo/spc/nuevo',    label: 'Daily SPC Report',    sub: 'Client Success SPC', icon: FileText,   roles: ['admin', 'csm_spc'] as UserRole[] },
  { href: '/equipo/setter/nuevo', label: 'Daily Setter Report', sub: 'Setting Team',       icon: BarChart2,  roles: ['admin', 'setter'] as UserRole[] },
  { href: '/equipo/closer/nuevo', label: 'Daily Closer Report', sub: 'Closing Team',       icon: TrendingUp, roles: ['admin', 'closer'] as UserRole[] },
]

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

// Page title derived from pathname
function getPageTitle(pathname: string, navItems: { href: string; label: string }[]) {
  // Check exact match first, then prefix match
  for (const item of navItems) {
    if (pathname === item.href || pathname.startsWith(item.href + '/')) {
      return item.label
    }
  }
  if (pathname === '/settings') return 'Settings'
  return ''
}

export function Sidebar() {
  const supabase = useMemo(() => createClient(), [])
  const pathname = usePathname()
  const router = useRouter()
  const { profile, loading: profileLoading } = useProfile()
  const { previewRole, setPreviewRole } = usePreviewRole()
  const actualRole = profile?.role ?? null
  const role = previewRole ?? actualRole

  const { collapsed, toggleCollapsed, mobileOpen, setMobileOpen } = useSidebar()
  const [quickMenuOpen, setQuickMenuOpen] = useState(false)
  const quickMenuRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{ label: string; top: number } | null>(null)

  // Close mobile drawer on route change
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // Close quick menu on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (quickMenuRef.current && !quickMenuRef.current.contains(e.target as Node)) {
        setQuickMenuOpen(false)
      }
    }
    if (quickMenuOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [quickMenuOpen])

  const navItems = profileLoading
    ? []
    : ALL_NAV_ITEMS.filter((item) => !role || item.roles.includes(role))
  const quickActions = profileLoading
    ? []
    : ALL_QUICK_ACTIONS.filter((item) => !role || item.roles.includes(role))

  const initials = profile?.full_name ? getInitials(profile.full_name) : 'AD'
  const pageTitle = getPageTitle(pathname, navItems)

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function handleMouseEnter(label: string, e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) {
    if (!collapsed) return
    const rect = e.currentTarget.getBoundingClientRect()
    setTooltip({ label, top: rect.top + rect.height / 2 })
  }

  function handleMouseLeave() {
    setTooltip(null)
  }

  const sidebarContent = (isMobile: boolean) => {
    const isExpanded = isMobile ? true : !collapsed

    return (
      <div className="flex flex-col h-full">
        {/* Logo area */}
        <div className={cn('flex items-center h-14 border-b border-white/10 shrink-0', isExpanded ? 'px-4' : 'justify-center px-2')}>
          <img
            src="/hic-logo.svg"
            alt="HIC"
            className={cn('object-contain transition-all duration-200', isExpanded ? 'h-10 w-auto' : 'h-8 w-8')}
          />
        </div>

        {/* Quick actions */}
        {quickActions.length > 0 && (
          <div className={cn('px-2 pt-3 pb-1', !isExpanded && 'px-2')}>
            {isExpanded ? (
              <div ref={!isMobile ? quickMenuRef : undefined} className="relative">
                <button
                  onClick={() => setQuickMenuOpen((v) => !v)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Quick Action
                </button>
                <AnimatePresence>
                  {quickMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute left-0 right-0 top-full mt-1 rounded-lg border border-white/10 bg-[#232346] shadow-lg z-50 py-1 overflow-hidden"
                    >
                      {quickActions.map(({ href, label, sub, icon: Icon }) => (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => { setQuickMenuOpen(false); if (isMobile) setMobileOpen(false) }}
                          className="flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 transition-colors"
                        >
                          <Icon className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-white">{label}</p>
                            <p className="text-[10px] text-zinc-500">{sub}</p>
                          </div>
                        </Link>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div ref={!isMobile ? quickMenuRef : undefined} className="relative">
                <button
                  onClick={() => setQuickMenuOpen((v) => !v)}
                  onMouseEnter={(e) => handleMouseEnter('Quick Action', e)}
                  onMouseLeave={handleMouseLeave}
                  className="w-full flex items-center justify-center h-9 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <AnimatePresence>
                  {quickMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute left-full top-0 ml-2 w-52 rounded-lg border border-white/10 bg-[#232346] shadow-lg z-50 py-1 overflow-hidden"
                    >
                      {quickActions.map(({ href, label, sub, icon: Icon }) => (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => setQuickMenuOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 transition-colors"
                        >
                          <Icon className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-white">{label}</p>
                            <p className="text-[10px] text-zinc-500">{sub}</p>
                          </div>
                        </Link>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}

        {/* Nav items */}
        <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                onClick={() => { if (isMobile) setMobileOpen(false) }}
                onMouseEnter={(e) => handleMouseEnter(label, e)}
                onMouseLeave={handleMouseLeave}
                className={cn(
                  'relative group flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-150',
                  isExpanded ? 'px-3 h-10' : 'justify-center h-10',
                  active
                    ? 'bg-amber-500/15 text-amber-400'
                    : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                )}
              >
                <Icon className={cn('h-[18px] w-[18px] shrink-0', active && 'text-amber-400')} />
                {isExpanded && <span className="truncate">{label}</span>}
                {active && !isExpanded && (
                  <span className="absolute left-0 w-[3px] h-5 rounded-r-full bg-amber-400" />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Bottom section */}
        <div className="px-2 pb-3 space-y-0.5 border-t border-white/10 pt-2">
          <Link
            href="/settings"
            onClick={() => { if (isMobile) setMobileOpen(false) }}
            onMouseEnter={(e) => handleMouseEnter('Settings', e)}
            onMouseLeave={handleMouseLeave}
            className={cn(
              'flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-150',
              isExpanded ? 'px-3 h-10' : 'justify-center h-10',
              pathname === '/settings'
                ? 'bg-amber-500/15 text-amber-400'
                : 'text-zinc-400 hover:bg-white/5 hover:text-white'
            )}
          >
            <Settings className="h-[18px] w-[18px] shrink-0" />
            {isExpanded && <span>Settings</span>}
          </Link>
          <button
            onClick={() => { if (isMobile) setMobileOpen(false); handleLogout() }}
            onMouseEnter={(e) => handleMouseEnter('Logout', e)}
            onMouseLeave={handleMouseLeave}
            className={cn(
              'flex items-center gap-3 rounded-lg text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-red-400 transition-all duration-150 w-full',
              isExpanded ? 'px-3 h-10' : 'justify-center h-10'
            )}
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" />
            {isExpanded && <span>Logout</span>}
          </button>

          {/* Toggle button (desktop only) */}
          {!isMobile && (
            <button
              onClick={toggleCollapsed}
              className="flex items-center justify-center gap-2 w-full h-9 rounded-lg text-zinc-500 hover:bg-white/5 hover:text-white transition-colors mt-1"
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              {isExpanded && <span className="text-xs">Collapse</span>}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-40 h-screen hidden md:flex flex-col no-print transition-all duration-200',
          collapsed ? 'w-16' : 'w-60'
        )}
        style={{ backgroundColor: '#1a1a2e' }}
      >
        {sidebarContent(false)}

        {/* Tooltip (collapsed hover) */}
        <AnimatePresence>
          {tooltip && collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -4 }}
              transition={{ duration: 0.1 }}
              className="fixed z-[60] ml-[68px] pointer-events-none"
              style={{ top: tooltip.top, transform: 'translateY(-50%)' }}
            >
              <div className="px-2.5 py-1.5 rounded-md bg-zinc-900 text-white text-xs font-medium shadow-lg border border-white/10 whitespace-nowrap">
                {tooltip.label}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </aside>

      {/* Top bar */}
      <header
        className={cn(
          'fixed top-0 right-0 z-30 h-12 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center no-print transition-all duration-200',
          'md:left-16',
          !collapsed && 'md:left-60',
          'left-0'
        )}
      >
        <div className="flex items-center justify-between w-full px-4 md:px-6">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-1.5 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{pageTitle}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      {/* Preview role banner */}
      {previewRole && (
        <div
          className={cn(
            'fixed top-12 right-0 z-30 bg-amber-100 dark:bg-amber-900/60 border-b border-amber-300 dark:border-amber-700 transition-all duration-200 no-print',
            'md:left-16 left-0',
            !collapsed && 'md:left-60'
          )}
        >
          <div className="px-4 md:px-6 py-1.5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-900 dark:text-amber-100">
              <Eye className="h-3.5 w-3.5" />
              Previewing as: <span className="font-bold">{ROLE_LABELS[previewRole]}</span>
            </div>
            <button
              onClick={() => setPreviewRole(null)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 hover:bg-amber-300 dark:hover:bg-amber-700 transition-colors"
            >
              <X className="h-3 w-3" />
              Exit
            </button>
          </div>
        </div>
      )}

      {/* Mobile drawer overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/50 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="fixed top-0 left-0 z-50 h-full w-[260px] md:hidden"
              style={{ backgroundColor: '#1a1a2e' }}
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {/* Close button */}
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-3 right-3 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors z-10"
              >
                <X className="h-4 w-4" />
              </button>
              {sidebarContent(true)}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
