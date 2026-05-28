'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Play, ExternalLink, FileText, Clock, CheckCircle2, XCircle, Users, Share2, Copy, Check } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { KPICard } from '@/components/shared/KPICard'

export const dynamic = 'force-dynamic'

interface Application {
  id: string
  position: string
  full_name: string
  email: string
  country_timezone: string | null
  phone: string | null
  how_heard: string | null
  english_level: string | null
  has_experience: string | null
  past_experience: string | null
  crm_tools: string | null
  hours_per_day: string | null
  availability: string | null
  available_immediately: string | null
  why_hic: string | null
  great_setter: string | null
  communication_style: string | null
  biggest_strength: string | null
  five_year_vision: string | null
  confirmed_job_description: boolean
  confirmed_remote: boolean
  additional_comments: string | null
  video_url: string | null
  status: string
  notes: string | null
  created_at: string
  // Closer-specific fields
  past_sales_performance: string | null
  best_month_cash_collected: number | null
  sales_methodologies: string | null
  objection_handling: string | null
  closing_superpower: string | null
  crm_tools_proficient: string | null
}

type PositionFilter = 'all' | 'dm_setter' | 'closer'

type StatusFilter = 'all' | 'pending' | 'reviewing' | 'approved' | 'rejected'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  reviewing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
}

