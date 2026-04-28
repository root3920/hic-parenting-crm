'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/PageHeader'
import { PageTransition } from '@/components/motion/PageTransition'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Search, ChevronLeft, ChevronRight, Eye, Copy, Check, Trash2, Pencil,
  ClipboardList, CheckCircle, XCircle, AlertTriangle,
} from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

type QualFilter = 'all' | 'qualified' | 'disqualified'
type Preset = '7d' | '30d' | 'todo'

interface SurveyResponse {
  id: string
  name: string
  email: string
  phone: string | null
  country: string | null
  q4_source: string | null
  q5_children_struggle: string | null
  q6_why_now: string | null
  q7_investment: string | null
  q7_qualified: boolean | null
  q8_spouse: string | null
  q8_qualified: boolean | null
  q9_situation: string | null
  q9_qualified: boolean | null
  is_qualified: boolean
  disqualifying_count: number
  setter: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  submitted_at: string
  created_at: string
}

// Country code to flag emoji
function countryFlag(country: string | null): string {
  if (!country) return ''
  // If it looks like a 2-letter code, convert to flag emoji
  if (country.length === 2) {
    const upper = country.toUpperCase()
    return String.fromCodePoint(0x1F1E6 + upper.charCodeAt(0) - 65, 0x1F1E6 + upper.charCodeAt(1) - 65)
  }
  return ''
}

function getDateRange(preset: Preset) {
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  if (preset === '7d') {
    const from = new Date(today); from.setDate(today.getDate() - 6)
    return { from: fmt(from), to: fmt(today) }
  }
  if (preset === '30d') {
    const from = new Date(today); from.setDate(today.getDate() - 29)
    return { from: fmt(from), to: fmt(today) }
  }
  return { from: '2020-01-01', to: fmt(today) }
}

function QualBadge({ qualified }: { qualified: boolean }) {
  return qualified ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300">
      <CheckCircle className="h-3 w-3" /> Qualified
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300">
      <XCircle className="h-3 w-3" /> Disqualified
    </span>
  )
}

