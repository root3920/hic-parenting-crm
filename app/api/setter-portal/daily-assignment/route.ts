import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const SETTER_NAME = 'Juan Diego Palacios'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * POST /api/setter-portal/daily-assignment
 *
 * Daily cron (6:10am UTC) that assigns ALL newly eligible contacts
 * to Juan Diego Palacios.
 *
 * Eligibility: pipeline stage 1-3 AND (contact_scores.score > 45 OR
 * spc_members.lead_score > 45 OR spc_members.status = 'active').
 *
 * A contact only enters the queue once in its lifetime. After that,
 * the GET handler's carryover logic keeps surfacing it until the
 * setter changes its status.
 */
// Vercel Cron Jobs send GET requests; also support POST for manual triggers
export async function GET(req: NextRequest) {
  return runDailyAssignment(req)
}

export async function POST(req: NextRequest) {
  return runDailyAssignment(req)
}

async function runDailyAssignment(req: NextRequest) {
  // Verify cron authorization
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const authHeader = req.headers.get('authorization')
  const isValidBearer = authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!isVercelCron && !isValidBearer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceClient()

  const results = {
    total_eligible: 0,
    already_in_queue: 0,
    total_assigned: 0,
    errors: [] as string[],
  }

  // ── 1) Build eligibility pool ──────────────────────────────────────────
  // Start from the SMALLER scored/SPC sets, then validate against stages 1-3.

  // Get emails with contact_scores.score > 45
  const { data: scoredContacts } = await supabase
    .from('contact_scores')
    .select('email')
    .gt('score', 45)

  // Get emails with spc_members.lead_score > 45 OR spc_members.status = 'active'
  const { data: spcScored } = await supabase
    .from('spc_members')
    .select('email')
    .gt('lead_score', 45)

  const { data: spcActive } = await supabase
    .from('spc_members')
    .select('email')
    .eq('status', 'active')

  // Union of all candidate emails (deduplicated)
  const candidateEmails: string[] = []
  const seen = new Set<string>()
  for (const list of [scoredContacts ?? [], spcScored ?? [], spcActive ?? []]) {
    for (const row of list) {
      const email = row.email
      if (!seen.has(email)) {
        seen.add(email)
        candidateEmails.push(email)
      }
    }
  }

  if (!candidateEmails.length) {
    return NextResponse.json({
      ...results,
      errors: ['No scored or active SPC contacts found'],
    })
  }

  // Validate candidates are in stages 1-3 (batch in chunks of 200 for the IN filter)
  const eligibleEmails: string[] = []
  const BATCH = 200
  for (let i = 0; i < candidateEmails.length; i += BATCH) {
    const batch = candidateEmails.slice(i, i + BATCH)
    const { data: matched } = await supabase
      .from('value_ladder_contacts')
      .select('buyer_email')
      .in('buyer_email', batch)
      .in('current_stage', [1, 2, 3])

    for (const m of matched ?? []) {
      eligibleEmails.push(m.buyer_email)
    }
  }

  if (!eligibleEmails.length) {
    return NextResponse.json({
      ...results,
      errors: ['No eligible contacts in stages 1-3 with score > 45 or active SPC'],
    })
  }

  results.total_eligible = eligibleEmails.length

  // ── 2) Exclude contacts already in setter_daily_queue (any status, any date) ──
  // A contact only enters the queue once in its lifetime.
  const { data: existingQueue } = await supabase
    .from('setter_daily_queue')
    .select('contact_email')

  const alreadyInQueue = new Set(
    (existingQueue ?? []).map((r) => r.contact_email),
  )

  results.already_in_queue = alreadyInQueue.size

  const freshPool = eligibleEmails.filter((email) => !alreadyInQueue.has(email))

  // ── 3) Insert all new contacts for Juan Diego ──────────────────────────
  if (freshPool.length > 0) {
    const now = new Date().toISOString()
    const today = now.slice(0, 10)

    const toInsert = freshPool.map((email) => ({
      contact_email: email,
      setter_name: SETTER_NAME,
      assigned_date: today,
      status: 'not_contacted',
      status_updated_at: now,
    }))

    const { error: insertErr } = await supabase
      .from('setter_daily_queue')
      .upsert(toInsert, { onConflict: 'contact_email,assigned_date' })

    if (insertErr) {
      results.errors.push(insertErr.message)
    } else {
      results.total_assigned = toInsert.length
    }
  }

  return NextResponse.json(results)
}
