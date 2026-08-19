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
 * GET /api/setter-portal/queue
 *
 * Returns the setter's daily queue.
 * - Setter role: returns only their own queue
 * - Admin role: returns ALL setters' queues combined
 *
 * Query params:
 *   date (optional): YYYY-MM-DD, defaults to today
 *   include_carryover (optional): if 'true', also include previous days'
 *     'not_contacted' items (carryover logic)
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

  if (!isAdmin && !isSetter) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const svc = getServiceClient()
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10)
  const includeCarryover = searchParams.get('include_carryover') !== 'false'

  const setterIdentity = profile.setter_name || profile.full_name

  // Build query for today's queue
  let query = svc
    .from('setter_daily_queue')
    .select('*')
    .eq('assigned_date', date)
    .order('created_at', { ascending: true })

  // Setter sees only their queue; admin sees all
  if (!isAdmin) {
    query = query.eq('setter_name', setterIdentity)
  }

  const { data: todayQueue, error: queueErr } = await query
  if (queueErr) {
    return NextResponse.json({ error: queueErr.message }, { status: 500 })
  }

  // Carryover: previous days' not_contacted items
  let carryoverQueue: typeof todayQueue = []
  if (includeCarryover) {
    let carryoverQuery = svc
      .from('setter_daily_queue')
      .select('*')
      .lt('assigned_date', date)
      .eq('status', 'not_contacted')
      .order('assigned_date', { ascending: false })

    if (!isAdmin) {
      carryoverQuery = carryoverQuery.eq('setter_name', setterIdentity)
    }

    const { data: carryover } = await carryoverQuery
    carryoverQueue = carryover ?? []
  }

  // Combine and deduplicate (prefer today's entry over carryover)
  const todayEmails = new Set((todayQueue ?? []).map((q) => q.contact_email))
  const allItems = [
    ...(todayQueue ?? []),
    ...carryoverQueue.filter((c) => !todayEmails.has(c.contact_email)),
  ]

  // Enrich with contact info from value_ladder_contacts
  const emails = allItems.map((q) => q.contact_email)
  let contactMap: Record<string, { buyer_name: string | null; current_stage: number; lead_status: string | null }> = {}

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
  }

  const enriched = allItems.map((item) => ({
    ...item,
    contact_name: contactMap[item.contact_email]?.buyer_name ?? null,
    current_stage: contactMap[item.contact_email]?.current_stage ?? null,
    lead_status: contactMap[item.contact_email]?.lead_status ?? null,
    is_carryover: item.assigned_date !== date,
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
    date,
  })
}

/**
 * PATCH /api/setter-portal/queue
 *
 * Update a queue item's status.
 * Body: { id: string, status: string }
 */
export async function PATCH(req: NextRequest) {
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

  if (!isAdmin && !isSetter) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { id, status } = body as { id?: string; status?: string }

  if (!id || !status) {
    return NextResponse.json({ error: 'id and status are required' }, { status: 400 })
  }

  const validStatuses = ['not_contacted', 'contacted', 'following_up', 'call_proposed', 'call_scheduled']
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const svc = getServiceClient()

  // Verify ownership for setter role
  if (!isAdmin) {
    const setterIdentity = profile.setter_name || profile.full_name
    const { data: item } = await svc
      .from('setter_daily_queue')
      .select('setter_name')
      .eq('id', id)
      .single()

    if (!item) return NextResponse.json({ error: 'Queue item not found' }, { status: 404 })
    if (item.setter_name !== setterIdentity) {
      return NextResponse.json({ error: 'Cannot update another setter\'s queue item' }, { status: 403 })
    }
  }

  const { error } = await svc
    .from('setter_daily_queue')
    .update({
      status,
      status_updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
