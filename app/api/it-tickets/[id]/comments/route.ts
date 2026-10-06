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
 * POST /api/it-tickets/[id]/comments
 * Owner or admin can comment. Only admin can comment on closed tickets.
 */
export async function POST(
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

  const svc = getServiceClient()
  const body = await req.json()
  const { comment } = body as { comment?: string }

  if (!comment || comment.trim().length === 0)
    return NextResponse.json({ error: 'Comentario vacío' }, { status: 400 })
  if (comment.length > 2000)
    return NextResponse.json({ error: 'Comentario demasiado largo (máx 2000 caracteres)' }, { status: 400 })

  // Get ticket
  const { data: ticket, error: fetchErr } = await svc
    .from('it_tickets')
    .select('requester_id, status')
    .eq('id', id)
    .single()

  if (fetchErr || !ticket)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Check access: only owner or admin
  const isAdmin = profile.role === 'admin'
  if (!isAdmin && ticket.requester_id !== user.id)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only admin can comment on closed tickets
  if (ticket.status === 'closed' && !isAdmin)
    return NextResponse.json({ error: 'No se puede comentar en tickets cerrados' }, { status: 403 })

  const { data: event, error: insertErr } = await svc
    .from('it_ticket_events')
    .insert({
      ticket_id: id,
      event_type: 'comment',
      comment: comment.trim(),
      actor_id: user.id,
      actor_name: profile.full_name,
      actor_role: profile.role,
    })
    .select()
    .single()

  if (insertErr)
    return NextResponse.json({ error: insertErr.message }, { status: 500 })

  // Update ticket's updated_at
  await svc.from('it_tickets').update({ updated_at: new Date().toISOString() }).eq('id', id)

  return NextResponse.json({ event }, { status: 201 })
}
