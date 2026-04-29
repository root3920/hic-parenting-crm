'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { KPICard } from '@/components/shared/KPICard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DonutChart } from '@/components/charts/DonutChart'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { PageTransition } from '@/components/motion/PageTransition'
import { KPICardGrid } from '@/components/motion/KPICardGrid'
import { AnimatedTableRow, rowVariants } from '@/components/motion/AnimatedTableRow'
import {
  Table, TableBody, TableCell, TableHead, TableHeader,
} from '@/components/ui/table'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { DollarSign, Download, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { FinanceCommission, FinanceMonthly } from '@/types'

export const dynamic = 'force-dynamic'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return '$0'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
}

function fmtCompact(v: number | null | undefined): string {
  if (v == null) return '$0'
  if (Math.abs(v) >= 10000) return `$${(v / 1000).toFixed(1)}k`
  return fmtCurrency(v)
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return '0.0%'
  return `${v.toFixed(1)}%`
}

function pctColor(pct: number): string {
  if (pct >= 90) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
  if (pct >= 70) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400'
  if (pct >= 50) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400'
  return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
}

function pctBarColor(pct: number): string {
  if (pct >= 90) return 'bg-emerald-500'
  if (pct >= 70) return 'bg-yellow-500'
  if (pct >= 50) return 'bg-orange-500'
  return 'bg-red-500'
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    Paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
    Pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    'N/A': 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
    Refunded: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  }
  return map[status] || map['N/A']
}

const inputCls = 'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400'
const selectCls = 'text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400'

type Tab = 'dashboard' | 'commissions' | 'pnl'

