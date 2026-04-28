'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { Call } from '@/types'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Constants ──────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 64 // px per hour
const START_HOUR = 7
const END_HOUR = 20
const TOTAL_HOURS = END_HOUR - START_HOUR
const DEFAULT_DURATION = 45 // minutes

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  'Scheduled':   { bg: 'bg-blue-50 dark:bg-blue-900/30',     border: 'border-l-blue-500',   text: 'text-blue-700 dark:text-blue-300' },
  'Showed Up':   { bg: 'bg-green-50 dark:bg-green-900/30',   border: 'border-l-green-500',  text: 'text-green-700 dark:text-green-300' },
  'Cancelled':   { bg: 'bg-red-50 dark:bg-red-900/30',       border: 'border-l-red-500',    text: 'text-red-700 dark:text-red-300' },
  'No show':     { bg: 'bg-amber-50 dark:bg-amber-900/30',   border: 'border-l-amber-500',  text: 'text-amber-700 dark:text-amber-300' },
  'Rescheduled': { bg: 'bg-purple-50 dark:bg-purple-900/30', border: 'border-l-purple-500', text: 'text-purple-700 dark:text-purple-300' },
  'Follow-up':   { bg: 'bg-cyan-50 dark:bg-cyan-900/30',     border: 'border-l-cyan-500',   text: 'text-cyan-700 dark:text-cyan-300' },
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ─── Types ──────────────────────────────────────────────────────────────────

type CalView = 'week' | 'month'

interface Props {
  calls: Call[]
  timezone: string
  onCallClick: (call: Call) => void
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getWeekStart(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? 0 : -day
  const start = new Date(d)
  start.setDate(d.getDate() + diff)
  start.setHours(0, 0, 0, 0)
  return start
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(d.getDate() + n)
  return r
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function getMonthDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const start = getWeekStart(first)
  const days: Date[] = []
  const d = new Date(start)
  // Always show 6 weeks
  for (let i = 0; i < 42; i++) {
    days.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return days
}

function callToTzDate(call: Call, timezone: string): Date {
  const d = new Date(call.start_date)
  const str = d.toLocaleString('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  // Parse "MM/DD/YYYY, HH:MM"
  const [datePart, timePart] = str.split(', ')
  const [mo, dy, yr] = datePart.split('/').map(Number)
  const [hr, mn] = timePart.split(':').map(Number)
  return new Date(yr, mo - 1, dy, hr, mn)
}

function formatTzTime(call: Call, timezone: string): string {
  return new Date(call.start_date).toLocaleTimeString('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

// ─── Component ──────────────────────────────────────────────────────────────

export function CallsCalendar({ calls, timezone, onCallClick }: Props) {
  const [calView, setCalView] = useState<CalView>('week')
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()))
  const [monthDate, setMonthDate] = useState(() => new Date())
  const scrollRef = useRef<HTMLDivElement>(null)

  // Scroll to 8 AM on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = HOUR_HEIGHT * 1 // 1 hour past start (8 AM)
    }
  }, [calView])

