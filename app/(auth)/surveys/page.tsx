'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/PageHeader'
import { PageTransition } from '@/components/motion/PageTransition'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Search, ChevronLeft, ChevronRight, Eye, Copy, Check,
  ClipboardList, CheckCircle, XCircle, AlertTriangle,
} from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import { toast } from 'sonner'

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
    const { data } = await supabase
      .from('survey_responses')
      .select('*')
      .gte('submitted_at', fromDate)
      .lte('submitted_at', toDate + 'T23:59:59')
      .order('submitted_at', { ascending: false })
    setSurveys((data ?? []) as SurveyResponse[])
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
                              <td className="py-2.5 px-3 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{s.setter ?? '—'}</td>
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
