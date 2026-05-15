import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function verifyAdmin() {
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await userSupabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  return profile?.role === 'admin' ? user : null
}

// PATCH /api/calendar/events/[id] — admin only
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const { title, description, start_date, end_date, category_id } = body

  const supabase = getServiceClient()
  const updates: Record<string, unknown> = {}
  if (title !== undefined) updates.title = title.trim()
  if (description !== undefined) updates.description = description?.trim() || null
  if (start_date !== undefined) updates.start_date = start_date
  if (end_date !== undefined) updates.end_date = end_date
  if (category_id !== undefined) updates.category_id = category_id || null

  const { data, error } = await supabase
    .from('calendar_events')
    .update(updates)
    .eq('id', id)
    .select('*, category:calendar_categories(id, name, color)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/calendar/events/[id] — admin only
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = getServiceClient()
  const { error } = await supabase.from('calendar_events').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