  const today = useMemo(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    return now
  }, [])

  // ── Week days ──
  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  )

  // ── Calls grouped by day (in user's timezone) ──
  const callsByDay = useMemo(() => {
    const map = new Map<string, { call: Call; tzDate: Date }[]>()
    for (const call of calls) {
      const tzd = callToTzDate(call, timezone)
      const key = `${tzd.getFullYear()}-${tzd.getMonth()}-${tzd.getDate()}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push({ call, tzDate: tzd })
    }
    return map
  }, [calls, timezone])

  function getCallsForDay(d: Date) {
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    return callsByDay.get(key) ?? []
  }

  // ── Current time indicator ──
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  const nowTz = useMemo(() => {
    const str = now.toLocaleString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false })
    const [hr, mn] = str.split(', ').pop()!.split(':').map(Number)
    return { hour: hr, minute: mn }
  }, [now, timezone])

  const nowOffset = (nowTz.hour - START_HOUR) * HOUR_HEIGHT + (nowTz.minute / 60) * HOUR_HEIGHT

  // ── Navigation ──
  function prevWeek() { setWeekStart(addDays(weekStart, -7)) }
  function nextWeek() { setWeekStart(addDays(weekStart, 7)) }
  function goToday() { setWeekStart(getWeekStart(new Date())) }
  function prevMonth() { setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1)) }
  function nextMonth() { setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1)) }
  function goToWeek(d: Date) { setWeekStart(getWeekStart(d)); setCalView('week') }

  const isPast = (call: Call) => new Date(call.start_date) < new Date()
  const isCancelled = (s: string) => s === 'Cancelled' || s === 'Rescheduled'

  // ── View toggle + nav bar ──
  return (
    <div>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {calView === 'week' ? (
            <>
              <button onClick={prevWeek} className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button onClick={goToday} className="px-2.5 py-1 rounded-md text-xs font-medium border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                Today
              </button>
              <button onClick={nextWeek} className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 ml-2">
                {MONTH_NAMES[weekDays[0].getMonth()]} {weekDays[0].getDate()} – {MONTH_NAMES[weekDays[6].getMonth()]} {weekDays[6].getDate()}, {weekDays[6].getFullYear()}
              </span>
            </>
          ) : (
            <>
              <button onClick={prevMonth} className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button onClick={nextMonth} className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 ml-2">
                {MONTH_NAMES[monthDate.getMonth()]} {monthDate.getFullYear()}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden">
          {(['week', 'month'] as CalView[]).map(v => (
            <button
              key={v}
              onClick={() => setCalView(v)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                calView === v ? 'bg-[#185FA5] text-white' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
              )}
            >
              {v === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
      </div>

      {/* ── WEEK VIEW ── */}
      {calView === 'week' && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          {/* Day headers */}
          <div className="grid border-b border-zinc-200 dark:border-zinc-800" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
            <div className="border-r border-zinc-100 dark:border-zinc-800" />
            {weekDays.map((d, i) => {
              const isToday = isSameDay(d, today)
              return (
                <div key={i} className={cn('text-center py-2.5 border-r border-zinc-100 dark:border-zinc-800 last:border-r-0', isToday && 'bg-blue-50/50 dark:bg-blue-900/10')}>
                  <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase">{DAY_NAMES[d.getDay()]}</p>
                  <p className={cn('text-lg font-bold', isToday ? 'text-[#185FA5]' : 'text-zinc-800 dark:text-zinc-200')}>{d.getDate()}</p>
                </div>
              )
            })}
          </div>

          {/* Time grid */}
          <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: '600px' }}>
            <div className="grid relative" style={{ gridTemplateColumns: '56px repeat(7, 1fr)', height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}>
              {/* Time labels */}
              <div className="relative border-r border-zinc-100 dark:border-zinc-800">
                {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                  <div
                    key={i}
                    className="absolute right-2 text-[10px] text-zinc-400 dark:text-zinc-500 leading-none"
                    style={{ top: `${i * HOUR_HEIGHT - 5}px` }}
                  >
                    {((START_HOUR + i) % 12 || 12)}{(START_HOUR + i) < 12 ? 'a' : 'p'}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {weekDays.map((day, dayIdx) => {
                const isToday = isSameDay(day, today)
                const dayCalls = getCallsForDay(day)

                return (
                  <div
                    key={dayIdx}
                    className={cn('relative border-r border-zinc-100 dark:border-zinc-800 last:border-r-0', isToday && 'bg-blue-50/30 dark:bg-blue-900/5')}
                  >
                    {/* Hour grid lines */}
                    {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                      <div
                        key={i}
                        className="absolute inset-x-0 border-t border-zinc-100 dark:border-zinc-800"
                        style={{ top: `${i * HOUR_HEIGHT}px` }}
                      />
                    ))}

                    {/* Current time line */}
                    {isToday && nowOffset >= 0 && nowOffset <= TOTAL_HOURS * HOUR_HEIGHT && (
                      <div className="absolute inset-x-0 z-20 flex items-center" style={{ top: `${nowOffset}px` }}>
                        <div className="h-2.5 w-2.5 rounded-full bg-red-500 -ml-1.5 shrink-0" />
                        <div className="flex-1 h-[2px] bg-red-500" />
                      </div>
                    )}

                    {/* Call blocks */}
                    {dayCalls.map(({ call, tzDate }) => {
                      const hour = tzDate.getHours()
                      const minute = tzDate.getMinutes()
                      if (hour < START_HOUR || hour >= END_HOUR) return null

                      const top = (hour - START_HOUR) * HOUR_HEIGHT + (minute / 60) * HOUR_HEIGHT
                      const height = Math.max(28, (DEFAULT_DURATION / 60) * HOUR_HEIGHT)
                      const colors = STATUS_COLORS[call.status] ?? STATUS_COLORS['Scheduled']
                      const past = isPast(call)
                      const cancelled = isCancelled(call.status)

                      return (
                        <button
                          key={call.id}
                          onClick={() => onCallClick(call)}
                          className={cn(
                            'absolute inset-x-1 rounded-md border-l-[3px] px-1.5 py-1 text-left transition-all hover:shadow-md hover:z-30 overflow-hidden cursor-pointer',
                            colors.bg, colors.border,
                            past && !cancelled && 'opacity-60',
                          )}
                          style={{ top: `${top}px`, height: `${height}px`, zIndex: 10 }}
                          title={`${call.full_name} · ${formatTzTime(call, timezone)}`}
                        >
                          <p className={cn('text-[10px] font-bold leading-tight truncate', colors.text, cancelled && 'line-through')}>
                            {call.full_name}
                          </p>
                          <p className="text-[9px] text-zinc-500 dark:text-zinc-400 truncate">
                            {formatTzTime(call, timezone)}
                          </p>
                          {height > 36 && call.closer_name && (
                            <p className="text-[9px] text-zinc-400 dark:text-zinc-500 truncate">
                              {call.closer_name}
                            </p>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── MONTH VIEW ── */}
      {calView === 'month' && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-zinc-200 dark:border-zinc-800">
            {DAY_NAMES.map(d => (
              <div key={d} className="text-center py-2 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase">{d}</div>
            ))}
          </div>

          {/* Month grid */}
          <div className="grid grid-cols-7">
            {getMonthDays(monthDate.getFullYear(), monthDate.getMonth()).map((day, i) => {
              const isCurrentMonth = day.getMonth() === monthDate.getMonth()
              const isToday = isSameDay(day, today)
              const dayCalls = getCallsForDay(day)
              const shown = dayCalls.slice(0, 3)
              const extra = dayCalls.length - shown.length

              return (
                <button
                  key={i}
                  onClick={() => goToWeek(day)}
                  className={cn(
                    'min-h-[80px] p-1.5 border-r border-b border-zinc-100 dark:border-zinc-800 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50',
                    !isCurrentMonth && 'opacity-40',
                    isToday && 'bg-blue-50/50 dark:bg-blue-900/10',
                  )}
                >
                  <p className={cn('text-xs font-medium mb-1', isToday ? 'text-[#185FA5] font-bold' : 'text-zinc-600 dark:text-zinc-400')}>
                    {day.getDate()}
                  </p>
                  <div className="space-y-0.5">
                    {shown.map(({ call }) => {
                      const colors = STATUS_COLORS[call.status] ?? STATUS_COLORS['Scheduled']
                      return (
                        <div
                          key={call.id}
                          className={cn('rounded px-1 py-0.5 text-[9px] font-medium truncate', colors.bg, colors.text, isCancelled(call.status) && 'line-through')}
                        >
                          {formatTzTime(call, timezone)} {call.full_name.split(' ')[0]}
                        </div>
                      )
                    })}
                    {extra > 0 && (
                      <p className="text-[9px] text-zinc-400 dark:text-zinc-500 pl-1">+{extra} more</p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
