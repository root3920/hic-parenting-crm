import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const VALID_STATUSES = ['pending', 'in_progress', 'resolved', 'closed'] as const
const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const

/**
 * GET /api/it-tickets/[id]
 * Returns ticket + events. Only owner or admin.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await userSupabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  const svc = getServiceClient()

  const { data: ticket, error } = await svc
    .from('it_tickets')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !ticket)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Check access
  if (profile.role !== 'admin' && ticket.requester_id !== user.id)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Fetch events
  const { data: events } = await svc
    .from('it_ticket_events')
    .select('*')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true })

  // Generate signed URLs for attachments
  const signedUrls: string[] = []
  if (ticket.attachment_urls?.length) {
    for (const path of ticket.attachment_urls) {
      const { data } = await svc.storage
        .from('it-ticket-attachments')
        .createSignedUrl(path, 3600) // 1 hour
      signedUrls.push(data?.signedUrl ?? '')
    }
  }

  return NextResponse.json({
    ticket: { ...ticket, signed_attachment_urls: signedUrls },
    events: events ?? [],
  })
}

/**
 * PATCH /api/it-tickets/[id]
 * Admin only. Accepts status, priority, admin_notes.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await userSupabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
  if (profile.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const svc = getServiceClient()
  const body = await req.json()
  const { status, priority, admin_notes } = body as {
    status?: string
    priority?: string
    admin_notes?: string
  }

  // Get current ticket
  const { data: ticket, error: fetchErr } = await svc
    .from('it_tickets')
    .select('*')
    .eq('id', id)
    .single()
  if (fetchErr || !ticket)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = { updated_at: new Date().toISOString() }
  const events: Array<{
    ticket_id: string
    event_type: string
    from_value?: string | null
    to_value?: string | null
    actor_id: string
    actor_name: string
    actor_role: string
  }> = []

  // Status change
  if (status && status !== ticket.status) {
    if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number]))
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

    const oldStatus = ticket.status

    updates.status = status

    // Automatic timestamps
    if (status === 'in_progress' && !ticket.started_at) {
      updates.started_at = new Date().toISOString()
    }
    if (status === 'resolved') {
      updates.resolved_at = new Date().toISOString()
    }
    if (status === 'closed') {
      updates.closed_at = new Date().toISOString()
      if (!ticket.resolved_at) {
        updates.resolved_at = new Date().toISOString()
      }
    }
    // Reopen: clear resolved/closed timestamps
    if ((oldStatus === 'resolved' || oldStatus === 'closed') &&
        (status === 'pending' || status === 'in_progress')) {
      updates.resolved_at = null
      updates.closed_at = null
    }

    events.push({
      ticket_id: id,
      event_type: 'status_changed',
      from_value: oldStatus,
      to_value: status,
      actor_id: user.id,
      actor_name: profile.full_name,
      actor_role: profile.role,
    })
  }

  // Priority change
  if (priority && priority !== ticket.priority) {
    if (!VALID_PRIORITIES.includes(priority as typeof VALID_PRIORITIES[number]))
      return NextResponse.json({ error: 'Invalid priority' }, { status: 400 })

    events.push({
      ticket_id: id,
      event_type: 'priority_changed',
      from_value: ticket.priority,
      to_value: priority,
      actor_id: user.id,
      actor_name: profile.full_name,
      actor_role: profile.role,
    })
    updates.priority = priority
  }

  // Admin notes change
  if (admin_notes !== undefined && admin_notes !== ticket.admin_notes) {
    events.push({
      ticket_id: id,
      event_type: 'notes_updated',
      from_value: ticket.admin_notes,
      to_value: admin_notes,
      actor_id: user.id,
      actor_name: profile.full_name,
      actor_role: profile.role,
    })
    updates.admin_notes = admin_notes
  }

  // Apply updates
  const { error: updateErr } = await svc
    .from('it_tickets')
    .update(updates)
    .eq('id', id)

  if (updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Insert events
  if (events.length > 0) {
    await svc.from('it_ticket_events').insert(events)
  }

  return NextResponse.json({ ok: true })
}
