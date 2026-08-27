import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const JUAN_DIEGO = 'Juan Diego'

/**
 * GET /api/setter-portal/cancelled-queue
 *
 * Returns the fixed "Cancelled - No Rebook" queue for Juan Diego.
 * No date filtering, no carryover logic — just all items assigned
 * to Juan Diego in setter_daily_queue with tag-based contacts.
 *
 * Accessible by Juan Diego (setter) or admins.
 */
export async function GET(req: NextRequest) {
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await userSupabase
    .from('profiles')
    .select('role, setter_name, full_name')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  const isAdmin = profile.role === 'admin'
  const isSetter = profile.role === 'setter'
  const setterIdentity = profile.setter_name || profile.full_name

  if (!isAdmin && !isSetter) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Only Juan Diego or admins can access this queue
  if (!isAdmin && setterIdentity !== JUAN_DIEGO) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const svc = getServiceClient()

  // Fetch ALL queue items for Juan Diego (no date filter)
  const { data: queueItems, error: queueErr } = await svc
    .from('setter_daily_queue')
    .select('*')
    .eq('setter_name', JUAN_DIEGO)
    .order('created_at', { ascending: true })

  if (queueErr) {
    return NextResponse.json({ error: queueErr.message }, { status: 500 })
  }

  const items = queueItems ?? []

  // Enrich with contact info from value_ladder_contacts
  const emails = items.map((q) => q.contact_email)
  let contactMap: Record<string, { buyer_name: string | null; current_stage: number; lead_status: string | null }> = {}
  let cancelledAtMap: Record<string, string> = {}

  if (emails.length > 0) {
    const { data: contacts } = await svc
      .from('value_ladder_contacts')
      .select('buyer_email, buyer_name, current_stage, lead_status')
      .in('buyer_email', emails)

    for (const c of contacts ?? []) {
      contactMap[c.buyer_email] = {
        buyer_name: c.buyer_name,
        current_stage: c.current_stage,
        lead_status: c.lead_status,
      }
    }

    // Fetch most recent cancellation date per email from calls table
    const { data: cancelledCalls } = await svc
      .from('calls')
      .select('email, created_at')
      .in('email', emails)
      .or('appointment_status.eq.cancelled,appointment_status.eq.canceled')
      .order('created_at', { ascending: false })

    for (const call of cancelledCalls ?? []) {
      if (call.email && !cancelledAtMap[call.email]) {
        cancelledAtMap[call.email] = call.created_at
      }
    }
  }

  const enriched = items.map((item) => ({
    ...item,
    contact_name: contactMap[item.contact_email]?.buyer_name ?? null,
    current_stage: contactMap[item.contact_email]?.current_stage ?? null,
    lead_status: contactMap[item.contact_email]?.lead_status ?? null,
    cancelled_at: cancelledAtMap[item.contact_email] ?? null,
    is_carryover: false,
  }))

  // Group counts by status
  const counts = {
    not_contacted: 0,
    contacted: 0,
    following_up: 0,
    call_proposed: 0,
    call_scheduled: 0,
  }
  for (const item of enriched) {
    if (item.status in counts) {
      counts[item.status as keyof typeof counts]++
    }
  }

  return NextResponse.json({
    items: enriched,
    counts,
    total: enriched.length,
  })
}
