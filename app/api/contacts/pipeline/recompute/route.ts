import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { classifyOfferTitle, type PipelineTier } from '@/lib/pipeline-tiers'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const PAGE = 1000

async function fetchAll<T>(
  svc: ReturnType<typeof getServiceClient>,
  table: string,
  select: string,
  filters?: (q: ReturnType<ReturnType<typeof getServiceClient>['from']>) => unknown,
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = svc.from(table).select(select).range(from, from + PAGE - 1)
    if (filters) query = filters(query)
    const { data, error } = await query
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

/**
 * POST /api/contacts/pipeline/recompute
 *
 * Recomputes the 6-stage prospecting pipeline for every contact.
 * Respects manual_override — contacts with manual_override=true are not changed.
 *
 * Auth: admin only, OR cron secret header.
 */
export async function POST(req: NextRequest) {
  // Auth: cron secret OR admin user
  const cronHeader = req.headers.get('x-vercel-cron') || req.headers.get('authorization')
  const isCron = cronHeader === '1' ||
    cronHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!isCron) {
    const userSupabase = await createServerSupabaseClient()
    const { data: { user } } = await userSupabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await userSupabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }
  }

  const svc = getServiceClient()

  // ── Gather all data sources in parallel ─────────────────────────────────
  const [
    transactions,
    freebieLeads,
    allCalls,
    spcMembers,
    pwuStudents,
    manualOverrides,
    graduateTransactions,
  ] = await Promise.all([
    fetchAll<{ buyer_email: string; offer_title: string; cost: number }>(
      svc, 'transactions', 'buyer_email, offer_title, cost',
      (q) => (q as any).or('status.eq.completed,status.is.null'),
    ),
    fetchAll<{ email: string }>(svc, 'freebie_leads', 'email'),
    fetchAll<{ email: string; start_date: string }>(svc, 'calls', 'email, start_date'),
    fetchAll<{ email: string; status: string }>(svc, 'spc_members', 'email, status'),
    fetchAll<{ email: string | null; status: string }>(
      svc, 'pwu_students', 'email, status',
    ),
    fetchAll<{ buyer_email: string; current_stage: number; manual_override: boolean }>(
      svc, 'value_ladder_contacts', 'buyer_email, current_stage, manual_override',
      (q) => (q as any).eq('manual_override', true),
    ),
    // Graduate transactions — any status (including refunded) qualifies for stage 6
    // Matches: offer_title ilike '%graduate%' OR offer_title = 'Individual 10 Sessions HIC Coaching'
    fetchAll<{ buyer_email: string }>(
      svc, 'transactions', 'buyer_email',
      (q) => (q as any).or('offer_title.ilike.%graduate%,offer_title.eq.Individual 10 Sessions HIC Coaching'),
    ),
  ])

  // ── Build lookup sets ───────────────────────────────────────────────────
  const freebieEmails = new Set(freebieLeads.map((f) => f.email?.toLowerCase()).filter(Boolean))

  // Stage 4 (Prospecting Call) only counts calls from the CURRENT calendar month.
  // Older calls should not promote contacts — they fall through to their real tier.
  const now = new Date()
  const monthStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  const monthEndMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)

  const callEmails = new Set(
    allCalls
      .filter((c) => {
        if (!c.start_date) return false
        const t = new Date(c.start_date).getTime()
        return t >= monthStartMs && t < monthEndMs
      })
      .map((c) => c.email?.toLowerCase())
      .filter(Boolean),
  )
  // Only active/trial SPC members qualify for stage 3 — exclude cancelled/expired
  const spcEmails = new Set(
    spcMembers
      .filter((m) => m.status === 'active' || m.status === 'trial')
      .map((m) => m.email?.toLowerCase())
      .filter(Boolean),
  )
  const manualOverrideMap = new Map<string, number>()
  for (const m of manualOverrides) {
    if (m.manual_override && m.buyer_email) {
      manualOverrideMap.set(m.buyer_email.toLowerCase(), m.current_stage)
    }
  }

  // PWU students — all statuses count for stage 5 (High Ticket).
  // Stage 6 (Graduate) is determined purely by transaction evidence, not status.
  const pwuStudentEmails = new Set<string>()
  for (const s of pwuStudents) {
    const e = s.email?.toLowerCase()
    if (e) pwuStudentEmails.add(e)
  }

  // ── Build graduate set from dedicated query (any tx status) ──────────
  // Stage 6 (Graduate Plans) is based purely on having a transaction with
  // "graduate" in the offer_title — fetched separately so refunded graduate
  // transactions still qualify (the enrollment happened).
  const graduateTxEmails = new Set(
    graduateTransactions.map((t) => (t.buyer_email || '').toLowerCase()).filter(Boolean),
  )

  // ── Process transactions: classify each title, track per-email highest ──
  const emailHighestTxStage = new Map<string, PipelineTier>()
  // Track highest-tier product title per email (for display on pipeline cards)
  const emailHighestProduct = new Map<string, { stage: number; title: string }>()
  const unclassifiedTitles = new Map<string, number>()

  // Tier rank for product tracking (original tier, not the stage-computation mapping)
  const TIER_DISPLAY_RANK: Record<string, number> = {
    freebie: 1, low_ticket: 2, mid_ticket: 3, high_ticket: 5,
  }

  for (const tx of transactions) {
    const email = (tx.buyer_email || '').toLowerCase()
    if (!email) continue

    const cost = Number(tx.cost) || 0
    const title = tx.offer_title || ''
    const tier = classifyOfferTitle(title)

    if (tier === 'exclude') continue

    // Track the highest-tier product title for card display (using original tier rank)
    if (tier && TIER_DISPLAY_RANK[tier] > 1) {
      const rank = TIER_DISPLAY_RANK[tier]
      const current = emailHighestProduct.get(email)
      if (!current || rank > current.stage) {
        emailHighestProduct.set(email, { stage: rank, title })
      }
    }

    let stage: PipelineTier | null = null

    if (tier) {
      // Classified by pattern
      // mid_ticket (SPC) transactions are treated as low_ticket for stage computation —
      // stage 3 is now solely determined by spc_members.status, not transaction titles.
      if (tier === 'high_ticket') stage = 5
      else if (tier === 'mid_ticket') stage = 2
      else if (tier === 'low_ticket') stage = 2
      else if (tier === 'freebie') stage = 1
    } else if (cost === 0) {
      // Unclassified but free → freebie
      stage = 1
    } else {
      // Truly unclassified — track it, default to low ticket for paid items
      const existing = unclassifiedTitles.get(title) || 0
      unclassifiedTitles.set(title, existing + 1)
      // Best-judgement fallback: paid but unrecognized → low ticket
      stage = 2
    }

    if (stage) {
      const current = emailHighestTxStage.get(email) || 0
      if (stage > current) emailHighestTxStage.set(email, stage as PipelineTier)
    }
  }

  // ── Collect all unique emails with REAL qualifying activity ─────────────
  // Only include emails that have at least one real data point (transaction,
  // freebie lead, call, active/trial SPC, or PWU student/graduate).
  // Cancelled/expired SPC-only contacts with no other activity are excluded.
  const allEmails = new Set<string>()
  for (const tx of transactions) {
    if (tx.buyer_email) allEmails.add(tx.buyer_email.toLowerCase())
  }
  for (const f of freebieLeads) {
    if (f.email) allEmails.add(f.email.toLowerCase())
  }
  for (const c of allCalls) {
    if (c.email) allEmails.add(c.email.toLowerCase())
  }
  // Only active/trial SPC members (not cancelled/expired)
  Array.from(spcEmails).forEach((e) => allEmails.add(e))
  // Graduate transaction emails (any status)
  Array.from(graduateTxEmails).forEach((e) => allEmails.add(e))
  // PWU students (all statuses are real enrollments)
  for (const s of pwuStudents) {
    if (s.email) allEmails.add(s.email.toLowerCase())
  }

  // ── Compute final stage per contact ─────────────────────────────────────
  const results: { buyer_email: string; current_stage: number; manual_override: boolean; product_proposed: string | null }[] = []
  const stageCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }

  for (const email of Array.from(allEmails)) {
    const hp = emailHighestProduct.get(email)?.title ?? null

    // Respect manual overrides
    if (manualOverrideMap.has(email)) {
      const stage = manualOverrideMap.get(email)!
      stageCounts[stage] = (stageCounts[stage] || 0) + 1
      results.push({ buyer_email: email, current_stage: stage, manual_override: true, product_proposed: hp })
      continue
    }

    // Stage 6: Graduate (highest, always wins) — requires a "graduate" transaction
    if (graduateTxEmails.has(email)) {
      stageCounts[6]++
      results.push({ buyer_email: email, current_stage: 6, manual_override: false, product_proposed: hp })
      continue
    }

    // Stage 5: High Ticket
    const txStage = emailHighestTxStage.get(email) || 0
    if (txStage >= 5 || pwuStudentEmails.has(email)) {
      stageCounts[5]++
      results.push({ buyer_email: email, current_stage: 5, manual_override: false, product_proposed: hp })
      continue
    }

    // Stage 4: Prospecting Call (only if call in CURRENT calendar month and NOT High Ticket)
    if (callEmails.has(email)) {
      stageCounts[4]++
      results.push({ buyer_email: email, current_stage: 4, manual_override: false, product_proposed: hp })
      continue
    }

    // Stage 3: SPC / Mid Ticket — solely determined by spc_members.status in ('active','trial').
    // Transaction titles alone do not qualify; spc_members is the source of truth.
    if (spcEmails.has(email)) {
      stageCounts[3]++
      results.push({ buyer_email: email, current_stage: 3, manual_override: false, product_proposed: hp })
      continue
    }

    // Stage 2: Low Ticket
    if (txStage >= 2) {
      stageCounts[2]++
      results.push({ buyer_email: email, current_stage: 2, manual_override: false, product_proposed: hp })
      continue
    }

    // Stage 1: Freebie
    if (txStage >= 1 || freebieEmails.has(email)) {
      stageCounts[1]++
      results.push({ buyer_email: email, current_stage: 1, manual_override: false, product_proposed: hp })
      continue
    }

    // No qualifying data — contact should not be in the pipeline.
  }

  // ── Upsert in batches ──────────────────────────────────────────────────
  const BATCH = 200
  let upserted = 0
  const errors: string[] = []

  for (let i = 0; i < results.length; i += BATCH) {
    const batch = results.slice(i, i + BATCH)
    const { error } = await svc
      .from('value_ladder_contacts')
      .upsert(
        batch.map((r) => ({
          buyer_email: r.buyer_email,
          current_stage: r.current_stage,
          manual_override: r.manual_override,
          product_proposed: r.product_proposed,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'buyer_email' },
      )
    if (error) {
      errors.push(`Batch ${i / BATCH}: ${error.message}`)
    } else {
      upserted += batch.length
    }
  }

  // ── Remove contacts that no longer qualify for any stage ─────────────
  // Fetch all existing emails in value_ladder_contacts, then delete any
  // that are not in the current results set (and not manually overridden).
  const resultEmails = new Set(results.map((r) => r.buyer_email))
  let removed = 0
  const existingAll = await fetchAll<{ buyer_email: string; manual_override: boolean }>(
    svc, 'value_ladder_contacts', 'buyer_email, manual_override',
  )
  const toRemove = existingAll
    .filter((e) => !e.manual_override && !resultEmails.has(e.buyer_email))
    .map((e) => e.buyer_email)

  for (let i = 0; i < toRemove.length; i += BATCH) {
    const batch = toRemove.slice(i, i + BATCH)
    const { error } = await svc
      .from('value_ladder_contacts')
      .delete()
      .in('buyer_email', batch)
    if (error) {
      errors.push(`Remove batch ${i / BATCH}: ${error.message}`)
    } else {
      removed += batch.length
    }
  }

  // Build unclassified report
  const unclassifiedReport = Array.from(unclassifiedTitles.entries())
    .map(([title, count]) => ({ title, count, assigned_tier: 'low_ticket (fallback)' }))
    .sort((a, b) => b.count - a.count)

  return NextResponse.json({
    success: true,
    total_contacts: results.length,
    upserted,
    removed_from_pipeline: removed,
    stage_counts: stageCounts,
    unclassified_titles: unclassifiedReport,
    manual_overrides_preserved: manualOverrideMap.size,
    errors,
  })
}
