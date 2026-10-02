export function npsToScore(nps: number): number {
  if (nps >= 9) return 5
  if (nps >= 7) return 4
  if (nps >= 5) return 3
  if (nps >= 3) return 2
  return 1
}

export function computeHealthScore(csat: number, value: number, engagement: number, support: number, nps: number): number {
  const npsScore = npsToScore(nps)
  return Math.round(((csat + value + engagement + support + npsScore) / 5) * 10) / 10
}

export type HealthColor = 'green' | 'yellow' | 'red'

export function computeHealthColor(params: {
  healthScore: number
  csat: number
  value: number
  engagement: number
  support: number
  nps: number
  barrier?: string | null
  engagementRaw?: string | null
}): HealthColor {
  const { healthScore, csat, value, engagement, support, nps, barrier, engagementRaw } = params

  // RED — automatic
  if (csat <= 2 || value <= 2 || support <= 2) return 'red'
  if (nps <= 6 && engagement <= 2) return 'red'
  if (healthScore < 3.0) return 'red'

  // YELLOW — automatic
  if (engagement <= 2) return 'yellow'
  if (value <= 3) return 'yellow'
  if (support <= 3) return 'yellow'
  if (engagementRaw === "I haven't really started yet") return 'yellow'
  if (barrier === "I'm not sure where to start") return 'yellow'
  if (barrier === 'I forget to use the platform/resources') return 'yellow'
  if (barrier === 'I feel overwhelmed by the amount of information') return 'yellow'
  if (healthScore >= 3.0 && healthScore < 4.0) return 'yellow'

  // GREEN
  return 'green'
}

export function isAdvocate(nps: number, csat: number, value: number): boolean {
  return nps >= 9 && csat >= 4 && value >= 4
}

export function isCoachingOpportunity(barrier?: string | null, nextSupport?: string | null): boolean {
  return (
    barrier === 'I need help applying the tools to my specific situation' ||
    nextSupport === 'I\'d like more personalized guidance' ||
    nextSupport === 'I\'m interested in learning about more intensive coaching support'
  )
}

export const ENGAGEMENT_SCORES: Record<string, number> = {
  'Several times a week': 5,
  'About once a week': 4,
  'A few times a month': 3,
  'Rarely': 2,
  "I haven't really started yet": 1,
}
