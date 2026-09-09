import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// POST — add a follow-up event to a contact
export async function POST(req: NextRequest) {
  const sb = await createServerSupabaseClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await sb
    .from('profiles')
    .select('role, setter_name, full_name')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const isAdmin = profile.role === 'admin'
  const isSetter = profile.role === 'setter'
  if (!isAdmin && !isSetter) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const setterName = profile.setter_name || profile.full_name || ''
  const body = await req.json()
  const { contact_id, followup_date, notes } = body

  if (!contact_id) {
    return NextResponse.json({ error: 'contact_id is required' }, { status: 400 })
  }

  const db = svc()

  // Verify ownership for non-admins
  if (!isAdmin) {
    const { data: contact } = await db
      .from('setter_followup_contacts')
      .select('setter_name')
      .eq('id', contact_id)
      .single()
    if (!contact || contact.setter_name !== setterName) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const { data, error } = await db
    .from('setter_followup_events')
    .insert({
      contact_id,
      followup_date: followup_date || new Date().toISOString().slice(0, 10),
      notes: notes || null,
      created_by: setterName,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Part C: increment followups in setter_daily_reports ──────────
  const today = new Date().toISOString().slice(0, 10)

  // Try to find existing report row for this setter + today
  const { data: existing } = await db
    .from('setter_daily_reports')
    .select('id, followups')
    .eq('setter_name', setterName)
    .eq('date', today)
    .single()

  if (existing) {
    // Increment followups by 1
    await db
      .from('setter_daily_reports')
      .update({ followups: (existing.followups || 0) + 1 })
      .eq('id', existing.id)
  } else {
    // Create new report row with followups = 1, rest defaults/0
    await db
      .from('setter_daily_reports')
      .insert({ setter_name: setterName, date: today, followups: 1 })
  }

  return NextResponse.json(data, { status: 201 })
}