const chartVariants = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, delay: 0.2, ease: 'easeOut' as const } },
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-md px-3 py-2">
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-sm font-semibold" style={{ color: p.color }}>
          {p.name}: {fmtCurrency(p.value)}
        </p>
      ))}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const supabase = useMemo(() => createClient(), [])
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [loading, setLoading] = useState(true)

  // Data
  const [commissions, setCommissions] = useState<FinanceCommission[]>([])
  const [monthly, setMonthly] = useState<FinanceMonthly[]>([])
  const [transactions, setTransactions] = useState<{ date: string; cost: number; status: string }[]>([])

  // P&L state
  const [plYear, setPlYear] = useState(new Date().getFullYear())
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null)
  const [editValue, setEditValue] = useState('')

  // Commissions filters
  const [dateRange, setDateRange] = useState('all')
  const [closerFilter, setCloserFilter] = useState('All')
  const [setterFilter, setSetterFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  // ── Fetch data ────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [commRes, monthRes, txRes] = await Promise.all([
      supabase.from('finance_commissions').select('*').order('date', { ascending: false }),
      supabase.from('finance_monthly').select('*').order('month', { ascending: true }),
      supabase.from('transactions').select('date, cost, status').order('date', { ascending: false }),
    ])
    setCommissions(commRes.data ?? [])
    setMonthly(monthRes.data ?? [])
    setTransactions(txRes.data ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Derived data ──────────────────────────────────────────────────────────

  const now = new Date()
  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const currentMonthTx = useMemo(() =>
    transactions.filter(t => t.date?.startsWith(curMonth) && t.status !== 'refunded'),
    [transactions, curMonth]
  )

  const totalRevenue = useMemo(() => currentMonthTx.reduce((s, t) => s + (t.cost || 0), 0), [currentMonthTx])

  const currentMonthCommissions = useMemo(() =>
    commissions.filter(c => c.date?.startsWith(curMonth)),
    [commissions, curMonth]
  )

  const totalProgramRevenue = useMemo(() =>
    currentMonthCommissions.reduce((s, c) => s + (c.amount || 0), 0),
    [currentMonthCommissions]
  )

  const totalCommissionsPaid = useMemo(() =>
    currentMonthCommissions.reduce((s, c) => {
      let amt = 0
      if (c.closer_status === 'Paid') amt += c.closer_commission || 0
      if (c.setter_status === 'Paid') amt += c.setter_commission || 0
      return s + amt
    }, 0),
    [currentMonthCommissions]
  )

  const totalCommissionsPending = useMemo(() =>
    currentMonthCommissions.reduce((s, c) => {
      let amt = 0
      if (c.closer_status === 'Pending') amt += c.closer_commission || 0
      if (c.setter_status === 'Pending') amt += c.setter_commission || 0
      return s + amt
    }, 0),
    [currentMonthCommissions]
  )

  const currentMonthPL = useMemo(() =>
    monthly.find(m => m.month?.startsWith(curMonth)),
    [monthly, curMonth]
  )

  const netIncome = currentMonthPL?.net_income_actual ?? 0
  const grossProfit = currentMonthPL?.gross_profit_actual ?? 0
  const expensesTotal = currentMonthPL?.expenses_total ?? 0

  const commissionRate = useMemo(() => {
    const totalAmt = commissions.reduce((s, c) => s + (c.amount || 0), 0)
    const totalComm = commissions.reduce((s, c) => s + (c.closer_commission || 0) + (c.setter_commission || 0), 0)
    return totalAmt > 0 ? (totalComm / totalAmt * 100) : 0
  }, [commissions])

  // ── Chart data ────────────────────────────────────────────────────────────

  const revenueVsNetData = useMemo(() =>
    monthly.map(m => ({
      month: MONTHS[parseInt(m.month?.slice(5, 7) || '1') - 1] + ' ' + m.month?.slice(2, 4),
      'Sales Actual': m.sales_actual || 0,
      'Net Income': m.net_income_actual || 0,
      'Expenses': m.expenses_total || 0,
    })),
    [monthly]
  )

  const commissionsByCloser = useMemo(() => {
    const map: Record<string, { paid: number; pending: number }> = {}
    commissions.forEach(c => {
      if (!c.closer_name) return
      if (!map[c.closer_name]) map[c.closer_name] = { paid: 0, pending: 0 }
      if (c.closer_status === 'Paid') map[c.closer_name].paid += c.closer_commission || 0
      else if (c.closer_status === 'Pending') map[c.closer_name].pending += c.closer_commission || 0
    })
    return Object.entries(map).map(([name, v]) => ({ name, ...v }))
  }, [commissions])

  const commissionsBySetter = useMemo(() => {
    const map: Record<string, { paid: number; pending: number }> = {}
    commissions.forEach(c => {
      if (!c.setter_name) return
      if (!map[c.setter_name]) map[c.setter_name] = { paid: 0, pending: 0 }
      if (c.setter_status === 'Paid') map[c.setter_name].paid += c.setter_commission || 0
      else if (c.setter_status === 'Pending') map[c.setter_name].pending += c.setter_commission || 0
    })
    return Object.entries(map).map(([name, v]) => ({ name, ...v }))
  }, [commissions])

  const revenueByMonth = useMemo(() =>
    monthly.map(m => ({
      month: MONTHS[parseInt(m.month?.slice(5, 7) || '1') - 1] + ' ' + m.month?.slice(2, 4),
      Forecast: m.sales_forecast || 0,
      Actual: m.sales_actual || 0,
    })),
    [monthly]
  )

  const commissionStatusData = useMemo(() => {
    const counts = { Paid: 0, Pending: 0, 'N/A': 0, Refunded: 0 }
    commissions.forEach(c => {
      counts[c.closer_status] = (counts[c.closer_status] || 0) + 1
      counts[c.setter_status] = (counts[c.setter_status] || 0) + 1
    })
    return [
      { name: 'Paid', value: counts.Paid, color: '#10b981' },
      { name: 'Pending', value: counts.Pending, color: '#f59e0b' },
      { name: 'N/A', value: counts['N/A'], color: '#a1a1aa' },
      { name: 'Refunded', value: counts.Refunded, color: '#ef4444' },
    ].filter(d => d.value > 0)
  }, [commissions])

  // ── Commissions filter logic ──────────────────────────────────────────────

  const filteredCommissions = useMemo(() => {
    let data = [...commissions]
    // Date range
    const today = new Date()
    if (dateRange === '7d') {
      const d = new Date(today); d.setDate(d.getDate() - 7)
      data = data.filter(c => new Date(c.date) >= d)
    } else if (dateRange === '30d') {
      const d = new Date(today); d.setDate(d.getDate() - 30)
      data = data.filter(c => new Date(c.date) >= d)
    } else if (dateRange === '90d') {
      const d = new Date(today); d.setDate(d.getDate() - 90)
      data = data.filter(c => new Date(c.date) >= d)
    } else if (dateRange === 'year') {
      const yr = today.getFullYear()
      data = data.filter(c => c.date?.startsWith(String(yr)))
    } else if (dateRange === 'custom' && customFrom && customTo) {
      data = data.filter(c => c.date >= customFrom && c.date <= customTo)
    }
    if (closerFilter !== 'All') data = data.filter(c => c.closer_name === closerFilter)
    if (setterFilter !== 'All') data = data.filter(c => c.setter_name === setterFilter)
    if (statusFilter !== 'All') data = data.filter(c => c.closer_status === statusFilter || c.setter_status === statusFilter)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      data = data.filter(c => c.client_name?.toLowerCase().includes(q))
    }
    return data
  }, [commissions, dateRange, closerFilter, setterFilter, statusFilter, searchQuery, customFrom, customTo])

  const uniqueClosers = useMemo(() => Array.from(new Set(commissions.map(c => c.closer_name).filter(Boolean))) as string[], [commissions])
  const uniqueSetters = useMemo(() => Array.from(new Set(commissions.map(c => c.setter_name).filter(Boolean))) as string[], [commissions])

  const summaryTotal = useMemo(() => filteredCommissions.reduce((s, c) => s + (c.amount || 0), 0), [filteredCommissions])
  const summaryCommissions = useMemo(() => filteredCommissions.reduce((s, c) => s + (c.closer_commission || 0) + (c.setter_commission || 0), 0), [filteredCommissions])
  const summaryPaid = useMemo(() => filteredCommissions.reduce((s, c) => {
    let a = 0
    if (c.closer_status === 'Paid') a += c.closer_commission || 0
    if (c.setter_status === 'Paid') a += c.setter_commission || 0
    return s + a
  }, 0), [filteredCommissions])
  const summaryPending = useMemo(() => filteredCommissions.reduce((s, c) => {
    let a = 0
    if (c.closer_status === 'Pending') a += c.closer_commission || 0
    if (c.setter_status === 'Pending') a += c.setter_commission || 0
    return s + a
  }, 0), [filteredCommissions])

  // ── Commission status update ──────────────────────────────────────────────

  async function updateCommissionStatus(id: string, field: 'closer_status' | 'setter_status', value: string) {
    const { error } = await supabase
      .from('finance_commissions')
      .update({ [field]: value })
      .eq('id', id)
    if (error) {
      toast.error('Failed to update status')
      return
    }
    setCommissions(prev => prev.map(c => c.id === id ? { ...c, [field]: value } as FinanceCommission : c))
    toast.success('Status updated')
  }

  // ── P&L logic ─────────────────────────────────────────────────────────────

  const plMonths = useMemo(() => {
    const yearMonths = monthly.filter(m => m.year === plYear)
    // Merge with actual sales from transactions
    return yearMonths.map(m => {
      const monthStr = m.month?.slice(0, 7)
      const monthTx = transactions.filter(t => t.date?.startsWith(monthStr || '') && t.status !== 'refunded')
      const salesActual = monthTx.reduce((s, t) => s + (t.cost || 0), 0)
      return { ...m, sales_actual: salesActual || m.sales_actual || 0 }
    })
  }, [monthly, plYear, transactions])

  const plTotals = useMemo(() => {
    const t = {
      sales_forecast: 0, sales_actual: 0,
      gross_profit_forecast: 0, gross_profit_actual: 0,
      net_income_forecast: 0, net_income_actual: 0,
      expenses_total: 0, expenses_payroll: 0, expenses_marketing: 0,
      expenses_software: 0, expenses_contractors: 0, expenses_other: 0,
    }
    plMonths.forEach(m => {
      t.sales_forecast += m.sales_forecast || 0
      t.sales_actual += m.sales_actual || 0
      t.gross_profit_forecast += m.gross_profit_forecast || 0
      t.gross_profit_actual += m.gross_profit_actual || 0
      t.net_income_forecast += m.net_income_forecast || 0
      t.net_income_actual += m.net_income_actual || 0
      t.expenses_total += m.expenses_total || 0
      t.expenses_payroll += m.expenses_payroll || 0
      t.expenses_marketing += m.expenses_marketing || 0
      t.expenses_software += m.expenses_software || 0
      t.expenses_contractors += m.expenses_contractors || 0
      t.expenses_other += m.expenses_other || 0
    })
    return t
  }, [plMonths])

  async function ensureYearMonths(year: number) {
    const existing = monthly.filter(m => m.year === year)
    if (existing.length >= 12) return
    const existingMonths = new Set(existing.map(m => m.month?.slice(0, 7)))
    const toCreate: { month: string; year: number }[] = []
    for (let i = 1; i <= 12; i++) {
      const key = `${year}-${String(i).padStart(2, '0')}`
      if (!existingMonths.has(key)) {
        toCreate.push({ month: `${key}-01`, year })
      }
    }
    if (toCreate.length > 0) {
      const { data } = await supabase.from('finance_monthly').insert(toCreate).select('*')
      if (data) setMonthly(prev => [...prev, ...data].sort((a, b) => a.month.localeCompare(b.month)))
    }
  }

  async function handlePlYearChange(year: number) {
    setPlYear(year)
    await ensureYearMonths(year)
  }

  async function savePlCell(id: string, field: string, value: string) {
    const numVal = parseFloat(value) || 0
    const { error } = await supabase
      .from('finance_monthly')
      .update({ [field]: numVal })
      .eq('id', id)
    if (error) {
      toast.error('Failed to save')
      return
    }
    setMonthly(prev => prev.map(m => m.id === id ? { ...m, [field]: numVal } as FinanceMonthly : m))
    setEditingCell(null)
    toast.success('Saved')
  }

  async function saveNotesCell(id: string, value: string) {
    const { error } = await supabase
      .from('finance_monthly')
      .update({ expenses_notes: value })
      .eq('id', id)
    if (error) {
      toast.error('Failed to save')
      return
    }
    setMonthly(prev => prev.map(m => m.id === id ? { ...m, expenses_notes: value } as FinanceMonthly : m))
    setEditingCell(null)
  }

  function exportCSV() {
    const headers = ['Month','Sales Forecast','Sales Actual','Sales %','Gross Profit Forecast','Gross Profit Actual','GP %','Net Income Forecast','Net Income Actual','NI %','Expenses','Payroll','Marketing','Software','Contractors','Other','Notes']
    const rows = plMonths.map(m => {
      const salesPct = m.sales_forecast ? ((m.sales_actual || 0) / m.sales_forecast * 100).toFixed(1) : '0'
      const gpPct = m.gross_profit_forecast ? ((m.gross_profit_actual || 0) / m.gross_profit_forecast * 100).toFixed(1) : '0'
      const niPct = m.net_income_forecast ? ((m.net_income_actual || 0) / m.net_income_forecast * 100).toFixed(1) : '0'
      return [
        MONTHS[parseInt(m.month?.slice(5, 7) || '1') - 1] + ' ' + m.month?.slice(0, 4),
        m.sales_forecast || 0, m.sales_actual || 0, salesPct,
        m.gross_profit_forecast || 0, m.gross_profit_actual || 0, gpPct,
        m.net_income_forecast || 0, m.net_income_actual || 0, niPct,
        m.expenses_total || 0, m.expenses_payroll || 0, m.expenses_marketing || 0,
        m.expenses_software || 0, m.expenses_contractors || 0, m.expenses_other || 0,
        `"${(m.expenses_notes || '').replace(/"/g, '""')}"`,
      ].join(',')
    })
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `PnL_${plYear}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Tab config ────────────────────────────────────────────────────────────

  const tabs: { key: Tab; label: string }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'commissions', label: 'Commissions' },
    { key: 'pnl', label: 'P&L' },
  ]

  // ── Editable cell component ───────────────────────────────────────────────

  function EditableCell({ id, field, value, isNotes }: { id: string; field: string; value: number | string | null; isNotes?: boolean }) {
    const isEditing = editingCell?.id === id && editingCell?.field === field
    if (isEditing) {
      return (
        <input
          autoFocus
          className="w-full text-xs border border-blue-400 rounded px-1.5 py-1 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none"
          defaultValue={editValue}
          onBlur={(e) => isNotes ? saveNotesCell(id, e.target.value) : savePlCell(id, field, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') isNotes ? saveNotesCell(id, (e.target as HTMLInputElement).value) : savePlCell(id, field, (e.target as HTMLInputElement).value)
            if (e.key === 'Escape') setEditingCell(null)
          }}
        />
      )
    }
    return (
      <button
        className="w-full text-left text-xs hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded px-1.5 py-1 transition-colors cursor-pointer"
        onClick={() => { setEditingCell({ id, field }); setEditValue(String(value ?? (isNotes ? '' : 0))) }}
      >
        {isNotes ? (value || '—') : fmtCurrency(value as number)}
      </button>
    )
  }

  // ── Pct cell with progress bar ────────────────────────────────────────────

  function PctCell({ actual, forecast }: { actual: number; forecast: number }) {
    const pct = forecast > 0 ? (actual / forecast * 100) : 0
    return (
      <div className="flex items-center gap-1.5">
        <div className="w-16 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
          <div className={cn('h-full rounded-full transition-all', pctBarColor(pct))} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', pctColor(pct))}>
          {fmtPct(pct)}
        </span>
      </div>
    )
  }

  // ── Inline status dropdown ────────────────────────────────────────────────

  function StatusDropdown({ commissionId, field, currentStatus }: { commissionId: string; field: 'closer_status' | 'setter_status'; currentStatus: string }) {
    const [open, setOpen] = useState(false)
    if (!open) {
      return (
        <button
          onClick={() => setOpen(true)}
          className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium cursor-pointer transition-opacity hover:opacity-80', statusBadge(currentStatus))}
        >
          {currentStatus}
        </button>
      )
    }
    return (
      <select
        autoFocus
        className="text-xs border border-zinc-300 dark:border-zinc-600 rounded px-1 py-0.5 bg-white dark:bg-zinc-800"
        defaultValue={currentStatus}
        onChange={(e) => { updateCommissionStatus(commissionId, field, e.target.value); setOpen(false) }}
        onBlur={() => setOpen(false)}
      >
        <option value="Paid">Paid</option>
        <option value="Pending">Pending</option>
        <option value="N/A">N/A</option>
        <option value="Refunded">Refunded</option>
      </select>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <PageTransition>
      <div className="p-4 md:p-8 max-w-screen-2xl mx-auto">
        <PageHeader
          title="Finance"
          description="Revenue, commissions, and profit & loss overview."
        />

        {/* Tabs */}
        <nav className="flex items-end gap-0 -mb-px border-b border-zinc-200 dark:border-zinc-800 mb-6">
          {tabs.map(({ key, label }) => {
            const isActive = activeTab === key
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={cn(
                  'relative px-5 py-3 text-sm font-medium transition-colors',
                  isActive ? 'text-[#185FA5]' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                )}
              >
                {label}
                {isActive && (
                  <motion.span
                    layoutId="finance-tab-underline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#185FA5]"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </button>
            )
          })}
        </nav>

        {/* ──────────────────────────────────────────────────────────────────── */}
        {/* TAB 1: DASHBOARD                                                    */}
        {/* ──────────────────────────────────────────────────────────────────── */}

        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* KPI Row 1 */}
            <KPICardGrid className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              <KPICard title="Total Revenue" value={fmtCompact(totalRevenue)} subtitle="This month" icon={<DollarSign className="h-4 w-4" />} loading={loading} />
              <KPICard title="Program Revenue" value={fmtCompact(totalProgramRevenue)} subtitle="Commissionable" icon={<DollarSign className="h-4 w-4" />} loading={loading} />
              <KPICard title="Commissions Paid" value={fmtCompact(totalCommissionsPaid)} subtitle="This month" loading={loading} />
              <KPICard title="Commissions Pending" value={fmtCompact(totalCommissionsPending)} subtitle="This month" loading={loading} />
            </KPICardGrid>

            {/* KPI Row 2 */}
            <KPICardGrid className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              <KPICard title="Net Income" value={fmtCompact(netIncome)} subtitle="This month" loading={loading} />
              <KPICard title="Gross Profit" value={fmtCompact(grossProfit)} subtitle="This month" loading={loading} />
              <KPICard title="Expenses" value={fmtCompact(expensesTotal)} subtitle="This month" loading={loading} />
              <KPICard title="Commission Rate" value={fmtPct(commissionRate)} subtitle="Avg all time" loading={loading} />
            </KPICardGrid>

            {/* Charts row 1 */}
            <div className="grid gap-6 lg:grid-cols-2">
              <motion.div variants={chartVariants} initial="hidden" animate="visible">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Monthly Revenue vs Net Income</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={revenueVsNetData} margin={{ top: 4, right: 12, left: 0, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#71717a' }} angle={-40} textAnchor="end" />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-zinc-600 dark:text-zinc-400">{v}</span>} />
                        <Line type="monotone" dataKey="Sales Actual" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                        <Line type="monotone" dataKey="Net Income" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                        <Line type="monotone" dataKey="Expenses" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div variants={chartVariants} initial="hidden" animate="visible">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Revenue by Month</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={revenueByMonth} margin={{ top: 4, right: 12, left: 0, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#71717a' }} angle={-40} textAnchor="end" />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-zinc-600 dark:text-zinc-400">{v}</span>} />
                        <Bar dataKey="Forecast" fill="#a1a1aa" radius={[3, 3, 0, 0]} maxBarSize={32} />
                        <Bar dataKey="Actual" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={32} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Charts row 2 */}
            <div className="grid gap-6 lg:grid-cols-3">
              <motion.div variants={chartVariants} initial="hidden" animate="visible">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Commissions by Closer</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={commissionsByCloser} margin={{ top: 4, right: 4, left: 0, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#71717a' }} angle={-40} textAnchor="end" />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-zinc-600 dark:text-zinc-400">{v}</span>} />
                        <Bar dataKey="paid" name="Paid" fill="#10b981" stackId="a" radius={[0, 0, 0, 0]} maxBarSize={40} />
                        <Bar dataKey="pending" name="Pending" fill="#f59e0b" stackId="a" radius={[3, 3, 0, 0]} maxBarSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div variants={chartVariants} initial="hidden" animate="visible">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Commissions by Setter</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={commissionsBySetter} margin={{ top: 4, right: 4, left: 0, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#71717a' }} angle={-40} textAnchor="end" />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-zinc-600 dark:text-zinc-400">{v}</span>} />
                        <Bar dataKey="paid" name="Paid" fill="#10b981" stackId="a" radius={[0, 0, 0, 0]} maxBarSize={40} />
                        <Bar dataKey="pending" name="Pending" fill="#f59e0b" stackId="a" radius={[3, 3, 0, 0]} maxBarSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div variants={chartVariants} initial="hidden" animate="visible">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Commission Status Breakdown</CardTitle></CardHeader>
                  <CardContent>
                    <DonutChart data={commissionStatusData} />
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </div>
        )}

        {/* ──────────────────────────────────────────────────────────────────── */}
        {/* TAB 2: COMMISSIONS                                                  */}
        {/* ──────────────────────────────────────────────────────────────────── */}

        {activeTab === 'commissions' && (
          <div className="space-y-5">
            {/* Filters */}
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Date Range</label>
                <select className={selectCls} value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                  <option value="year">This year</option>
                  <option value="all">All</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              {dateRange === 'custom' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">From</label>
                    <input type="date" className={inputCls} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">To</label>
                    <input type="date" className={inputCls} value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                  </div>
                </>
              )}
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Closer</label>
                <select className={selectCls} value={closerFilter} onChange={(e) => setCloserFilter(e.target.value)}>
                  <option value="All">All</option>
                  {uniqueClosers.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Setter</label>
                <select className={selectCls} value={setterFilter} onChange={(e) => setSetterFilter(e.target.value)}>
                  <option value="All">All</option>
                  {uniqueSetters.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Status</label>
                <select className={selectCls} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="All">All</option>
                  <option value="Paid">Paid</option>
                  <option value="Pending">Pending</option>
                  <option value="N/A">N/A</option>
                  <option value="Refunded">Refunded</option>
                </select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Search Client</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
                  <input className={cn(inputCls, 'pl-8')} placeholder="Search by client name..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Summary cards */}
            <KPICardGrid className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              <KPICard title="Total Amount" value={fmtCompact(summaryTotal)} loading={loading} />
              <KPICard title="Total Commissions" value={fmtCompact(summaryCommissions)} loading={loading} />
              <KPICard title="Paid" value={fmtCompact(summaryPaid)} loading={loading} />
              <KPICard title="Pending" value={fmtCompact(summaryPending)} loading={loading} />
            </KPICardGrid>

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <AnimatedTableRow variants={rowVariants} initial="hidden" animate="visible" custom={0} className="bg-zinc-50 dark:bg-zinc-900/50">
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Client</TableHead>
                        <TableHead className="text-xs">Product</TableHead>
                        <TableHead className="text-xs text-right">Amount</TableHead>
                        <TableHead className="text-xs">Closer</TableHead>
                        <TableHead className="text-xs text-right">Closer Comm. (15%)</TableHead>
                        <TableHead className="text-xs">Closer Status</TableHead>
                        <TableHead className="text-xs">Setter</TableHead>
                        <TableHead className="text-xs text-right">Setter Comm. (5%)</TableHead>
                        <TableHead className="text-xs">Setter Status</TableHead>
                        <TableHead className="text-xs text-right">Net Total</TableHead>
                      </AnimatedTableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCommissions.map((c, i) => {
                        const netTotal = (c.amount || 0) - (c.closer_commission || 0) - (c.setter_commission || 0)
                        return (
                          <AnimatedTableRow key={c.id} variants={rowVariants} initial="hidden" animate="visible" custom={i + 1} className="group even:bg-zinc-50/50 dark:even:bg-zinc-900/20">
                            <TableCell className="text-xs whitespace-nowrap">{c.date ? new Date(c.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</TableCell>
                            <TableCell className="text-xs font-medium">{c.client_name || '—'}</TableCell>
                            <TableCell className="text-xs">{c.product || '—'}</TableCell>
                            <TableCell className="text-xs text-right font-medium">{fmtCurrency(c.amount)}</TableCell>
                            <TableCell className="text-xs">{c.closer_name || '—'}</TableCell>
                            <TableCell className="text-xs text-right">{c.closer_commission != null ? fmtCurrency(c.closer_commission) : '—'}</TableCell>
                            <TableCell className="text-xs">
                              <StatusDropdown commissionId={c.id} field="closer_status" currentStatus={c.closer_status} />
                            </TableCell>
                            <TableCell className="text-xs">{c.setter_name || '—'}</TableCell>
                            <TableCell className="text-xs text-right">{c.setter_commission != null ? fmtCurrency(c.setter_commission) : '—'}</TableCell>
                            <TableCell className="text-xs">
                              <StatusDropdown commissionId={c.id} field="setter_status" currentStatus={c.setter_status} />
                            </TableCell>
                            <TableCell className="text-xs text-right font-semibold">{fmtCurrency(netTotal)}</TableCell>
                          </AnimatedTableRow>
                        )
                      })}
                      {filteredCommissions.length === 0 && (
                        <tr><td colSpan={11} className="text-center py-12 text-sm text-zinc-400">No commissions found</td></tr>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ──────────────────────────────────────────────────────────────────── */}
        {/* TAB 3: P&L                                                          */}
        {/* ──────────────────────────────────────────────────────────────────── */}

        {activeTab === 'pnl' && (
          <div className="space-y-5">
            {/* Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Year:</label>
                <select className={selectCls} value={plYear} onChange={(e) => handlePlYearChange(parseInt(e.target.value))}>
                  {[2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <button
                onClick={exportCSV}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                <Download className="h-4 w-4" /> Export CSV
              </button>
            </div>

            {/* P&L Table */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-900/50 sticky top-0 z-10">
                        <th className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 px-3 py-3 whitespace-nowrap">Month</th>
                        <th className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 px-3 py-3 text-right whitespace-nowrap">Sales Forecast</th>
                        <th className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 px-3 py-3 text-right whitespace-nowrap">Sales Actual</th>
                        <th className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 px-3 py-3 whitespace-nowrap">Sales %</th>
                        <th className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 px-3 py-3 text-right whitespace-nowrap">GP Forecast</th>
                        <th className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 px-3 py-3 text-right whitespace-nowrap">Gross Profit</th>
                        <th className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 px-3 py-3 whitespace-nowrap">GP %</th>
                        <th className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 px-3 py-3 text-right whitespace-nowrap">NI Forecast</th>
                        <th className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 px-3 py-3 text-right whitespace-nowrap">Net Income</th>
                        <th className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 px-3 py-3 whitespace-nowrap">NI %</th>
                        <th className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 px-3 py-3 text-right whitespace-nowrap">Expenses</th>
                        <th className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 px-3 py-3 text-right whitespace-nowrap">Payroll</th>
                        <th className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 px-3 py-3 text-right whitespace-nowrap">Marketing</th>
                        <th className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 px-3 py-3 text-right whitespace-nowrap">Software</th>
                        <th className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 px-3 py-3 text-right whitespace-nowrap">Contractors</th>
                        <th className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 px-3 py-3 text-right whitespace-nowrap">Other</th>
                        <th className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 px-3 py-3 whitespace-nowrap">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plMonths.map((m, i) => {
                        const salesPct = m.sales_forecast ? (m.sales_actual || 0) / m.sales_forecast * 100 : 0
                        const gpPct = m.gross_profit_forecast ? (m.gross_profit_actual || 0) / m.gross_profit_forecast * 100 : 0
                        const niPct = m.net_income_forecast ? (m.net_income_actual || 0) / m.net_income_forecast * 100 : 0
                        return (
                          <tr key={m.id} className={cn('border-b border-zinc-100 dark:border-zinc-800 transition-colors hover:bg-blue-50/50 dark:hover:bg-blue-900/10', i % 2 === 1 && 'bg-zinc-50/50 dark:bg-zinc-900/20')}>
                            <td className="px-3 py-2.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 whitespace-nowrap">
                              {MONTHS[parseInt(m.month?.slice(5, 7) || '1') - 1]} {m.month?.slice(0, 4)}
                            </td>
                            <td className="px-3 py-2.5 text-right"><EditableCell id={m.id} field="sales_forecast" value={m.sales_forecast} /></td>
                            <td className="px-3 py-2.5 text-right text-xs font-medium text-zinc-800 dark:text-zinc-200">{fmtCurrency(m.sales_actual)}</td>
                            <td className="px-3 py-2.5"><PctCell actual={m.sales_actual || 0} forecast={m.sales_forecast || 0} /></td>
                            <td className="px-3 py-2.5 text-right"><EditableCell id={m.id} field="gross_profit_forecast" value={m.gross_profit_forecast} /></td>
                            <td className="px-3 py-2.5 text-right text-xs font-medium text-zinc-800 dark:text-zinc-200">{fmtCurrency(m.gross_profit_actual)}</td>
                            <td className="px-3 py-2.5"><PctCell actual={m.gross_profit_actual || 0} forecast={m.gross_profit_forecast || 0} /></td>
                            <td className="px-3 py-2.5 text-right"><EditableCell id={m.id} field="net_income_forecast" value={m.net_income_forecast} /></td>
                            <td className="px-3 py-2.5 text-right text-xs font-medium text-zinc-800 dark:text-zinc-200">{fmtCurrency(m.net_income_actual)}</td>
                            <td className="px-3 py-2.5"><PctCell actual={m.net_income_actual || 0} forecast={m.net_income_forecast || 0} /></td>
                            <td className="px-3 py-2.5 text-right"><EditableCell id={m.id} field="expenses_total" value={m.expenses_total} /></td>
                            <td className="px-3 py-2.5 text-right"><EditableCell id={m.id} field="expenses_payroll" value={m.expenses_payroll} /></td>
                            <td className="px-3 py-2.5 text-right"><EditableCell id={m.id} field="expenses_marketing" value={m.expenses_marketing} /></td>
                            <td className="px-3 py-2.5 text-right"><EditableCell id={m.id} field="expenses_software" value={m.expenses_software} /></td>
                            <td className="px-3 py-2.5 text-right"><EditableCell id={m.id} field="expenses_contractors" value={m.expenses_contractors} /></td>
                            <td className="px-3 py-2.5 text-right"><EditableCell id={m.id} field="expenses_other" value={m.expenses_other} /></td>
                            <td className="px-3 py-2.5 max-w-[200px]"><EditableCell id={m.id} field="expenses_notes" value={m.expenses_notes} isNotes /></td>
                          </tr>
                        )
                      })}

                      {/* Totals row */}
                      {plMonths.length > 0 && (
                        <tr className="bg-zinc-100 dark:bg-zinc-800/60 font-bold border-t-2 border-zinc-300 dark:border-zinc-600">
                          <td className="px-3 py-3 text-xs font-bold text-zinc-800 dark:text-zinc-200">TOTAL</td>
                          <td className="px-3 py-3 text-right text-xs font-bold text-zinc-800 dark:text-zinc-200">{fmtCurrency(plTotals.sales_forecast)}</td>
                          <td className="px-3 py-3 text-right text-xs font-bold text-zinc-800 dark:text-zinc-200">{fmtCurrency(plTotals.sales_actual)}</td>
                          <td className="px-3 py-3"><PctCell actual={plTotals.sales_actual} forecast={plTotals.sales_forecast} /></td>
                          <td className="px-3 py-3 text-right text-xs font-bold text-zinc-800 dark:text-zinc-200">{fmtCurrency(plTotals.gross_profit_forecast)}</td>
                          <td className="px-3 py-3 text-right text-xs font-bold text-zinc-800 dark:text-zinc-200">{fmtCurrency(plTotals.gross_profit_actual)}</td>
                          <td className="px-3 py-3"><PctCell actual={plTotals.gross_profit_actual} forecast={plTotals.gross_profit_forecast} /></td>
                          <td className="px-3 py-3 text-right text-xs font-bold text-zinc-800 dark:text-zinc-200">{fmtCurrency(plTotals.net_income_forecast)}</td>
                          <td className="px-3 py-3 text-right text-xs font-bold text-zinc-800 dark:text-zinc-200">{fmtCurrency(plTotals.net_income_actual)}</td>
                          <td className="px-3 py-3"><PctCell actual={plTotals.net_income_actual} forecast={plTotals.net_income_forecast} /></td>
                          <td className="px-3 py-3 text-right text-xs font-bold text-zinc-800 dark:text-zinc-200">{fmtCurrency(plTotals.expenses_total)}</td>
                          <td className="px-3 py-3 text-right text-xs font-bold text-zinc-800 dark:text-zinc-200">{fmtCurrency(plTotals.expenses_payroll)}</td>
                          <td className="px-3 py-3 text-right text-xs font-bold text-zinc-800 dark:text-zinc-200">{fmtCurrency(plTotals.expenses_marketing)}</td>
                          <td className="px-3 py-3 text-right text-xs font-bold text-zinc-800 dark:text-zinc-200">{fmtCurrency(plTotals.expenses_software)}</td>
                          <td className="px-3 py-3 text-right text-xs font-bold text-zinc-800 dark:text-zinc-200">{fmtCurrency(plTotals.expenses_contractors)}</td>
                          <td className="px-3 py-3 text-right text-xs font-bold text-zinc-800 dark:text-zinc-200">{fmtCurrency(plTotals.expenses_other)}</td>
                          <td className="px-3 py-3"></td>
                        </tr>
                      )}

                      {plMonths.length === 0 && (
                        <tr><td colSpan={17} className="text-center py-12 text-sm text-zinc-400">No data for {plYear}. Select a year to auto-create months.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </PageTransition>
  )
}
