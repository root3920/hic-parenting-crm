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

const CLOSERS = [
  'Marcela HIC Parenting',
  'Ana Martin',
  'Cali Luna',
  'Ariana Peña',
  'Jessica Fisk-Abraham',
  'Maya Ahmed',
  'Sona Patel',
  'Steffanie Williams',
  'Sylvia Smit',
  'Tina Balmer',
  'Veronica Herrera',
  'Liliana Mendoza',
  'Karina Lopez',
  'Amanda Smith',
]

const SETTERS = [
  'Valentina Llano',
  'Marcela Collier',
  'Ana Martin',
  'Beatriz Navarro',
  'Casper Holm',
  'Hamza Sayyed',
  'Katy Castellanos',
  'Lamees Attia',
  'Mariana Llano',
  'Marrian Yousef',
  'Patsy George',
  'Rohit Rajendranath',
  'Tina Balmer',
  'Sylvia Smit',
  'Venicia Lloyd',
]

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
  const [transactions, setTransactions] = useState<{ date: string; cost: number; status: string; offer_title: string }[]>([])

  // P&L state
  const [plYear, setPlYear] = useState(new Date().getFullYear())
  const [plEditingCell, setPlEditingCell] = useState<{ id: string; field: string } | null>(null)
  const [plEditValue, setPlEditValue] = useState('')

  // Commissions inline edit (closer/setter)
  const [commEditingCell, setCommEditingCell] = useState<{ id: string; field: 'closer' | 'setter' } | null>(null)
  const [commEditValue, setCommEditValue] = useState('')

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

    // Paginated helper for tables accessed via browser client
    async function fetchPaginated<T>(
      table: string,
      select: string,
      orderCol: string,
      ascending: boolean,
    ): Promise<T[]> {
      const pageSize = 1000
      let all: T[] = []
      let page = 0
      while (true) {
        const { data, error } = await supabase
          .from(table)
          .select(select)
          .order(orderCol, { ascending })
          .range(page * pageSize, (page + 1) * pageSize - 1)
        if (error) {
          console.error(`[Finance] Error fetching ${table}:`, error.message, error)
          break
        }
        if (!data || data.length === 0) break
        all = [...all, ...(data as T[])]
        if (data.length < pageSize) break
        page++
      }
      return all
    }

    // Commissions fetched via API route (bypasses RLS with service role)
    async function fetchCommissions(): Promise<FinanceCommission[]> {
      try {
        const res = await fetch('/api/finance/commissions')
        if (!res.ok) {
          console.error('[Finance] Commissions API error:', res.status, await res.text())
          return []
        }
        const data = await res.json()
        return data as FinanceCommission[]
      } catch (err) {
        console.error('[Finance] Commissions fetch failed:', err)
        return []
      }
    }

    const [comm, mon, tx] = await Promise.all([
      fetchCommissions(),
      fetchPaginated<FinanceMonthly>('finance_monthly', '*', 'month', true),
      fetchPaginated<{ date: string; cost: number; status: string; offer_title: string }>(
        'transactions', 'date, cost, status, offer_title', 'date', false,
      ),
    ])

    console.log(`[Finance] Loaded: ${comm.length} commissions, ${mon.length} monthly, ${tx.length} transactions`)
    setCommissions(comm)
    setMonthly(mon)
    setTransactions(tx)
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Derived data ──────────────────────────────────────────────────────────

  const now = new Date()
  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const startOfMonth = `${curMonth}-01`
  const endOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`

  // Total Revenue — match Dashboard logic: only 'completed' and 'recovered' statuses
  const validStatuses = ['completed', 'recovered']
  const currentMonthTx = useMemo(() =>
    transactions.filter(t => t.date >= startOfMonth && t.date <= endOfMonth && validStatuses.includes(t.status)),
    [transactions, startOfMonth, endOfMonth]
  )

  const totalRevenue = useMemo(() => currentMonthTx.reduce((s, t) => s + (t.cost || 0), 0), [currentMonthTx])

  // FIX 2: Program Revenue — from transactions filtered by High Ticket (PWU/Program) offer titles
  const totalProgramRevenue = useMemo(() =>
    currentMonthTx
      .filter(t => {
        const title = (t.offer_title || '').toLowerCase()
        return title.includes('parenting with understanding') || title.includes('program')
      })
      .reduce((s, t) => s + (t.cost || 0), 0),
    [currentMonthTx]
  )

  // Commissions — from finance_commissions filtered by current month payment_date
  const currentMonthCommissions = useMemo(() =>
    commissions.filter(c => c.payment_date >= startOfMonth && c.payment_date <= endOfMonth),
    [commissions, startOfMonth, endOfMonth]
  )

  const totalCommissionsPaid = useMemo(() =>
    currentMonthCommissions.reduce((s, c) => {
      let amt = 0
      if (c.closer_commission_status === 'Paid') amt += c.closer_commission || 0
      if (c.setter_commission_status === 'Paid') amt += c.setter_commission || 0
      return s + amt
    }, 0),
    [currentMonthCommissions]
  )

  const totalCommissionsPending = useMemo(() =>
    currentMonthCommissions.reduce((s, c) => {
      let amt = 0
      if (c.closer_commission_status === 'Pending') amt += c.closer_commission || 0
      if (c.setter_commission_status === 'Pending') amt += c.setter_commission || 0
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
    const totalAmt = commissions.reduce((s, c) => s + (Number(c.amount) || 0), 0)
    const totalComm = commissions.reduce((s, c) => s + (Number(c.total_commission) || 0), 0)
    return totalAmt > 0 ? (totalComm / totalAmt * 100) : 0
  }, [commissions])

  // ── Chart data ────────────────────────────────────────────────────────────

  // FIX 4: Build monthly sales from transactions, not finance_monthly.sales_actual
  const salesByMonth = useMemo(() => {
    const map: Record<string, number> = {}
    transactions.forEach(t => {
      if (!validStatuses.includes(t.status)) return
      const key = t.date?.substring(0, 7) // "YYYY-MM"
      if (key) map[key] = (map[key] || 0) + (t.cost || 0)
    })
    return map
  }, [transactions])

  const revenueVsNetData = useMemo(() =>
    monthly.map(m => {
      const monthKey = m.month?.slice(0, 7) || ''
      return {
        month: MONTHS[parseInt(m.month?.slice(5, 7) || '1') - 1] + ' ' + m.month?.slice(2, 4),
        'Sales Actual': salesByMonth[monthKey] || 0,
        'Net Income': m.net_income_actual || 0,
        'Expenses': m.expenses_total || 0,
      }
    }),
    [monthly, salesByMonth]
  )

  const commissionsByCloser = useMemo(() => {
    const map: Record<string, { paid: number; pending: number }> = {}
    commissions.forEach(c => {
      if (!c.closer) return
      if (!map[c.closer]) map[c.closer] = { paid: 0, pending: 0 }
      if (c.closer_commission_status === 'Paid') map[c.closer].paid += Number(c.closer_commission) || 0
      else if (c.closer_commission_status === 'Pending') map[c.closer].pending += Number(c.closer_commission) || 0
    })
    return Object.entries(map).map(([name, v]) => ({ name, ...v }))
  }, [commissions])

  const commissionsBySetter = useMemo(() => {
    const map: Record<string, { paid: number; pending: number }> = {}
    commissions.forEach(c => {
      if (!c.setter) return
      if (!map[c.setter]) map[c.setter] = { paid: 0, pending: 0 }
      if (c.setter_commission_status === 'Paid') map[c.setter].paid += Number(c.setter_commission) || 0
      else if (c.setter_commission_status === 'Pending') map[c.setter].pending += Number(c.setter_commission) || 0
    })
    return Object.entries(map).map(([name, v]) => ({ name, ...v }))
  }, [commissions])

  const revenueByMonth = useMemo(() =>
    monthly.map(m => {
      const monthKey = m.month?.slice(0, 7) || ''
      return {
        month: MONTHS[parseInt(m.month?.slice(5, 7) || '1') - 1] + ' ' + m.month?.slice(2, 4),
        Forecast: m.sales_forecast || 0,
        Actual: salesByMonth[monthKey] || 0,
      }
    }),
    [monthly, salesByMonth]
  )

  const commissionStatusData = useMemo(() => {
    const counts: Record<string, number> = { Paid: 0, Pending: 0, 'N/A': 0, Refunded: 0 }
    commissions.forEach(c => {
      const cs = c.closer_commission_status || 'N/A'
      const ss = c.setter_commission_status || 'N/A'
      counts[cs] = (counts[cs] || 0) + 1
      counts[ss] = (counts[ss] || 0) + 1
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
    // Date range filter on payment_date
    const today = new Date()
    if (dateRange === '7d') {
      const d = new Date(today); d.setDate(d.getDate() - 7)
      data = data.filter(c => new Date(c.payment_date) >= d)
    } else if (dateRange === '30d') {
      const d = new Date(today); d.setDate(d.getDate() - 30)
      data = data.filter(c => new Date(c.payment_date) >= d)
    } else if (dateRange === '90d') {
      const d = new Date(today); d.setDate(d.getDate() - 90)
      data = data.filter(c => new Date(c.payment_date) >= d)
    } else if (dateRange === 'year') {
      const yr = today.getFullYear()
      data = data.filter(c => c.payment_date?.startsWith(String(yr)))
    } else if (dateRange === 'custom' && customFrom && customTo) {
      data = data.filter(c => c.payment_date >= customFrom && c.payment_date <= customTo)
    }
    if (closerFilter !== 'All') data = data.filter(c => c.closer === closerFilter)
    if (setterFilter !== 'All') data = data.filter(c => c.setter === setterFilter)
    if (statusFilter !== 'All') data = data.filter(c => c.closer_commission_status === statusFilter || c.setter_commission_status === statusFilter)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      data = data.filter(c => c.client?.toLowerCase().includes(q))
    }
    return data
  }, [commissions, dateRange, closerFilter, setterFilter, statusFilter, searchQuery, customFrom, customTo])


  const summaryTotal = useMemo(() => filteredCommissions.reduce((s, c) => s + (Number(c.amount) || 0), 0), [filteredCommissions])
  const summaryCommissions = useMemo(() => filteredCommissions.reduce((s, c) => s + (Number(c.total_commission) || 0), 0), [filteredCommissions])
  const summaryPaid = useMemo(() => filteredCommissions.reduce((s, c) => s + (Number(c.commission_paid) || 0), 0), [filteredCommissions])
  const summaryPending = useMemo(() => filteredCommissions.reduce((s, c) => s + (Number(c.commission_pending) || 0), 0), [filteredCommissions])

  // ── Commission status update (via API to bypass RLS) ──────────────────────

  async function updateCommissionStatus(id: string, field: 'closer_commission_status' | 'setter_commission_status', value: string) {
    try {
      const res = await fetch('/api/finance/commissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, field, value }),
      })
      if (!res.ok) {
        toast.error('Failed to update status')
        return
      }
      setCommissions(prev => prev.map(c => c.id === id ? { ...c, [field]: value } as FinanceCommission : c))
      toast.success('Status updated')
    } catch {
      toast.error('Failed to update status')
    }
  }

  // ── Inline closer/setter edit ─────────────────────────────────────────────

  async function handleSaveCommEdit(id: string, field: 'closer' | 'setter', value: string) {
    setCommEditingCell(null)
    const row = commissions.find(c => c.id === id)
    if (!row) return

    const amount = Number(row.amount) || 0
    const updates: Record<string, unknown> = { [field]: value || null }

    if (field === 'closer') {
      updates.closer_commission = value ? amount * 0.15 : 0
      updates.closer_commission_status = value ? (row.closer_commission_status === 'Paid' ? 'Paid' : 'Pending') : 'N/A'
    }
    if (field === 'setter') {
      updates.setter_commission = value ? amount * 0.05 : 0
      updates.setter_commission_status = value ? (row.setter_commission_status === 'Paid' ? 'Paid' : 'Pending') : 'N/A'
    }

    const newCloserComm = field === 'closer' ? (value ? amount * 0.15 : 0) : (Number(row.closer_commission) || 0)
    const newSetterComm = field === 'setter' ? (value ? amount * 0.05 : 0) : (Number(row.setter_commission) || 0)
    updates.total_commission = newCloserComm + newSetterComm
    updates.commission_pending = newCloserComm + newSetterComm
    updates.net_total = amount - (newCloserComm + newSetterComm)

    // Optimistic update
    setCommissions(prev => prev.map(c => c.id === id ? { ...c, ...updates } as FinanceCommission : c))

    try {
      const res = await fetch('/api/finance/commissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, updates }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }))
        console.error('[Finance] Save error:', err)
        toast.error('Error: ' + (err.error || 'Failed to save'))
      } else {
        toast.success('Updated')
      }
    } catch (err) {
      console.error('[Finance] Save failed:', err)
      toast.error('Error saving')
    }
  }

  // ── P&L logic (vertical layout) ────────────────────────────────────────────

  const MONTH_KEYS = ['01','02','03','04','05','06','07','08','09','10','11','12']

  const EXPENSE_ROWS: { key: string; label: string }[] = [
    { key: 'advertising_marketing', label: 'Advertising & Marketing' },
    { key: 'bank_charges', label: 'Bank Charges' },
    { key: 'contractors', label: 'Contractors' },
    { key: 'legal_professional', label: 'Legal & Professional' },
    { key: 'office_software', label: 'Office & Software' },
    { key: 'payroll_company', label: 'Payroll Company' },
    { key: 'payroll_fees', label: 'Payroll Fees' },
    { key: 'professional_fees', label: 'Professional Fees' },
    { key: 'taxes_licenses', label: 'Taxes & Licenses' },
    { key: 'telephone', label: 'Telephone' },
    { key: 'travel', label: 'Travel' },
    { key: 'utilities', label: 'Utilities' },
    { key: 'other_expenses', label: 'Other Expenses' },
  ]

  // Build keyed map: { '2025-01': { id, sales_forecast, ... }, ... }
  const plData = useMemo(() => {
    const map: Record<string, FinanceMonthly> = {}
    monthly.filter(m => m.year === plYear).forEach(m => {
      const md = (m.month || m.month_date || '').slice(0, 7)
      if (md) {
        // For 2026+, override sales_actual from transactions
        const autoSales = plYear >= 2026 ? (salesByMonth[md] || 0) : (m.sales_actual || 0)
        map[md] = { ...m, sales_actual: autoSales }
      }
    })
    return map
  }, [monthly, plYear, salesByMonth])

  // Helper to get a field value for a month
  function plVal(mk: string, field: string): number {
    const row = plData[`${plYear}-${mk}`]
    return row ? (Number((row as unknown as Record<string, unknown>)[field]) || 0) : 0
  }

  // Helper to get row id for a month
  function plId(mk: string): string | null {
    return plData[`${plYear}-${mk}`]?.id ?? null
  }

  // Sum a field across all 12 months
  function plTotal(field: string): number {
    return MONTH_KEYS.reduce((s, mk) => s + plVal(mk, field), 0)
  }

  // Pct calc
  function plPct(mk: string, actualField: string, forecastField: string): number {
    const f = plVal(mk, forecastField)
    return f > 0 ? (plVal(mk, actualField) / f * 100) : 0
  }

  async function ensureYearMonths(year: number) {
    const existing = monthly.filter(m => m.year === year)
    if (existing.length >= 12) return
    const existingMonths = new Set(existing.map(m => (m.month || m.month_date || '').slice(0, 7)))
    const toCreate: { month_date: string; year: number }[] = []
    for (let i = 1; i <= 12; i++) {
      const key = `${year}-${String(i).padStart(2, '0')}`
      if (!existingMonths.has(key)) {
        toCreate.push({ month_date: `${key}-01`, year })
      }
    }
    if (toCreate.length > 0) {
      const { data } = await supabase.from('finance_monthly').insert(toCreate).select('*')
      if (data) setMonthly(prev => [...prev, ...data].sort((a, b) => (a.month || a.month_date || '').localeCompare(b.month || b.month_date || '')))
    }
  }

  async function handlePlYearChange(year: number) {
    setPlYear(year)
    await ensureYearMonths(year)
  }

  async function handlePLSave(id: string, field: string, value: number) {
    setMonthly(prev => prev.map(m => m.id === id ? { ...m, [field]: value } as FinanceMonthly : m))
    setPlEditingCell(null)
    try {
      const res = await fetch('/api/finance/monthly', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, updates: { [field]: value } }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown' }))
        toast.error('Error: ' + (err.error || 'Failed to save'))
      } else {
        toast.success('Saved')
      }
    } catch {
      toast.error('Error saving')
    }
  }

  function exportCSV() {
    const metricLabels = ['Sales Forecast','Sales Actual','Sales %', ...EXPENSE_ROWS.map(r => r.label), 'TOTAL EXPENSES', 'GP Forecast','Gross Profit','GP %','NI Forecast','Net Income','NI %']
    const metricFields = ['sales_forecast','sales_actual','_sales_pct', ...EXPENSE_ROWS.map(r => r.key), '_total_exp', 'gross_profit_forecast','gross_profit_actual','_gp_pct','net_income_forecast','net_income_actual','_ni_pct']
    const header = ['Metric', ...MONTHS, 'TOTAL']
    const rows = metricLabels.map((label, idx) => {
      const field = metricFields[idx]
      const vals = MONTH_KEYS.map(mk => {
        if (field === '_sales_pct') return plPct(mk, 'sales_actual', 'sales_forecast').toFixed(1) + '%'
        if (field === '_gp_pct') return plPct(mk, 'gross_profit_actual', 'gross_profit_forecast').toFixed(1) + '%'
        if (field === '_ni_pct') return plPct(mk, 'net_income_actual', 'net_income_forecast').toFixed(1) + '%'
        if (field === '_total_exp') return EXPENSE_ROWS.reduce((s, r) => s + plVal(mk, r.key), 0)
        return plVal(mk, field)
      })
      const total: string | number = field.startsWith('_') ? '' : vals.reduce<number>((s, v) => s + (typeof v === 'number' ? v : 0), 0)
      return [label, ...vals, total].join(',')
    })
    const csv = [header.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `PnL_${plYear}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Tab config ────────────────────────────────────────────────────────────

  const tabs: { key: Tab; label: string }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'commissions', label: 'Commissions' },
    { key: 'pnl', label: 'P&L' },
  ]

  // ── P&L vertical cell components ────────────────────────────────────────────

  function PLCell({ mk, field }: { mk: string; field: string }) {
    const id = plId(mk)
    const value = plVal(mk, field)
    const cellKey = `${id}-${field}`
    const isEditing = plEditingCell?.id === id && plEditingCell?.field === field

    if (!id) return <td className="px-3 py-2 text-right text-sm text-zinc-300 dark:text-zinc-600">$0.00</td>

    if (isEditing) {
      return (
        <td className="px-2 py-1">
          <input
            autoFocus
            type="number"
            className="w-24 text-sm border border-blue-400 rounded px-2 py-1 text-right bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none"
            defaultValue={plEditValue}
            onBlur={(e) => handlePLSave(id, field, parseFloat(e.target.value) || 0)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handlePLSave(id, field, parseFloat((e.target as HTMLInputElement).value) || 0)
              if (e.key === 'Escape') setPlEditingCell(null)
            }}
          />
        </td>
      )
    }

    return (
      <td
        className="px-3 py-2 text-right text-sm cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group/plc"
        onClick={() => { setPlEditingCell({ id, field }); setPlEditValue(String(value)) }}
      >
        <span className={cn(value === 0 && 'text-zinc-300 dark:text-zinc-600', value < 0 && 'text-red-600 dark:text-red-400')}>
          {fmtCurrency(value)}
        </span>
        <span className="opacity-0 group-hover/plc:opacity-100 ml-1 text-[10px] text-blue-400">&#9998;</span>
      </td>
    )
  }

  function AutoCell({ value }: { value: number }) {
    return (
      <td className="px-3 py-2 text-right text-sm bg-zinc-50/80 dark:bg-zinc-800/30">
        <span className={cn('font-medium', value === 0 && 'text-zinc-400', value < 0 && 'text-red-600 dark:text-red-400')}>
          {fmtCurrency(value)}
        </span>
      </td>
    )
  }

  function PctTd({ actual, forecast }: { actual: number; forecast: number }) {
    const pct = forecast > 0 ? (actual / forecast * 100) : 0
    return (
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <div className="w-12 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
            <div className={cn('h-full rounded-full', pctBarColor(pct))} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          <span className={cn('text-xs font-semibold', pctColor(pct).replace(/bg-\S+\s?/g, ''))}>
            {fmtPct(pct)}
          </span>
        </div>
      </td>
    )
  }

  function TotalTd({ value, bold }: { value: number; bold?: boolean }) {
    return (
      <td className={cn('px-3 py-2 text-right text-sm border-l border-zinc-200 dark:border-zinc-700', bold && 'font-bold')}>
        <span className={cn(value === 0 && 'text-zinc-400', value < 0 && 'text-red-600 dark:text-red-400')}>
          {fmtCurrency(value)}
        </span>
      </td>
    )
  }

  // ── Inline status dropdown ────────────────────────────────────────────────

  function StatusDropdown({ commissionId, field, currentStatus }: { commissionId: string; field: 'closer_commission_status' | 'setter_commission_status'; currentStatus: string }) {
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
                  {CLOSERS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Setter</label>
                <select className={selectCls} value={setterFilter} onChange={(e) => setSetterFilter(e.target.value)}>
                  <option value="All">All</option>
                  {SETTERS.map(s => <option key={s} value={s}>{s}</option>)}
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

            {/* Record count */}
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {filteredCommissions.length} of {commissions.length} PWU commissions
            </p>

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <AnimatedTableRow variants={rowVariants} initial="hidden" animate="visible" custom={0} className="bg-zinc-50 dark:bg-zinc-900/50">
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Client</TableHead>
                        <TableHead className="text-xs">Description</TableHead>
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
                      {loading ? (
                        <tr><td colSpan={11} className="text-center py-12 text-sm text-zinc-400">Loading...</td></tr>
                      ) : filteredCommissions.length === 0 ? (
                        <tr><td colSpan={11} className="text-center py-12 text-sm text-zinc-400">No commissions found</td></tr>
                      ) : filteredCommissions.map((c, i) => {
                        const desc = c.payment_description || '—'
                        const truncDesc = desc.length > 40 ? desc.slice(0, 40) + '...' : desc
                        return (
                          <AnimatedTableRow key={c.id} variants={rowVariants} initial="hidden" animate="visible" custom={i + 1} className="group even:bg-zinc-50/50 dark:even:bg-zinc-900/20">
                            <TableCell className="text-xs whitespace-nowrap">{c.payment_date ? new Date(c.payment_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</TableCell>
                            <TableCell className="text-xs font-medium">{c.client || '—'}</TableCell>
                            <TableCell className="text-xs" title={desc}>{truncDesc}</TableCell>
                            <TableCell className="text-xs text-right font-medium">{fmtCurrency(Number(c.amount))}</TableCell>
                            <TableCell className="text-xs">
                              {commEditingCell?.id === c.id && commEditingCell?.field === 'closer' ? (
                                <select
                                  autoFocus
                                  value={commEditValue}
                                  onChange={(e) => { setCommEditValue(e.target.value); handleSaveCommEdit(c.id, 'closer', e.target.value) }}
                                  onBlur={() => setCommEditingCell(null)}
                                  className="border border-blue-400 rounded px-1 py-0.5 text-xs w-44 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none"
                                >
                                  <option value="">— None —</option>
                                  {CLOSERS.map(name => <option key={name} value={name}>{name}</option>)}
                                </select>
                              ) : (
                                <button
                                  onClick={() => { setCommEditingCell({ id: c.id, field: 'closer' }); setCommEditValue(c.closer || '') }}
                                  className="text-left hover:text-blue-600 dark:hover:text-blue-400 group/edit w-full"
                                >
                                  {c.closer || <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                                  <span className="opacity-0 group-hover/edit:opacity-100 ml-1 text-[10px] text-blue-400">&#9998;</span>
                                </button>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-right">{c.closer_commission != null ? fmtCurrency(Number(c.closer_commission)) : '—'}</TableCell>
                            <TableCell className="text-xs">
                              <StatusDropdown commissionId={c.id} field="closer_commission_status" currentStatus={c.closer_commission_status || 'N/A'} />
                            </TableCell>
                            <TableCell className="text-xs">
                              {commEditingCell?.id === c.id && commEditingCell?.field === 'setter' ? (
                                <select
                                  autoFocus
                                  value={commEditValue}
                                  onChange={(e) => { setCommEditValue(e.target.value); handleSaveCommEdit(c.id, 'setter', e.target.value) }}
                                  onBlur={() => setCommEditingCell(null)}
                                  className="border border-blue-400 rounded px-1 py-0.5 text-xs w-44 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none"
                                >
                                  <option value="">— None —</option>
                                  {SETTERS.map(name => <option key={name} value={name}>{name}</option>)}
                                </select>
                              ) : (
                                <button
                                  onClick={() => { setCommEditingCell({ id: c.id, field: 'setter' }); setCommEditValue(c.setter || '') }}
                                  className="text-left hover:text-blue-600 dark:hover:text-blue-400 group/edit w-full"
                                >
                                  {c.setter || <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                                  <span className="opacity-0 group-hover/edit:opacity-100 ml-1 text-[10px] text-blue-400">&#9998;</span>
                                </button>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-right">{c.setter_commission != null ? fmtCurrency(Number(c.setter_commission)) : '—'}</TableCell>
                            <TableCell className="text-xs">
                              <StatusDropdown commissionId={c.id} field="setter_commission_status" currentStatus={c.setter_commission_status || 'N/A'} />
                            </TableCell>
                            <TableCell className="text-xs text-right font-semibold">{fmtCurrency(Number(c.net_total))}</TableCell>
                          </AnimatedTableRow>
                        )
                      })}
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
              <div className="flex items-center gap-2">
                {[2025, 2026].map(y => (
                  <button
                    key={y}
                    onClick={() => handlePlYearChange(y)}
                    className={cn(
                      'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                      plYear === y
                        ? 'bg-[#185FA5] text-white'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    )}
                  >
                    {y}
                  </button>
                ))}
              </div>
              <button
                onClick={exportCSV}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                <Download className="h-4 w-4" /> Export CSV
              </button>
            </div>

            {/* P&L Vertical Table */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    {/* Header: Metric | Jan | Feb | ... | Dec | TOTAL */}
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-700">
                        <th className="sticky left-0 z-20 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-600 dark:text-zinc-400 px-4 py-3 text-left min-w-[200px] border-r border-zinc-200 dark:border-zinc-700">
                          Metric
                        </th>
                        {MONTHS.map((m, i) => (
                          <th key={m} className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 px-3 py-3 text-right min-w-[100px] whitespace-nowrap">
                            {m}
                          </th>
                        ))}
                        <th className="text-xs font-bold text-zinc-800 dark:text-zinc-200 px-3 py-3 text-right min-w-[110px] border-l border-zinc-200 dark:border-zinc-700">
                          TOTAL
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* ─── INCOME SECTION ─── */}
                      <tr>
                        <td colSpan={14} className="bg-blue-50 dark:bg-blue-950/30 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 border-b border-blue-200 dark:border-blue-800">
                          Income
                        </td>
                      </tr>
                      {/* Sales Forecast */}
                      <tr className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20">
                        <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 px-4 py-0 text-sm text-zinc-700 dark:text-zinc-300 pl-8 border-r border-zinc-100 dark:border-zinc-800">Sales Forecast</td>
                        {MONTH_KEYS.map(mk => <PLCell key={mk} mk={mk} field="sales_forecast" />)}
                        <TotalTd value={plTotal('sales_forecast')} />
                      </tr>
                      {/* Sales Actual */}
                      <tr className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20">
                        <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 px-4 py-0 text-sm text-zinc-700 dark:text-zinc-300 pl-8 border-r border-zinc-100 dark:border-zinc-800">Sales Actual</td>
                        {MONTH_KEYS.map(mk => (
                          plYear >= 2026
                            ? <AutoCell key={mk} value={plVal(mk, 'sales_actual')} />
                            : <PLCell key={mk} mk={mk} field="sales_actual" />
                        ))}
                        <TotalTd value={plTotal('sales_actual')} bold />
                      </tr>
                      {/* Sales % */}
                      <tr className="border-b border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20">
                        <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 px-4 py-0 text-sm text-zinc-500 dark:text-zinc-400 pl-8 border-r border-zinc-100 dark:border-zinc-800">Sales %</td>
                        {MONTH_KEYS.map(mk => <PctTd key={mk} actual={plVal(mk, 'sales_actual')} forecast={plVal(mk, 'sales_forecast')} />)}
                        <td className="px-3 py-2 text-right border-l border-zinc-200 dark:border-zinc-700">
                          {(() => { const f = plTotal('sales_forecast'); return f > 0 ? <span className={cn('text-xs font-semibold', pctColor(plTotal('sales_actual')/f*100).replace(/bg-\S+\s?/g, ''))}>{fmtPct(plTotal('sales_actual')/f*100)}</span> : <span className="text-xs text-zinc-400">—</span> })()}
                        </td>
                      </tr>

                      {/* ─── EXPENSES SECTION ─── */}
                      <tr>
                        <td colSpan={14} className="bg-orange-50 dark:bg-orange-950/30 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-orange-700 dark:text-orange-400 border-b border-orange-200 dark:border-orange-800">
                          Expenses
                        </td>
                      </tr>
                      {EXPENSE_ROWS.map((row, ri) => (
                        <tr key={row.key} className={cn('border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20', ri % 2 === 1 && 'bg-zinc-50/30 dark:bg-zinc-900/10')}>
                          <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 px-4 py-0 text-sm text-zinc-700 dark:text-zinc-300 pl-8 border-r border-zinc-100 dark:border-zinc-800">{row.label}</td>
                          {MONTH_KEYS.map(mk => <PLCell key={mk} mk={mk} field={row.key} />)}
                          <TotalTd value={plTotal(row.key)} />
                        </tr>
                      ))}
                      {/* TOTAL EXPENSES (calculated) */}
                      <tr className="border-b border-zinc-200 dark:border-zinc-700 bg-orange-50/30 dark:bg-orange-950/10 font-semibold">
                        <td className="sticky left-0 z-10 bg-orange-50/50 dark:bg-orange-950/20 px-4 py-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200 pl-8 border-r border-zinc-100 dark:border-zinc-800">TOTAL EXPENSES</td>
                        {MONTH_KEYS.map(mk => {
                          const total = EXPENSE_ROWS.reduce((s, r) => s + plVal(mk, r.key), 0)
                          return <AutoCell key={mk} value={total} />
                        })}
                        <TotalTd value={EXPENSE_ROWS.reduce((s, r) => s + plTotal(r.key), 0)} bold />
                      </tr>

                      {/* ─── PROFITABILITY SECTION ─── */}
                      <tr>
                        <td colSpan={14} className="bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 border-b border-emerald-200 dark:border-emerald-800">
                          Profitability
                        </td>
                      </tr>
                      {/* GP Forecast */}
                      <tr className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20">
                        <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 px-4 py-0 text-sm text-zinc-700 dark:text-zinc-300 pl-8 border-r border-zinc-100 dark:border-zinc-800">Gross Profit Forecast</td>
                        {MONTH_KEYS.map(mk => <PLCell key={mk} mk={mk} field="gross_profit_forecast" />)}
                        <TotalTd value={plTotal('gross_profit_forecast')} />
                      </tr>
                      {/* GP Actual */}
                      <tr className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20 bg-zinc-50/30 dark:bg-zinc-900/10">
                        <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 px-4 py-0 text-sm text-zinc-700 dark:text-zinc-300 pl-8 border-r border-zinc-100 dark:border-zinc-800">Gross Profit</td>
                        {MONTH_KEYS.map(mk => <PLCell key={mk} mk={mk} field="gross_profit_actual" />)}
                        <TotalTd value={plTotal('gross_profit_actual')} bold />
                      </tr>
                      {/* GP % */}
                      <tr className="border-b border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20">
                        <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 px-4 py-0 text-sm text-zinc-500 dark:text-zinc-400 pl-8 border-r border-zinc-100 dark:border-zinc-800">Gross Profit %</td>
                        {MONTH_KEYS.map(mk => <PctTd key={mk} actual={plVal(mk, 'gross_profit_actual')} forecast={plVal(mk, 'gross_profit_forecast')} />)}
                        <td className="px-3 py-2 text-right border-l border-zinc-200 dark:border-zinc-700">
                          {(() => { const f = plTotal('gross_profit_forecast'); return f > 0 ? <span className={cn('text-xs font-semibold', pctColor(plTotal('gross_profit_actual')/f*100).replace(/bg-\S+\s?/g, ''))}>{fmtPct(plTotal('gross_profit_actual')/f*100)}</span> : <span className="text-xs text-zinc-400">—</span> })()}
                        </td>
                      </tr>
                      {/* NI Forecast */}
                      <tr className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20 bg-zinc-50/30 dark:bg-zinc-900/10">
                        <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 px-4 py-0 text-sm text-zinc-700 dark:text-zinc-300 pl-8 border-r border-zinc-100 dark:border-zinc-800">Net Income Forecast</td>
                        {MONTH_KEYS.map(mk => <PLCell key={mk} mk={mk} field="net_income_forecast" />)}
                        <TotalTd value={plTotal('net_income_forecast')} />
                      </tr>
                      {/* NI Actual */}
                      <tr className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20">
                        <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 px-4 py-0 text-sm text-zinc-700 dark:text-zinc-300 pl-8 border-r border-zinc-100 dark:border-zinc-800">Net Income</td>
                        {MONTH_KEYS.map(mk => <PLCell key={mk} mk={mk} field="net_income_actual" />)}
                        <TotalTd value={plTotal('net_income_actual')} bold />
                      </tr>
                      {/* NI % */}
                      <tr className="border-b border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20 bg-zinc-50/30 dark:bg-zinc-900/10">
                        <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 px-4 py-0 text-sm text-zinc-500 dark:text-zinc-400 pl-8 border-r border-zinc-100 dark:border-zinc-800">Net Income %</td>
                        {MONTH_KEYS.map(mk => <PctTd key={mk} actual={plVal(mk, 'net_income_actual')} forecast={plVal(mk, 'net_income_forecast')} />)}
                        <td className="px-3 py-2 text-right border-l border-zinc-200 dark:border-zinc-700">
                          {(() => { const f = plTotal('net_income_forecast'); return f > 0 ? <span className={cn('text-xs font-semibold', pctColor(plTotal('net_income_actual')/f*100).replace(/bg-\S+\s?/g, ''))}>{fmtPct(plTotal('net_income_actual')/f*100)}</span> : <span className="text-xs text-zinc-400">—</span> })()}
                        </td>
                      </tr>

                      {Object.keys(plData).length === 0 && (
                        <tr><td colSpan={14} className="text-center py-12 text-sm text-zinc-400">No data for {plYear}. Click a year button to create months.</td></tr>
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
