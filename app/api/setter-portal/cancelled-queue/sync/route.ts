import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { syncContact } from '@/lib/contacts-sync'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const JUAN_DIEGO = 'Juan Diego'
const LOOKBACK_HOURS = 48

/**
 * /api/setter-portal/cancelled-queue/sync
 *
 * Daily cron (6:40am UTC). Also callable manually via POST.
 * Scans calls cancelled in the last 48h, checks if the contact has
 * rebooked (any future Scheduled call), and if NOT:
 *   1. Upserts contacts with tag 'cancelled_no_rebook', owner Juan Diego
 *   2. Inserts into setter_daily_queue for Juan Diego (skips duplicates)
 */

// Vercel Cron Jobs send GET requests; also support POST for manual triggers
export async function GET(req: NextRequest) {
  return runSync(req)
}

export async function POST(req: NextRequest) {
  return runSync(req)
}

async function runSync(req: NextRequest) {
  // Auth: Vercel cron header, Bearer token, or admin session
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const authHeader = req.headers.get('authorization')
  const isValidBearer = authHeader === `Bearer ${process.env.CRON_SECRET}`
  const cronSecret = req.headers.get('x-cron-secret')
  const isValidCronHeader = cronSecret === process.env.CRON_SECRET

  if (!isVercelCron && !isValidBearer && !isValidCronHeader) {
    // Fallback: check if caller is admin via session
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const userSupabase = await createServerSupabaseClient()
    const { data: { user } } = await userSupabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await userSupabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const svc = getServiceClient()
  const now = new Date()
  const cutoff = new Date(now.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString()
  const todayStr = now.toISOString().slice(0, 10)

  // 1. Find all calls cancelled in the last 48h
  const { data: cancelledCalls, error: callsErr } = await svc
    .from('calls')
    .select('email, full_name, phone, start_date, created_at')
    .or('appointment_status.eq.cancelled,appointment_status.eq.canceled')
    .gte('created_at', cutoff)
    .not('email', 'is', null)

  if (callsErr) {
    return NextResponse.json({ error: callsErr.message }, { status: 500 })
  }

  if (!cancelledCalls || cancelledCalls.length === 0) {
    return NextResponse.json({ processed: 0, added: 0, skipped_has_future: 0, skipped_already_queued: 0 })
  }

  // Deduplicate by email (keep latest cancellation per email)
  const byEmail = new Map<string, typeof cancelledCalls[0]>()
  for (const call of cancelledCalls) {
    if (!call.email) continue
    const existing = byEmail.get(call.email)
    if (!existing || new Date(call.created_at) > new Date(existing.created_at)) {
      byEmail.set(call.email, call)
    }
  }

  const emails = Array.from(byEmail.keys())

  // 2. Check which of these emails have a future Scheduled call (= they rebooked)
  const { data: futureCalls } = await svc
    .from('calls')
    .select('email')
    .in('email', emails)
    .eq('status', 'Scheduled')
    .gt('start_date', now.toISOString())

  const rebookedEmails = new Set((futureCalls ?? []).map((c) => c.email))

  // 3. Check which emails are already in Juan Diego's queue
  const { data: existingQueue } = await svc
    .from('setter_daily_queue')
    .select('contact_email')
    .eq('setter_name', JUAN_DIEGO)
    .in('contact_email', emails)

  const alreadyQueued = new Set((existingQueue ?? []).map((q) => q.contact_email))

  // 4. Process each cancelled contact
  let added = 0
  let skippedHasFuture = 0
  let skippedAlreadyQueued = 0
  const errors: string[] = []

  for (const [email, call] of Array.from(byEmail.entries())) {
    if (rebookedEmails.has(email)) {
      skippedHasFuture++
      continue
    }

    if (alreadyQueued.has(email)) {
      skippedAlreadyQueued++
      continue
    }

    // Upsert contact with tag
    try {
      await syncContact(svc, {
        email,
        full_name: call.full_name || undefined,
        phone: call.phone || undefined,
        tags: ['cancelled_no_rebook'],
      })
    } catch (err) {
      errors.push(`syncContact(${email}): ${err instanceof Error ? err.message : String(err)}`)
    }

    // Update contacts.owner to Juan Diego (syncContact doesn't handle owner)
    try {
      await svc
        .from('contacts')
        .update({ owner: JUAN_DIEGO })
        .eq('email', email)
    } catch {}

    // Insert into setter_daily_queue
    const { error: insertErr } = await svc
      .from('setter_daily_queue')
      .insert({
        contact_email: email,
        setter_name: JUAN_DIEGO,
        assigned_date: todayStr,
        status: 'not_contacted',
      })

    if (insertErr) {
      // Unique constraint violation = already exists for this date, skip
      if (insertErr.code === '23505') {
        skippedAlreadyQueued++
      } else {
        errors.push(`insert queue(${email}): ${insertErr.message}`)
      }
    } else {
      added++
    }
  }

  return NextResponse.json({
    processed: byEmail.size,
    added,
    skipped_has_future: skippedHasFuture,
    skipped_already_queued: skippedAlreadyQueued,
    errors: errors.length > 0 ? errors : undefined,
  })
}
