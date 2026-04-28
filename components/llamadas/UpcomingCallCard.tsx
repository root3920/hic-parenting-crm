
'use client'

import { useState } from 'react'
import { Call } from '@/types'
import { Video, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { US_TIMEZONES, formatDateInTimezone, formatTimeInTimezone } from '@/lib/timezones'
import { useUserTimezone } from '@/hooks/useUserTimezone'

const STATUS_BORDER: Record<string, string> = {
  'Scheduled':   'border-l-blue-400',
  'Rescheduled': 'border-l-purple-400',
}

const STATUS_STYLES: Record<string, string> = {
  'Scheduled':   'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Rescheduled': 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
}

const CALL_TYPE_STYLES: Record<string, string> = {
  'Qualified':    'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300',
  'Disqualified': 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300',
  'Onboarding':   'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-300',
  'Interview':    'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300',
}

const CALL_TYPE_OPTIONS = ['Qualified', 'Disqualified', 'Onboarding', 'Interview'] as const

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(n => n[0]?.toUpperCase() ?? '').join('')
}

interface Props {
  call: Call
  onDetailClick: () => void
  onTypeChange?: (callId: string, newType: string) => void
}

export function UpcomingCallCard({ call, onDetailClick, onTypeChange }: Props) {
  const [expanded, setExpanded] = useState(false)
  const { timezone } = useUserTimezone()
  const tzAbbr = US_TIMEZONES.find(t => t.value === timezone)?.abbr ?? 'EST'

  return (
    <div
      className={cn(
        'bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 border-l-4 p-4 transition-shadow hover:shadow-md',
        STATUS_BORDER[call.status] ?? 'border-l-zinc-300'
      )}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xs font-bold text-blue-700 dark:text-blue-300 shrink-0">
            {initials(call.full_name)}
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">{call.full_name}</p>
            <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mt-0.5">
              {formatDateInTimezone(call.start_date, timezone)} · {formatTimeInTimezone(call.start_date, timezone)} {tzAbbr}
            </p>
          </div>
        </div>
        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0', STATUS_STYLES[call.status] ?? 'bg-zinc-100 text-zinc-600')}>
          {call.status}
        </span>
      </div>

      {/* Meta row */}
      <div className="mt-2.5 space-y-1 pl-12">
        {(call.closer_name || call.setter_name) && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {call.closer_name && <span>👤 Closer: <span className="font-medium text-zinc-700 dark:text-zinc-300">{call.closer_name}</span></span>}
            {call.closer_name && call.setter_name && <span className="mx-1.5">·</span>}
            {call.setter_name && <span>Setter: <span className="font-medium text-zinc-700 dark:text-zinc-300">{call.setter_name}</span></span>}
          </p>
        )}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">📱 Tipo:</span>
          <select
            value={call.call_type ?? ''}
            onChange={(e) => onTypeChange?.(call.id, e.target.value)}
            className={cn(
              'appearance-none inline-flex items-center pl-2 pr-5 py-0.5 rounded-full text-xs font-medium cursor-pointer border-0 outline-none transition-opacity hover:opacity-80 bg-[length:12px] bg-[right_4px_center] bg-no-repeat',
              call.call_type ? (CALL_TYPE_STYLES[call.call_type] ?? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400') : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500'
            )}
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")` }}
          >
            <option value="">— None</option>
            {CALL_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {call.activity_type && <span className="text-xs text-zinc-400">{call.activity_type}</span>}
        </div>
      </div>

      {/* Expand/detail row */}
      <div className="mt-3 pl-12 flex items-center gap-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? 'Ocultar detalles' : 'Ver detalles'}
        </button>
        {call.meeting_url && (
          <a
            href={call.meeting_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors"
          >
            <Video className="h-3.5 w-3.5" />
            Unirse a llamada
          </a>
        )}
        <button
          onClick={onDetailClick}
          className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Ver todo
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-3 pl-12 pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-1.5">
          {call.email && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              ✉️ <span className="font-medium text-zinc-700 dark:text-zinc-300">{call.email}</span>
            </p>
          )}
          {call.phone && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              📞 <span className="font-medium text-zinc-700 dark:text-zinc-300">{call.phone}</span>
            </p>
          )}
          {call.calendar && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              🗓️ Calendario: <span className="font-medium text-zinc-700 dark:text-zinc-300">{call.calendar}</span>
            </p>
          )}
          {call.utm_source && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              📊 Origen: <span className="font-medium text-zinc-700 dark:text-zinc-300">{call.utm_source}{call.utm_campaign ? ` / ${call.utm_campaign}` : ''}</span>
            </p>
          )}
          {call.notes && (
            <div className="mt-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg px-2.5 py-2">
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed line-clamp-3">{call.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
