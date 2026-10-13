export const US_TIMEZONES = [
  { value: 'America/New_York',    label: 'EST — Eastern',  abbr: 'EST', offset: 'UTC-5' },
  { value: 'America/Chicago',     label: 'CST — Central',  abbr: 'CST', offset: 'UTC-6' },
  { value: 'America/Denver',      label: 'MST — Mountain', abbr: 'MST', offset: 'UTC-7' },
  { value: 'America/Los_Angeles', label: 'PST — Pacific',  abbr: 'PST', offset: 'UTC-8' },
] as const

export const DEFAULT_TIMEZONE = 'America/New_York'

export type Timezone = typeof US_TIMEZONES[number]['value']

// Format a datetime string in the user's timezone
export function formatInTimezone(
  dateStr: string,
  userTimezone: string,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  return date.toLocaleString('es-ES', { timeZone: userTimezone, ...options })
}

// Format time only (e.g. "3:00 PM")
export function formatTimeInTimezone(dateStr: string, userTimezone: string): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('en-US', {
    timeZone: userTimezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

// Format date only (e.g. "11 abr 2026")
export function formatDateInTimezone(dateStr: string, userTimezone: string): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('es-ES', {
    timeZone: userTimezone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// Format date + time together (e.g. "11 abr · 3:00 PM")
export function formatDateTimeInTimezone(dateStr: string, userTimezone: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const datePart = d.toLocaleDateString('es-ES', { timeZone: userTimezone, day: 'numeric', month: 'short' })
  const timePart = d.toLocaleTimeString('en-US', { timeZone: userTimezone, hour: 'numeric', minute: '2-digit', hour12: true })
  return `${datePart} · ${timePart}`
}

// Format full date with weekday (e.g. "Lunes, 11 de Abril · 3:00 PM")
export function formatFullDateInTimezone(dateStr: string, userTimezone: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

  // Extract components in the target timezone
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: userTimezone,
    weekday: 'long',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d)

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  const weekday = get('weekday')
  const day = get('day')
  const month = parseInt(get('month')) - 1
  const hour = get('hour')
  const minute = get('minute')
  const dayPeriod = get('dayPeriod').toLowerCase()

  const weekdayEs = days[['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].indexOf(weekday)] ?? weekday
  const monthEs = months[month] ?? ''

  return `${weekdayEs}, ${day} de ${monthEs} · ${hour}:${minute}${dayPeriod}`
}

// Get the UTC range [startIso, endIso) for a local date in a given timezone.
// startIso = UTC instant when dateStr begins in timeZone
// endIso   = UTC instant when dateStr+1 begins in timeZone (exclusive upper bound)
// Handles DST correctly (23h and 25h days) using Intl — no fixed offsets.
export function getUtcRangeForLocalDate(
  dateStr: string,
  timeZone: string
): { startIso: string; endIso: string } {
  // Parse the local midnight of dateStr in the given timezone.
  // We use formatToParts to find the real UTC offset for that instant.
  function localMidnightToUtc(ymd: string, tz: string): string {
    const [y, m, d] = ymd.split('-').map(Number)
    // Create a rough UTC guess (midnight UTC on that date)
    // then adjust by the offset we discover.
    const guess = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)) // noon UTC to avoid date-boundary issues
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      hour12: false,
    })
    // Binary-search style: we know the local date, we need the UTC instant
    // where local time = 00:00:00 on that date.
    // Approach: compute offset from a nearby UTC instant, then derive.
    const parts = fmt.formatToParts(guess)
    const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? '0')
    const localAtGuess = new Date(Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')))
    // offset = local - UTC  (in ms)
    const offsetMs = localAtGuess.getTime() - guess.getTime()
    // Midnight local on dateStr = Date.UTC(y, m-1, d, 0, 0, 0) - offsetMs
    const midnightUtc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMs)

    // Verify: the offset might differ at midnight vs noon (DST boundary).
    // Re-check the offset at the computed midnight.
    const parts2 = fmt.formatToParts(midnightUtc)
    const get2 = (type: string) => parseInt(parts2.find(p => p.type === type)?.value ?? '0')
    const localAtMidnight = new Date(Date.UTC(get2('year'), get2('month') - 1, get2('day'), get2('hour'), get2('minute'), get2('second')))
    const offsetMs2 = localAtMidnight.getTime() - midnightUtc.getTime()

    if (offsetMs2 !== offsetMs) {
      // Offset changed — recalculate with the correct offset
      return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMs2).toISOString()
    }
    return midnightUtc.toISOString()
  }

  // Next day string
  const [y, m, d] = dateStr.split('-').map(Number)
  const nextDay = new Date(Date.UTC(y, m - 1, d + 1))
  const nextDayStr = nextDay.toISOString().split('T')[0]

  return {
    startIso: localMidnightToUtc(dateStr, timeZone),
    endIso: localMidnightToUtc(nextDayStr, timeZone),
  }
}

// Get timezone abbreviation for display
export function getTimezoneAbbr(timeZone: string): string {
  const entry = US_TIMEZONES.find(tz => tz.value === timeZone)
  if (entry) return entry.label
  // Fallback: use Intl to get short name
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(new Date())
    return parts.find(p => p.type === 'timeZoneName')?.value ?? timeZone
  } catch {
    return timeZone
  }
}

// Check if a date is today in user timezone
export function isToday(dateStr: string, userTimezone: string): boolean {
  if (!dateStr) return false
  const nowInTz  = new Date().toLocaleDateString('en-US', { timeZone: userTimezone })
  const dateInTz = new Date(dateStr).toLocaleDateString('en-US', { timeZone: userTimezone })
  return nowInTz === dateInTz
}

// Get current date string (YYYY-MM-DD) in user timezone — useful for filtering
export function getTodayInTimezone(userTimezone: string): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: userTimezone })
}
