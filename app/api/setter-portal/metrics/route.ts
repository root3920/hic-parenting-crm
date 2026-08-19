import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * GET /api/setter-portal/metrics?setter_name=X&date=YYYY-MM-DD
 *
 * Auto-calculates portal escalation metrics for a given setter + date
 * by querying setter_daily_queue.
 *
 * Date-window logic:
 *   A "status change on date D" means status_updated_at falls within
 *   [D 00:00:00 UTC, D+1 00:00:00 UTC).
 *
 * - portal_escalated: count of queue items for this setter whose
 *   status is NOT 'not_contacted' (i.e. has progressed to contacted,
 *   following_up, call_proposed, or call_scheduled) AND whose
 *   status_updated_at falls on the requested date.
 *
 * - portal_calls_scheduled: count of queue items for this setter whose
 *   status is specifically 'call_scheduled' AND whose status_updated_at
 *   falls on the requested date.
 */
export async function GET(req: NextRequest) {
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const setterName = searchParams.get('setter_name')
  const date = searchParams.get('date')

  if (!setterName || !date) {
    return NextResponse.json({ error: 'setter_name and date are required' }, { status: 400 })
  }

  const svc = getServiceClient()

  // Date window: [date 00:00:00, date+1 00:00:00) UTC
  const dayStart = `${date}T00:00:00.000Z`
  const nextDay = new Date(new Date(dayStart).getTime() + 86400000)
    .toISOString()

  // portal_escalated: status moved away from 'not_contacted' on this date
  // We look for items belonging to this setter whose status != 'not_contacted'
  // AND whose status_updated_at is within the date window.
  const { data: escalated, error: escErr } = await svc
    .from('setter_daily_queue')
    .select('id')
    .eq('setter_name', setterName)
    .neq('status', 'not_contacted')
    .gte('status_updated_at', dayStart)
    .lt('status_updated_at', nextDay)

  if (escErr) {
    return NextResponse.json({ error: escErr.message }, { status: 500 })
  }

  // portal_calls_scheduled: specifically 'call_scheduled' on this date
  const { data: scheduled, error: schedErr } = await svc
    .from('setter_daily_queue')
    .select('id')
    .eq('setter_name', setterName)
    .eq('status', 'call_scheduled')
    .gte('status_updated_at', dayStart)
    .lt('status_updated_at', nextDay)

  if (schedErr) {
    return NextResponse.json({ error: schedErr.message }, { status: 500 })
  }

  return NextResponse.json({
    portal_escalated: escalated?.length ?? 0,
    portal_calls_scheduled: scheduled?.length ?? 0,
    setter_name: setterName,
    date,
  })
}
