/**
 * Prospecting Pipeline — offer_title → tier classification
 *
 * Tiers (lowest → highest):
 *   1 = Freebies
 *   2 = Low Tickets
 *   3 = Secure Parent Collective / Mid Ticket
 *   4 = Prospecting Call  (resolved per-contact, not per-title)
 *   5 = High Ticket
 *   6 = Graduate Plans    (resolved per-contact, not per-title)
 */

export type PipelineTier = 1 | 2 | 3 | 4 | 5 | 6
export type TitleTier = 'exclude' | 'freebie' | 'low_ticket' | 'mid_ticket' | 'high_ticket'

// ── Exclusion patterns (internal / test transactions) ───────────────────────
const EXCLUDE_PATTERNS: string[][] = [
  ['internal', 'payment'],   // "HIC Internal Payment"
  ['test friday'],            // "Offer Full payment (Test Friday)"
  ['test', 'payment'],       // generic test payments
]

// ── High Ticket patterns (stage 5) — checked FIRST ─────────────────────────
const HIGH_TICKET_PATTERNS: string[] = [
  'parenting with understanding',
  'pwu',
  'advance mentorship',
  '10 sessions',
  'hic coaching',
  'graduate package',
  'open house',              // Open House of SPC = High Ticket prospecting event
]

// ── Mid Ticket / SPC patterns (stage 3) — checked SECOND ───────────────────
// NOTE: "open house" is excluded from SPC matching (routed to High Ticket above)
const MID_TICKET_PATTERNS: string[] = [
  'secure parent collective',
  'spc',
  'raising secure',
]

// ── Low Ticket patterns (stage 2) — checked THIRD ──────────────────────────
const LOW_TICKET_PATTERNS: string[] = [
  'yelling cycle',
  'break the yelling',
  'discipline without harm',
  'coping strategies',
  'tantrums',
  'navigating feelings',
  'navigating emotions',
  'navigating feeling',
  'use framework',
  'u.s.e',
  'correct any behavior',
  'calmer morning',
  'morning routines',
  'child discipline guide',
  'play dependency',
  'screen',
  '3 step method',
  'podcast',
  'cycle breaker',
  'managing your triggers',
  'triggers',
]

/**
 * Classify a single offer_title string into a tier.
 * For comma-separated bundles, each segment is checked and the highest tier wins.
 * Returns 'exclude' for internal/test, or undefined if no pattern matches.
 */
export function classifyOfferTitle(offerTitle: string): TitleTier | undefined {
  if (!offerTitle) return undefined

  // Split comma-separated bundles and check each segment
  const segments = offerTitle.includes(',')
    ? offerTitle.split(',').map((s) => s.trim())
    : [offerTitle]

  let best: TitleTier | undefined

  for (const segment of segments) {
    const lower = segment.toLowerCase()

    // 1. Check exclusions
    if (EXCLUDE_PATTERNS.some((parts) => parts.every((p) => lower.includes(p)))) {
      return 'exclude'
    }

    // 2. High Ticket (highest product tier)
    if (HIGH_TICKET_PATTERNS.some((p) => lower.includes(p))) {
      return 'high_ticket' // Can't go higher for a title match, return immediately
    }

    // 3. Mid Ticket / SPC
    if (MID_TICKET_PATTERNS.some((p) => lower.includes(p))) {
      if (!best || tierRank(best) < tierRank('mid_ticket')) best = 'mid_ticket'
      continue
    }

    // 4. Low Ticket
    if (LOW_TICKET_PATTERNS.some((p) => lower.includes(p))) {
      if (!best || tierRank(best) < tierRank('low_ticket')) best = 'low_ticket'
      continue
    }
  }

  return best
}

function tierRank(t: TitleTier): number {
  switch (t) {
    case 'exclude':    return -1
    case 'freebie':    return 1
    case 'low_ticket': return 2
    case 'mid_ticket': return 3
    case 'high_ticket': return 5
  }
}

/**
 * Map a TitleTier to its pipeline stage number.
 */
export function titleTierToStage(tier: TitleTier): PipelineTier | null {
  switch (tier) {
    case 'exclude':     return null
    case 'freebie':     return 1
    case 'low_ticket':  return 2
    case 'mid_ticket':  return 3
    case 'high_ticket': return 5
  }
}

/** Stage labels for display */
export const STAGE_LABELS: Record<PipelineTier, string> = {
  1: 'Freebies',
  2: 'Low Tickets',
  3: 'Secure Parent Collective / Mid Ticket',
  4: 'Prospecting Call',
  5: 'High Ticket',
  6: 'Graduate Plans',
}

export const STAGE_COLORS: Record<PipelineTier, string> = {
  1: '#6B7280',
  2: '#3B82F6',
  3: '#8B5CF6',
  4: '#F59E0B',
  5: '#10B981',
  6: '#EF4444',
}
