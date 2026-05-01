/**
 * Week runs Friday → Thursday (7 days).
 * Returns the most recent Friday up to today as start,
 * and the following Thursday as end.
 */
export function getCurrentWeekRange() {
  const today = new Date()
  const dayOfWeek = today.getDay() // 0=Sun … 5=Fri 6=Sat

  // Days since last Friday
  const daysSinceFriday = (dayOfWeek + 2) % 7

  const friday = new Date(today)
  friday.setDate(today.getDate() - daysSinceFriday)
  friday.setHours(0, 0, 0, 0)

  const thursday = new Date(friday)
  thursday.setDate(friday.getDate() + 6)
  thursday.setHours(23, 59, 59, 999)

  const fmt = (d: Date) => d.toISOString().split('T')[0]

  return {
    start: fmt(friday),
    end: fmt(thursday),
    label: `${friday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${thursday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
  }
}
