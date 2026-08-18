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
    calls,
    spcMembers,
    contacts,
    pwuStudents,
    manualOverrides,
  ] = await Promise.all([
    fetchAll<{ buyer_email: string; offer_title: string; cost: number }>(
      svc, 'transactions', 'buyer_email, offer_title, cost',
      (q) => (q as any).or('status.eq.completed,status.is.null'),
    ),
    fetchAll<{ email: string }>(svc, 'freebie_leads', 'email'),
    fetchAll<{ email: string }>(svc, 'calls', 'email'),
    fetchAll<{ email: string; status: string }>(svc, 'spc_members', 'email, status'),
    fetchAll<{ email: string; is_spc_member: boolean | null; is_spc_trial: boolean | null; is_pwu_student: boolean | null; is_pwu_graduate: boolean | null }>(
      svc, 'contacts', 'email, is_spc_member, is_spc_trial, is_pwu_student, is_pwu_graduate',
    ),
    fetchAll<{ email: string | null; status: string }>(
      svc, 'pwu_students', 'email, status',
    ),
    fetchAll<{ buyer_email: string; current_stage: number; manual_override: boolean }>(
      svc, 'value_ladder_contacts', 'buyer_email, current_stage, manual_override',
      (q) => (q as any).eq('manual_override', true),
    ),
  ])

  // ── Build lookup sets ───────────────────────────────────────────────────
  const freebieEmails = new Set(freebieLeads.map((f) => f.email?.toLowerCase()).filter(Boolean))
  const callEmails = new Set(calls.map((c) => c.email?.toLowerCase()).filter(Boolean))
  const spcEmails = new Set(spcMembers.map((m) => m.email?.toLowerCase()).filter(Boolean))
  const manualOverrideMap = new Map<string, number>()
  for (const m of manualOverrides) {
    if (m.manual_override && m.buyer_email) {
      manualOverrideMap.set(m.buyer_email.toLowerCase(), m.current_stage)
    }
  }

  // Contacts flags
  const contactFlags = new Map<string, {
    is_spc_member: boolean
    is_spc_trial: boolean
    is_pwu_student: boolean
    is_pwu_graduate: boolean
  }>()
  for (const c of contacts) {
    const e = c.email?.toLowerCase()
    if (e) {
      contactFlags.set(e, {
        is_spc_member: !!c.is_spc_member,
        is_spc_trial: !!c.is_spc_trial,
        is_pwu_student: !!c.is_pwu_student,
        is_pwu_graduate: !!c.is_pwu_graduate,
      })
    }
  }

  // PWU students
  const pwuStudentEmails = new Set<string>()
  const pwuGraduateEmails = new Set<string>()
  for (const s of pwuStudents) {
    const e = s.email?.toLowerCase()
    if (!e) continue
    if (s.status === 'graduated') {
      pwuGraduateEmails.add(e)
    } else {
      pwuStudentEmails.add(e)
    }
  }

  // ── Process transactions: classify each title, track per-email highest ──
  const emailHighestTxStage = new Map<string, PipelineTier>()
  const unclassifiedTitles = new Map<string, number>()

  for (const tx of transactions) {
    const email = (tx.buyer_email || '').toLowerCase()
    if (!email) continue

    const cost = Number(tx.cost) || 0
    const title = tx.offer_title || ''
    const tier = classifyOfferTitle(title)

    if (tier === 'exclude') continue

    let stage: PipelineTier | null = null

    if (tier) {
      // Classified by pattern
      if (tier === 'high_ticket') stage = 5
      else if (tier === 'mid_ticket') stage = 3
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

  // ── Collect all unique emails ───────────────────────────────────────────
  const allEmails = new Set<string>()
  for (const tx of transactions) {
    if (tx.buyer_email) allEmails.add(tx.buyer_email.toLowerCase())
  }
  for (const f of freebieLeads) {
    if (f.email) allEmails.add(f.email.toLowerCase())
  }
  for (const c of calls) {
    if (c.email) allEmails.add(c.email.toLowerCase())
  }
  for (const m of spcMembers) {
    if (m.email) allEmails.add(m.email.toLowerCase())
  }
  for (const c of contacts) {
    if (c.email) allEmails.add(c.email.toLowerCase())
  }
  for (const s of pwuStudents) {
    if (s.email) allEmails.add(s.email.toLowerCase())
  }

  // ── Compute final stage per contact ─────────────────────────────────────
  const results: { buyer_email: string; current_stage: number; manual_override: boolean }[] = []
  const stageCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }

  for (const email of Array.from(allEmails)) {
    // Respect manual overrides
    if (manualOverrideMap.has(email)) {
      const stage = manualOverrideMap.get(email)!
      stageCounts[stage] = (stageCounts[stage] || 0) + 1
      results.push({ buyer_email: email, current_stage: stage, manual_override: true })
      continue
    }

    const flags = contactFlags.get(email)

    // Stage 6: Graduate (highest, always wins)
    if (pwuGraduateEmails.has(email) || flags?.is_pwu_graduate) {
      stageCounts[6]++
      results.push({ buyer_email: email, current_stage: 6, manual_override: false })
      continue
    }

    // Stage 5: High Ticket
    const txStage = emailHighestTxStage.get(email) || 0
    if (txStage >= 5 || pwuStudentEmails.has(email) || flags?.is_pwu_student) {
      stageCounts[5]++
      results.push({ buyer_email: email, current_stage: 5, manual_override: false })
      continue
    }

    // Stage 4: Prospecting Call (only if NOT High Ticket)
    if (callEmails.has(email)) {
      stageCounts[4]++
      results.push({ buyer_email: email, current_stage: 4, manual_override: false })
      continue
    }

    // Stage 3: SPC / Mid Ticket
    if (txStage >= 3 || spcEmails.has(email) || flags?.is_spc_member || flags?.is_spc_trial) {
      stageCounts[3]++
      results.push({ buyer_email: email, current_stage: 3, manual_override: false })
      continue
    }

    // Stage 2: Low Ticket
    if (txStage >= 2) {
      stageCounts[2]++
      results.push({ buyer_email: email, current_stage: 2, manual_override: false })
      continue
    }

    // Stage 1: Freebie
    if (txStage >= 1 || freebieEmails.has(email)) {
      stageCounts[1]++
      results.push({ buyer_email: email, current_stage: 1, manual_override: false })
      continue
    }

    // No qualifying data — still place as freebie if they exist in any source
    stageCounts[1]++
    results.push({ buyer_email: email, current_stage: 1, manual_override: false })
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

  // Build unclassified report
  const unclassifiedReport = Array.from(unclassifiedTitles.entries())
    .map(([title, count]) => ({ title, count, assigned_tier: 'low_ticket (fallback)' }))
    .sort((a, b) => b.count - a.count)

  return NextResponse.json({
    success: true,
    total_contacts: results.length,
    upserted,
    stage_counts: stageCounts,
    unclassified_titles: unclassifiedReport,
    manual_overrides_preserved: manualOverrideMap.size,
    errors,
  })
}