function SurveyDetail({ survey, onClose }: { survey: SurveyResponse; onClose: () => void }) {
  function Row({ label, value, badge }: { label: string; value: string | null | undefined; badge?: React.ReactNode }) {
    if (!value) return null
    return (
      <div className="flex items-start gap-2 py-1.5 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
        <span className="text-xs text-zinc-400 w-44 shrink-0">{label}</span>
        <div className="flex-1">
          <span className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">{value}</span>
          {badge && <span className="ml-2">{badge}</span>}
        </div>
      </div>
    )
  }

  function QualTag({ qualified }: { qualified: boolean | null }) {
    if (qualified === null) return null
    return qualified
      ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">Qualified</span>
      : <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">DQ</span>
  }

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-6">
      <DialogHeader>
        <DialogTitle className="text-base flex items-center gap-2">
          {survey.name}
          <QualBadge qualified={survey.is_qualified} />
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4 mt-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-blue-600 mb-2">Contact</p>
          <Row label="Name" value={survey.name} />
          <Row label="Email" value={survey.email} />
          <Row label="Phone" value={survey.phone ? `${countryFlag(survey.country)} ${survey.phone}` : null} />
          <Row label="Country" value={survey.country} />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-green-600 mb-2">Responses</p>
          <Row label="Q4: Source" value={survey.q4_source} />
          <Row label="Q5: Children & Struggle" value={survey.q5_children_struggle} />
          <Row label="Q6: Why now" value={survey.q6_why_now} />
          <Row label="Q7: Investment" value={survey.q7_investment} badge={<QualTag qualified={survey.q7_qualified} />} />
          <Row label="Q8: Spouse" value={survey.q8_spouse} badge={<QualTag qualified={survey.q8_qualified} />} />
          <Row label="Q9: Situation" value={survey.q9_situation} badge={<QualTag qualified={survey.q9_qualified} />} />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">Meta</p>
          <Row label="Setter" value={survey.setter} />
          <Row label="UTM Source" value={survey.utm_source} />
          <Row label="UTM Medium" value={survey.utm_medium} />
          <Row label="UTM Campaign" value={survey.utm_campaign} />
          <Row label="Submitted" value={new Date(survey.submitted_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })} />
          <Row label="DQ Count" value={String(survey.disqualifying_count)} />
        </div>
      </div>
    </DialogContent>
  )
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default function SurveysPage() {
  const supabase = useMemo(() => createClient(), [])
  const [surveys, setSurveys] = useState<SurveyResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState<Preset>('30d')
  const [qualFilter, setQualFilter] = useState<QualFilter>('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(0)
  const [detail, setDetail] = useState<SurveyResponse | null>(null)
  const [editingSetterId, setEditingSetterId] = useState<string | null>(null)
  const [editingSetterValue, setEditingSetterValue] = useState('')

  // Copy link
  const [linkCalendar, setLinkCalendar] = useState('')
  const [copied, setCopied] = useState(false)

  const CALENDAR_OPTIONS = [
    'Free Coaching Session', 'VCT', 'VCT_MT', 'Interview', 'Use Class',
    'Spanish', 'Stop Reaction', 'Marcela', 'Jessica', 'Valentina',
  ]

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const { from: fromDate, to: toDate } = useMemo(() => getDateRange(preset), [preset])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const BATCH = 1000
    let all: SurveyResponse[] = []
    let from = 0
    while (true) {
      const { data } = await supabase
        .from('survey_responses')
        .select('*')
        .gte('submitted_at', fromDate)
        .lte('submitted_at', toDate + 'T23:59:59')
        .order('submitted_at', { ascending: false })
        .range(from, from + BATCH - 1)
      if (!data || data.length === 0) break
      all = all.concat(data as SurveyResponse[])
      if (data.length < BATCH) break
      from += BATCH
    }
    setSurveys(all)
    setLoading(false)
  }, [supabase, fromDate, toDate])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setPage(0) }, [preset, qualFilter, debouncedSearch])

  // KPIs
  const kpis = useMemo(() => {
    const total = surveys.length
    const qualified = surveys.filter(s => s.is_qualified).length
    const disqualified = total - qualified
    const qualRate = total > 0 ? (qualified / total) * 100 : 0
    const dqRate = total > 0 ? (disqualified / total) * 100 : 0

    // Most common DQ reason
    const dqReasons: Record<string, number> = {}
    for (const s of surveys) {
      if (s.q7_qualified === false) dqReasons['Q7: Investment'] = (dqReasons['Q7: Investment'] ?? 0) + 1
      if (s.q8_qualified === false) dqReasons['Q8: Spouse'] = (dqReasons['Q8: Spouse'] ?? 0) + 1
      if (s.q9_qualified === false) dqReasons['Q9: Situation'] = (dqReasons['Q9: Situation'] ?? 0) + 1
    }
    const topDQ = Object.entries(dqReasons).sort((a, b) => b[1] - a[1])[0]

    return { total, qualified, disqualified, qualRate, dqRate, topDQ }
  }, [surveys])

  // ── Analytics ──
  const analytics = useMemo(() => {
    // Q7 breakdown
    const q7Labels = [
      { key: 'canInvest', match: 'I can invest', qual: true },
      { key: 'partnerDecides', match: 'partner is the financial', qual: false },
      { key: 'cantPay', match: "can't pay", qual: false },
    ]
    const q7Stats = q7Labels.map(({ key, match, qual }) => {
      const count = surveys.filter(s => s.q7_investment?.toLowerCase().includes(match.toLowerCase())).length
      return { key, label: match === 'I can invest' ? 'Can invest in coaching' : match === 'partner is the financial' ? 'Partner decides finances' : "Can't pay for coaching", count, qual }
    })

    // Q8 breakdown
    const q8Labels = [
      { label: 'Single parent / sole decision-maker', match: 'single parent', qual: true },
      { label: 'Both can join Google Meet', match: 'both join', qual: true },
      { label: 'Spouse can\'t attend', match: 'no way possible', qual: false },
    ]
    const q8Stats = q8Labels.map(({ label, match, qual }) => ({
      label, qual,
      count: surveys.filter(s => s.q8_spouse?.toLowerCase().includes(match.toLowerCase())).length,
    }))

    // Q9 breakdown
    const q9Labels = [
      { label: 'Single stay-at-home', match: 'single stay-at-home', qual: false },
      { label: 'Married stay-at-home', match: 'married stay-at-home', qual: true },
      { label: 'Work from home + caregiver', match: 'work from home', qual: true },
      { label: 'Single working parent', match: 'single working parent', qual: true },
      { label: 'Married working parent', match: 'married working parent', qual: true },
      { label: 'Both stay-at-home, no jobs', match: 'no jobs outside', qual: false },
    ]
    const q9Stats = q9Labels.map(({ label, match, qual }) => ({
      label, qual,
      count: surveys.filter(s => s.q9_situation?.toLowerCase().includes(match.toLowerCase())).length,
    }))

    // Submissions over time (by day)
    const byDateMap: Record<string, { date: string; total: number; qualified: number; disqualified: number }> = {}
    for (const s of surveys) {
      const day = s.submitted_at.split('T')[0]
      if (!byDateMap[day]) byDateMap[day] = { date: formatDate(day), total: 0, qualified: 0, disqualified: 0 }
      byDateMap[day].total++
      if (s.is_qualified) byDateMap[day].qualified++
      else byDateMap[day].disqualified++
    }
    const timelineData = Object.values(byDateMap).reverse()

    // By source (Q4) — top 8
    const sourceMap: Record<string, { total: number; qualified: number }> = {}
    for (const s of surveys) {
      const src = (s.q4_source ?? '').trim()
      if (!src) continue
      const key = src.length > 20 ? src.slice(0, 20) + '…' : src
      if (!sourceMap[key]) sourceMap[key] = { total: 0, qualified: 0 }
      sourceMap[key].total++
      if (s.is_qualified) sourceMap[key].qualified++
    }
    const sourceData = Object.entries(sourceMap)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 8)
      .map(([name, { total, qualified }]) => ({
        name, qualified, disqualified: total - qualified,
        pct: total > 0 ? Math.round((qualified / total) * 100) : 0,
      }))

    // DQ reasons distribution (for pie chart)
    const dqPieMap: Record<string, number> = {}
    for (const s of surveys) {
      if (s.is_qualified) continue
      if (s.q7_qualified === false && s.q7_investment?.includes("partner")) dqPieMap['Partner decides'] = (dqPieMap['Partner decides'] ?? 0) + 1
      else if (s.q7_qualified === false) dqPieMap["Can't invest"] = (dqPieMap["Can't invest"] ?? 0) + 1
      if (s.q8_qualified === false) dqPieMap["Spouse can't attend"] = (dqPieMap["Spouse can't attend"] ?? 0) + 1
      if (s.q9_qualified === false && s.q9_situation?.toLowerCase().includes('single stay')) dqPieMap['Single stay-at-home'] = (dqPieMap['Single stay-at-home'] ?? 0) + 1
      else if (s.q9_qualified === false) dqPieMap['Both stay-at-home'] = (dqPieMap['Both stay-at-home'] ?? 0) + 1
    }
    const dqPieData = Object.entries(dqPieMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)

    // By setter
    const setterMap: Record<string, { total: number; qualified: number; dqSum: number }> = {}
    for (const s of surveys) {
      const key = s.setter ?? 'Direct / Unknown'
      if (!setterMap[key]) setterMap[key] = { total: 0, qualified: 0, dqSum: 0 }
      setterMap[key].total++
      if (s.is_qualified) setterMap[key].qualified++
      setterMap[key].dqSum += s.disqualifying_count
    }
    const setterData = Object.entries(setterMap)
      .map(([setter, { total, qualified, dqSum }]) => ({
        setter, total, qualified, disqualified: total - qualified,
        qualPct: total > 0 ? Math.round((qualified / total) * 100) : 0,
        avgDq: total > 0 ? (dqSum / total).toFixed(1) : '0',
      }))
      .sort((a, b) => b.total - a.total)

    // Top sources list (top 10)
    const topSources = Object.entries(sourceMap)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10)
      .map(([name, { total, qualified }]) => ({
        name, total,
        qualPct: total > 0 ? Math.round((qualified / total) * 100) : 0,
      }))

    return { q7Stats, q8Stats, q9Stats, timelineData, sourceData, dqPieData, setterData, topSources }
  }, [surveys])

  const DQ_PIE_COLORS = ['#DC2626', '#EF4444', '#F87171', '#FCA5A5', '#FECACA', '#FEE2E2']

  // Filtered data
  const filtered = useMemo(() => {
    let data = surveys
    if (qualFilter === 'qualified') data = data.filter(s => s.is_qualified)
    if (qualFilter === 'disqualified') data = data.filter(s => !s.is_qualified)
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      data = data.filter(s => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))
    }
    return data
  }, [surveys, qualFilter, debouncedSearch])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  async function handleSetterSave(id: string) {
    const val = editingSetterValue.trim() || null
    setSurveys(prev => prev.map(s => s.id === id ? { ...s, setter: val } : s))
    setEditingSetterId(null)
    const { error } = await supabase.from('survey_responses').update({ setter: val }).eq('id', id)
    if (error) { toast.error('Error updating setter'); return }
    toast.success('Setter updated')
  }

  async function handleDeleteSurvey(id: string) {
    if (!confirm('Are you sure you want to delete this submission? This action cannot be undone.')) return
    setSurveys(prev => prev.filter(s => s.id !== id))
    if (detail?.id === id) setDetail(null)
    try {
      const res = await fetch('/api/surveys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error('Delete failed: ' + (data.error ?? 'Unknown error'))
        fetchData()
        return
      }
      toast.success('Submission deleted')
    } catch {
      toast.error('Delete failed')
      fetchData()
    }
  }

  function copyLink() {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://dashboard.hicparenting.com'
    const url = linkCalendar ? `${base}/apply?calendarName=${encodeURIComponent(linkCalendar)}` : `${base}/apply`
    navigator.clipboard.writeText(url)
    setCopied(true)
    toast.success('Link copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto">
        <PageHeader title="Surveys" description="Application form submissions">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden">
              {(['7d', '30d', 'todo'] as Preset[]).map((p) => (
                <button
                  key={p}
                  onClick={() => { setPreset(p); setPage(0) }}
                  className={cn(
                    'px-2.5 py-1.5 text-xs font-medium transition-colors',
                    preset === p ? 'bg-[#185FA5] text-white' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                  )}
                >
                  {p === 'todo' ? 'All' : p}
                </button>
              ))}
            </div>

            <select
              value={qualFilter}
              onChange={(e) => { setQualFilter(e.target.value as QualFilter); setPage(0) }}
              className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            >
              <option value="all">All</option>
              <option value="qualified">Qualified</option>
              <option value="disqualified">Disqualified</option>
            </select>

            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or email..."
                className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md pl-7 pr-3 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 w-48"
              />
            </div>
          </div>
        </PageHeader>

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-24 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-xl" />)}
            </div>
            <div className="h-64 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-xl" />
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ClipboardList className="h-4 w-4 text-blue-500" />
                </div>
                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{kpis.total}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Total Applications</p>
              </div>
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                </div>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{kpis.qualified}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Qualified ({kpis.qualRate.toFixed(0)}%)</p>
              </div>
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                </div>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{kpis.disqualified}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Disqualified ({kpis.dqRate.toFixed(0)}%)</p>
              </div>
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                </div>
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-1">
                  {kpis.topDQ ? `${kpis.topDQ[0]}` : '—'}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Top DQ Reason{kpis.topDQ ? ` (${kpis.topDQ[1]}x)` : ''}
                </p>
              </div>
            </div>

            {/* ── ROW 1: Qualification Breakdown Cards ── */}
            {surveys.length > 0 && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  {/* Q7 — Investment */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">Q7 — Investment Readiness</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2.5">
                      {analytics.q7Stats.map(({ label, count, qual }) => {
                        const p = kpis.total > 0 ? (count / kpis.total) * 100 : 0
                        return (
                          <div key={label}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-zinc-600 dark:text-zinc-400">
                                <span className={qual ? 'text-green-600' : 'text-red-500'}>{qual ? '✓' : '✗'}</span>{' '}{label}
                              </span>
                              <span className="font-semibold text-zinc-700 dark:text-zinc-300">{count} ({p.toFixed(0)}%)</span>
                            </div>
                            <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full">
                              <div className={cn('h-full rounded-full transition-all', qual ? 'bg-green-500' : 'bg-red-400')} style={{ width: `${p}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </CardContent>
                  </Card>

                  {/* Q8 — Spouse */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">Q8 — Spouse Availability</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2.5">
                      {analytics.q8Stats.map(({ label, count, qual }) => {
                        const p = kpis.total > 0 ? (count / kpis.total) * 100 : 0
                        return (
                          <div key={label}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-zinc-600 dark:text-zinc-400">
                                <span className={qual ? 'text-green-600' : 'text-red-500'}>{qual ? '✓' : '✗'}</span>{' '}{label}
                              </span>
                              <span className="font-semibold text-zinc-700 dark:text-zinc-300">{count} ({p.toFixed(0)}%)</span>
                            </div>
                            <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full">
                              <div className={cn('h-full rounded-full transition-all', qual ? 'bg-green-500' : 'bg-red-400')} style={{ width: `${p}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </CardContent>
                  </Card>

                  {/* Q9 — Situation */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">Q9 — Life Situation</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {analytics.q9Stats.map(({ label, count, qual }) => {
                        const p = kpis.total > 0 ? (count / kpis.total) * 100 : 0
                        return (
                          <div key={label}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-zinc-600 dark:text-zinc-400">
                                <span className={qual ? 'text-green-600' : 'text-red-500'}>{qual ? '✓' : '✗'}</span>{' '}{label}
                              </span>
                              <span className="font-semibold text-zinc-700 dark:text-zinc-300">{count} ({p.toFixed(0)}%)</span>
                            </div>
                            <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full">
                              <div className={cn('h-full rounded-full transition-all', qual ? 'bg-green-500' : 'bg-red-400')} style={{ width: `${p}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </CardContent>
                  </Card>
                </div>

                {/* ── ROW 2: Applications Over Time ── */}
                {analytics.timelineData.length > 1 && (
                  <Card className="mb-6">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">Applications Over Time</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={analytics.timelineData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ fontSize: 11 }} />
                          <Legend formatter={(v) => <span className="text-xs capitalize">{v}</span>} />
                          <Line type="monotone" dataKey="total" stroke="#185FA5" strokeWidth={2} dot={{ r: 2 }} name="Total" />
                          <Line type="monotone" dataKey="qualified" stroke="#22C55E" strokeWidth={2} dot={{ r: 2 }} name="Qualified" />
                          <Line type="monotone" dataKey="disqualified" stroke="#EF4444" strokeWidth={2} dot={{ r: 2 }} name="Disqualified" />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* ── ROW 3: Source bar chart + DQ pie ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {analytics.sourceData.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold">Qualification Rate by Source (Q4)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={analytics.sourceData} margin={{ top: 16, right: 4, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#71717a' }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
                            <YAxis tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ fontSize: 11 }} />
                            <Legend formatter={(v) => <span className="text-xs">{v}</span>} />
                            <Bar dataKey="qualified" stackId="a" fill="#22C55E" name="Qualified" maxBarSize={32} />
                            <Bar dataKey="disqualified" stackId="a" fill="#EF4444" name="Disqualified" radius={[3, 3, 0, 0]} maxBarSize={32} />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}

                  {analytics.dqPieData.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold">DQ Reasons Distribution</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie
                              data={analytics.dqPieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={45}
                              outerRadius={75}
                              dataKey="value"
                              paddingAngle={2}
                            >
                              {analytics.dqPieData.map((_, i) => (
                                <Cell key={i} fill={DQ_PIE_COLORS[i % DQ_PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(v, name) => [`${v} submissions`, name]} contentStyle={{ fontSize: 11 }} />
                            <Legend formatter={(v) => <span className="text-xs">{v}</span>} iconType="circle" iconSize={8} />
                          </PieChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* ── ROW 4: Setter Performance Table ── */}
                {analytics.setterData.length > 0 && (
                  <Card className="mb-6">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">Performance by Setter / Calendar</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-zinc-200 dark:border-zinc-800">
                              {['Setter', 'Total', 'Qualified', 'Disqualified', 'Qual%', 'Avg DQs'].map(h => (
                                <th key={h} className="text-left py-2 px-3 font-semibold text-zinc-500 dark:text-zinc-400">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {analytics.setterData.map(s => (
                              <tr key={s.setter} className="border-b border-zinc-100 dark:border-zinc-800">
                                <td className="py-2 px-3 font-medium text-zinc-800 dark:text-zinc-200 whitespace-nowrap">{s.setter}</td>
                                <td className="py-2 px-3 text-zinc-600 dark:text-zinc-400">{s.total}</td>
                                <td className="py-2 px-3 text-green-600 dark:text-green-400 font-medium">{s.qualified}</td>
                                <td className="py-2 px-3 text-red-600 dark:text-red-400 font-medium">{s.disqualified}</td>
                                <td className="py-2 px-3">
                                  <span className={cn('inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold',
                                    s.qualPct >= 60 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                    : s.qualPct >= 40 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                  )}>
                                    {s.qualPct}%
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-zinc-600 dark:text-zinc-400">{s.avgDq}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* ── ROW 5: Top Traffic Sources ── */}
                {analytics.topSources.length > 0 && (
                  <Card className="mb-6">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">Top Traffic Sources</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {analytics.topSources.map((src, i) => (
                          <div key={src.name} className="flex items-center justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-zinc-400 w-5">{i + 1}.</span>
                              <span className="text-xs text-zinc-700 dark:text-zinc-300 font-medium">{src.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-zinc-500 dark:text-zinc-400">{src.total}</span>
                              <span className={cn('inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold',
                                src.qualPct >= 60 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                : src.qualPct >= 40 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                              )}>
                                {src.qualPct}% qual
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {/* Copy Link Section */}
            <div className="flex items-center gap-2 mb-6 flex-wrap">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Share link:</span>
              <select
                value={linkCalendar}
                onChange={(e) => setLinkCalendar(e.target.value)}
                className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              >
                <option value="">Default calendar</option>
                {CALENDAR_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button
                onClick={copyLink}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
              <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono truncate max-w-xs">
                /apply{linkCalendar ? `?calendarName=${encodeURIComponent(linkCalendar)}` : ''}
              </span>
              {linkCalendar && (
                <span className="text-xs text-blue-500 dark:text-blue-400">
                  &rarr; {linkCalendar}&apos;s Calendar
                </span>
              )}
            </div>

            {/* Table */}
            <Card className="mb-8">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">Submissions</CardTitle>
                <span className="text-xs text-zinc-400">{filtered.length} found</span>
              </CardHeader>
              <CardContent>
                {filtered.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-sm text-zinc-400 dark:text-zinc-500">No submissions found</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-zinc-200 dark:border-zinc-800">
                            {['Date', 'Name', 'Email', 'Phone', 'Setter', 'Result'].map(h => (
                              <th key={h} className="text-left py-2.5 px-3 font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{h}</th>
                            ))}
                            <th className="text-left py-2.5 px-3 font-semibold text-red-500 dark:text-red-400 whitespace-nowrap">DQs</th>
                            <th className="text-left py-2.5 px-3 font-semibold text-green-600 dark:text-green-400 whitespace-nowrap">Qs</th>
                            <th className="text-left py-2.5 px-3 font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {pageRows.map(s => (
                            <tr key={s.id} className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                              <td className="py-2.5 px-3 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{formatDate(s.submitted_at.split('T')[0])}</td>
                              <td className="py-2.5 px-3 font-medium text-zinc-800 dark:text-zinc-200 whitespace-nowrap">{s.name}</td>
                              <td className="py-2.5 px-3 text-zinc-500 dark:text-zinc-400 truncate max-w-[160px]">{s.email}</td>
                              <td className="py-2.5 px-3 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                                {s.phone ? `${countryFlag(s.country)} ${s.phone}` : '—'}
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                {editingSetterId === s.id ? (
                                  <input
                                    type="text"
                                    value={editingSetterValue}
                                    onChange={(e) => setEditingSetterValue(e.target.value)}
                                    onBlur={() => handleSetterSave(s.id)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSetterSave(s.id)
                                      if (e.key === 'Escape') setEditingSetterId(null)
                                    }}
                                    autoFocus
                                    className="text-xs border border-blue-400 dark:border-blue-500 rounded-md px-2 py-1 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 w-32"
                                  />
                                ) : (
                                  <button
                                    onClick={() => { setEditingSetterId(s.id); setEditingSetterValue(s.setter ?? '') }}
                                    className="group flex items-center gap-1 text-left rounded px-1 py-0.5 -mx-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-500 dark:text-zinc-400 cursor-pointer"
                                    title="Click to edit setter"
                                  >
                                    {s.setter ?? <span className="text-zinc-400">—</span>}
                                    <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity flex-shrink-0" />
                                  </button>
                                )}
                              </td>
                              <td className="py-2.5 px-3"><QualBadge qualified={s.is_qualified} /></td>
                              <td className="py-2.5 px-3">
                                {s.disqualifying_count > 0 ? (
                                  <span className="inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                                    {s.disqualifying_count}
                                  </span>
                                ) : (
                                  <span className="text-zinc-400">—</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                {(() => {
                                  const qCount = (s.q7_qualified === true ? 1 : 0) + (s.q8_qualified === true ? 1 : 0) + (s.q9_qualified === true ? 1 : 0)
                                  return qCount > 0 ? (
                                    <span className="inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                                      {qCount}
                                    </span>
                                  ) : (
                                    <span className="text-zinc-400">—</span>
                                  )
                                })()}
                              </td>
                              <td className="py-2.5 px-3">
                                <button
                                  onClick={() => setDetail(s)}
                                  className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                                  title="View details"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteSurvey(s.id)}
                                  className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                  title="Delete submission"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                        <span className="text-xs text-zinc-400">
                          {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                        </span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-1 rounded disabled:opacity-30 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <span className="text-xs text-zinc-500 px-1">{page + 1} / {totalPages}</span>
                          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1 rounded disabled:opacity-30 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Dialog open={!!detail} onOpenChange={(open) => { if (!open) setDetail(null) }}>
        {detail && <SurveyDetail survey={detail} onClose={() => setDetail(null)} />}
      </Dialog>
    </PageTransition>
  )
}
