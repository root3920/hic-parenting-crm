import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const CONTACTS_PER_SETTER = 20
const RECYCLE_STALE_DAYS = 3

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * POST /api/setter-portal/daily-assignment
 *
 * Daily cron (6:10am) that assigns up to 20 contacts per active setter.
 *
 * Eligibility: pipeline stage 1-3 AND (contact_scores.score > 45 OR
 * spc_members.lead_score > 45 OR spc_members.status = 'active').
 *
 * Excludes contacts assigned to any setter in the last 30 days that are
 * still 'not_contacted' or 'contacted' (actively being worked).
 *
 * Recycling: if the fresh pool runs low, recycle contacts previously assigned
 * to the SAME setter whose status is still 'not_contacted' or stuck in
 * 'following_up' for more than RECYCLE_STALE_DAYS days.
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
  const today = new Date().toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const staleCutoff = new Date(Date.now() - RECYCLE_STALE_DAYS * 86400000).toISOString()

  const results = {
    setters_processed: 0,
    total_assigned: 0,
    total_recycled: 0,
    errors: [] as string[],
  }

  // ── 1) Get active setters ───────────────────────────────────────────────
  const { data: setters, error: settersErr } = await supabase
    .from('team_members')
    .select('name')
    .eq('role', 'setter')
    .eq('active', true)

  if (settersErr || !setters?.length) {
    return NextResponse.json({
      ...results,
      errors: [settersErr?.message || 'No active setters found'],
    })
  }

  // ── 2) Build eligibility pool ───────────────────────────────────────────
  // Start from the SMALLER scored/SPC sets, then validate against stages 1-3.
  // This avoids the Supabase 1000-row default limit on the large contacts table.

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

  // ── 3) Get contacts currently "in progress" (assigned in last 30 days, still active) ──
  const { data: recentAssignments } = await supabase
    .from('setter_daily_queue')
    .select('contact_email, setter_name, status')
    .gte('assigned_date', thirtyDaysAgo)
    .in('status', ['not_contacted', 'contacted'])

  const inProgressEmails = new Set(
    (recentAssignments ?? []).map((a) => a.contact_email),
  )

  // ── 4) Get contacts already assigned TODAY (to avoid duplicates across setters) ──
  const { data: todayAssignments } = await supabase
    .from('setter_daily_queue')
    .select('contact_email')
    .eq('assigned_date', today)

  const todayEmails = new Set(
    (todayAssignments ?? []).map((a) => a.contact_email),
  )

  // Fresh pool: eligible, not in progress, not already assigned today
  const freshPool = eligibleEmails.filter(
    (email) => !inProgressEmails.has(email) && !todayEmails.has(email),
  )

  // Shuffle the fresh pool for fair distribution
  for (let i = freshPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[freshPool[i], freshPool[j]] = [freshPool[j], freshPool[i]]
  }

  let freshIndex = 0

  // ── 5) Assign contacts per setter ───────────────────────────────────────
  for (const setter of setters) {
    const setterName = setter.name
    let assigned = 0
    const toInsert: Array<{
      contact_email: string
      setter_name: string
      assigned_date: string
      status: string
      status_updated_at: string
    }> = []

    // 5a) Pull from fresh pool
    while (assigned < CONTACTS_PER_SETTER && freshIndex < freshPool.length) {
      const email = freshPool[freshIndex++]
      if (todayEmails.has(email)) continue
      toInsert.push({
        contact_email: email,
        setter_name: setterName,
        assigned_date: today,
        status: 'not_contacted',
        status_updated_at: new Date().toISOString(),
      })
      todayEmails.add(email)
      assigned++
    }

    // 5b) Recycle: contacts previously assigned to THIS setter that are stale
    if (assigned < CONTACTS_PER_SETTER) {
      // Stale 'not_contacted' (never actioned, any date)
      const { data: staleNotContacted } = await supabase
        .from('setter_daily_queue')
        .select('contact_email')
        .eq('setter_name', setterName)
        .eq('status', 'not_contacted')
        .lt('assigned_date', today)
        .limit(50)

      for (const row of staleNotContacted ?? []) {
        if (todayEmails.has(row.contact_email)) continue
        toInsert.push({
          contact_email: row.contact_email,
          setter_name: setterName,
          assigned_date: today,
          status: 'not_contacted',
          status_updated_at: new Date().toISOString(),
        })
        todayEmails.add(row.contact_email)
        assigned++
        results.total_recycled++
        if (assigned >= CONTACTS_PER_SETTER) break
      }

      // Stale 'following_up' stuck for > RECYCLE_STALE_DAYS
      if (assigned < CONTACTS_PER_SETTER) {
        const { data: staleFollowUp } = await supabase
          .from('setter_daily_queue')
          .select('contact_email')
          .eq('setter_name', setterName)
          .eq('status', 'following_up')
          .lt('status_updated_at', staleCutoff)
          .limit(50)

        for (const row of staleFollowUp ?? []) {
          if (todayEmails.has(row.contact_email)) continue
          toInsert.push({
            contact_email: row.contact_email,
            setter_name: setterName,
            assigned_date: today,
            status: 'following_up',
            status_updated_at: new Date().toISOString(),
          })
          todayEmails.add(row.contact_email)
          assigned++
          results.total_recycled++
          if (assigned >= CONTACTS_PER_SETTER) break
        }
      }
    }

    // 5c) Insert today's assignments (upsert to handle re-runs)
    if (toInsert.length > 0) {
      const { error: insertErr } = await supabase
        .from('setter_daily_queue')
        .upsert(toInsert, { onConflict: 'contact_email,assigned_date' })

      if (insertErr) {
        results.errors.push(`${setterName}: ${insertErr.message}`)
      } else {
        results.total_assigned += toInsert.length
      }
    }

    results.setters_processed++
  }

  return NextResponse.json(results)
}
