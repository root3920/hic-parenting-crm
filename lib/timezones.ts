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