const AVATAR_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  reviewing: 'bg-blue-100 text-blue-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function CareersAdminPage() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('all')
  const [search, setSearch] = useState('')
  const [selectedApp, setSelectedApp] = useState<Application | null>(null)
  const [showShareModal, setShowShareModal] = useState(false)

  const fetchApplications = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (positionFilter !== 'all') params.set('position', positionFilter)
    if (search) params.set('search', search)

    const res = await fetch(`/api/careers/applications?${params}`)
    if (res.ok) {
      const data = await res.json()
      setApplications(data)
    }
    setLoading(false)
  }, [statusFilter, positionFilter, search])

  useEffect(() => {
    fetchApplications()
  }, [fetchApplications])

  const kpis = useMemo(() => {
    const total = applications.length
    const pending = applications.filter(a => a.status === 'pending').length
    const approved = applications.filter(a => a.status === 'approved').length
    const rejected = applications.filter(a => a.status === 'rejected').length
    return { total, pending, approved, rejected }
  }, [applications])

  // When statusFilter changes, re-count from all data. But KPIs should show totals.
  // We fetch filtered data from API, so KPIs reflect current filter.
  // Let's fetch all for KPIs and filter client-side instead.

  return (
    <div className="p-4 md:p-8 max-w-screen-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Job Applications</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Review and manage incoming applications</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => setShowShareModal(true)}>
          <Share2 className="h-4 w-4" />
          Share Forms
        </Button>
      </div>

      {/* KPI Cards */}
      <motion.div
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
      >
        <KPICard title="Total Applications" value={kpis.total} icon={<Users className="h-4 w-4" />} loading={loading} />
        <KPICard title="Pending Review" value={kpis.pending} icon={<Clock className="h-4 w-4" />} loading={loading} />
        <KPICard title="Approved" value={kpis.approved} icon={<CheckCircle2 className="h-4 w-4" />} loading={loading} />
        <KPICard title="Rejected" value={kpis.rejected} icon={<XCircle className="h-4 w-4" />} loading={loading} />
      </motion.div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
        {/* Status tabs */}
        <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl p-1">
          {(['all', 'pending', 'reviewing', 'approved', 'rejected'] as StatusFilter[]).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                statusFilter === s
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Position tabs */}
        <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl p-1">
          {([['all', 'All Positions'], ['dm_setter', 'DM Setter'], ['closer', 'Closer']] as [PositionFilter, string][]).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setPositionFilter(value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                positionFilter === value
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
      </div>

      {/* Applications Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-zinc-200 dark:bg-zinc-700" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-700 rounded" />
                    <div className="h-3 w-40 bg-zinc-200 dark:bg-zinc-700 rounded" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : applications.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="h-10 w-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No applications found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {applications.map(app => (
            <motion.div
              key={app.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedApp(app)}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className={`text-xs font-semibold ${AVATAR_COLORS[app.status] || AVATAR_COLORS.pending}`}>
                        {getInitials(app.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{app.full_name}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{app.email}</p>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1.5">
                    {app.country_timezone && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{app.country_timezone}</p>
                    )}
                    {app.phone && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{app.phone}</p>
                    )}
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">Applied {formatDate(app.created_at)}</p>
                  </div>

                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <Badge className={`text-[10px] px-2 py-0.5 capitalize ${STATUS_COLORS[app.status] || STATUS_COLORS.pending}`}>
                      {app.status}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                      {app.position === 'closer' ? 'Closer' : 'DM Setter'}
                    </Badge>
                    {app.english_level && (
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                        {app.english_level}
                      </Badge>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-4 w-full text-xs"
                    onClick={e => { e.stopPropagation(); setSelectedApp(app) }}
                  >
                    View Profile
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Share Forms Modal */}
      <AnimatePresence>
        {showShareModal && (
          <ShareFormsModal onClose={() => setShowShareModal(false)} />
        )}
      </AnimatePresence>

      {/* Profile Modal */}
      <AnimatePresence>
        {selectedApp && (
          <ApplicationModal
            app={selectedApp}
            onClose={() => setSelectedApp(null)}
            onUpdate={(updated) => {
              setApplications(prev => prev.map(a => a.id === updated.id ? updated : a))
              setSelectedApp(updated)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Profile Modal ───────────────────────────────────────────── */

function ApplicationModal({
  app,
  onClose,
  onUpdate,
}: {
  app: Application
  onClose: () => void
  onUpdate: (app: Application) => void
}) {
  const [status, setStatus] = useState(app.status)
  const [notes, setNotes] = useState(app.notes || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setStatus(app.status)
    setNotes(app.notes || '')
  }, [app])

  async function handleSave() {
    setSaving(true)
    const res = await fetch(`/api/careers/applications/${app.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, notes }),
    })
    if (res.ok) {
      const updated = await res.json()
      onUpdate(updated)
    }
    setSaving(false)
  }

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-8 px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className={`text-xs font-semibold ${AVATAR_COLORS[app.status] || AVATAR_COLORS.pending}`}>
                {getInitials(app.full_name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{app.full_name}</h2>
              <p className="text-xs text-zinc-500">{app.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <X className="h-5 w-5 text-zinc-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Video */}
          {app.video_url && <VideoEmbed url={app.video_url} />}

          {/* Two columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Personal Info */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Personal Info</h3>
              <InfoRow label="Full Name" value={app.full_name} />
              <InfoRow label="Email" value={app.email} />
              <InfoRow label="Phone" value={app.phone} />
              <InfoRow label="Country / Timezone" value={app.country_timezone} />
              <InfoRow label="How they heard" value={app.how_heard} />
              <InfoRow label="Applied" value={formatDate(app.created_at)} />
            </div>

            {/* Right: Role Fit */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Role Fit</h3>
              <InfoRow label="English Level" value={app.english_level} />
              <InfoRow label="Has Experience" value={app.has_experience} />
              <InfoRow label="Hours / Day" value={app.hours_per_day} />
              <InfoRow label="Availability" value={app.availability} />
              <InfoRow label="Start Immediately" value={app.available_immediately} />
            </div>
          </div>

          {/* Full width sections */}
          <TextSection title="Past Experience" content={app.past_experience} />
          <TextSection title="CRM Tools Used" content={app.crm_tools} />
          <TextSection title="Why HIC Parenting" content={app.why_hic} />
          <TextSection title="What Makes a Great Setter" content={app.great_setter} />
          <TextSection title="Communication Style" content={app.communication_style} />
          <TextSection title="Biggest Strength" content={app.biggest_strength} />
          <TextSection title="2-Year Vision" content={app.five_year_vision} />

          {/* Closer-specific sections */}
          {app.position === 'closer' && (
            <>
              <TextSection title="Past Sales Performance" content={app.past_sales_performance} />
              {app.best_month_cash_collected != null && (
                <div>
                  <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">Best Month Cash Collected</h3>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">${Number(app.best_month_cash_collected).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</p>
                </div>
              )}
              <TextSection title="Sales Methodologies" content={app.sales_methodologies} />
              <TextSection title="Objection Handling Response" content={app.objection_handling} />
              <TextSection title="Closing Superpower" content={app.closing_superpower} />
              <TextSection title="CRM Tools Proficient" content={app.crm_tools_proficient} />
            </>
          )}

          <TextSection title="Additional Comments" content={app.additional_comments} />
        </div>

        {/* Admin actions */}
        <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 space-y-4 bg-zinc-50 dark:bg-zinc-800/50">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <option value="pending">Pending</option>
                <option value="reviewing">Reviewing</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Internal Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              placeholder="Add internal notes about this applicant..."
            />
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full md:w-auto">
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ─── Share Forms Modal ───────────────────────────────────────── */

const FORM_LINKS = [
  { label: 'DM Setter Application', url: 'https://dashboard.hicparenting.com/careers/dm-setter' },
  { label: 'Closer Application', url: 'https://dashboard.hicparenting.com/careers/closer' },
]

function ShareFormsModal({ onClose }: { onClose: () => void }) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  async function handleCopy(url: string, idx: number) {
    await navigator.clipboard.writeText(url)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Share Application Forms</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <X className="h-5 w-5 text-zinc-500" />
          </button>
        </div>

        <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FORM_LINKS.map((form, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 space-y-3"
            >
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{form.label}</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 break-all leading-relaxed">{form.url}</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 gap-1.5 text-xs"
                  onClick={() => handleCopy(form.url, idx)}
                >
                  {copiedIdx === idx ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </>
                  )}
                </Button>
                <a
                  href={form.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1"
                >
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-1.5 text-xs"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open
                  </Button>
                </a>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ─── Video Embed ─────────────────────────────────────────────── */

function VideoEmbed({ url }: { url: string }) {
  if (url.includes('loom.com')) {
    const match = url.match(/(?:loom\.com\/share\/|loom\.com\/embed\/)([a-zA-Z0-9]+)/)
    const id = match?.[1]
    if (id) {
      return (
        <div className="aspect-video rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800">
          <iframe src={`https://www.loom.com/embed/${id}`} allowFullScreen className="w-full h-full" />
        </div>
      )
    }
  }

  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    let videoId = ''
    if (url.includes('youtu.be/')) {
      videoId = url.split('youtu.be/')[1]?.split(/[?&#]/)[0] || ''
    } else {
      const match = url.match(/[?&]v=([^&#]+)/)
      videoId = match?.[1] || ''
    }
    if (videoId) {
      return (
        <div className="aspect-video rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            allowFullScreen
            className="w-full h-full"
          />
        </div>
      )
    }
  }

  if (url.includes('drive.google.com')) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
      >
        <Play className="h-5 w-5 text-blue-600" />
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Open Video in Google Drive</span>
        <ExternalLink className="h-4 w-4 text-zinc-400 ml-auto" />
      </a>
    )
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
    >
      <ExternalLink className="h-5 w-5 text-blue-600" />
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Open Video Link</span>
    </a>
  )
}

/* ─── Helpers ─────────────────────────────────────────────────── */

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{label}</p>
      <p className="text-sm text-zinc-800 dark:text-zinc-200">{value}</p>
    </div>
  )
}

function TextSection({ title, content }: { title: string; content: string | null | undefined }) {
  if (!content) return null
  return (
    <div>
      <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">{title}</h3>
      <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">{content}</p>
    </div>
  )
}
