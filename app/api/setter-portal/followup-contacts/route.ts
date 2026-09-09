import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function getProfile() {
  const sb = await createServerSupabaseClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data } = await sb
    .from('profiles')
    .select('role, setter_name, full_name')
    .eq('id', user.id)
    .single()
  return data
}

// GET — list followup contacts with nested events
export async function GET(req: NextRequest) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = profile.role === 'admin'
  const isSetter = profile.role === 'setter'
  if (!isAdmin && !isSetter) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const setterName = profile.setter_name || profile.full_name || ''
  const statusFilter = req.nextUrl.searchParams.get('status') || 'active'

  const db = svc()

  let query = db
    .from('setter_followup_contacts')
    .select('*, setter_followup_events(*)')
    .eq('status', statusFilter)
    .order('added_at', { ascending: false })

  if (!isAdmin) {
    query = query.eq('setter_name', setterName)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sort events chronologically within each contact
  const contacts = (data || []).map((c: Record<string, unknown>) => ({
    ...c,
    setter_followup_events: ((c.setter_followup_events as Record<string, unknown>[]) || []).sort(
      (a: Record<string, unknown>, b: Record<string, unknown>) =>
        new Date(a.followup_date as string).getTime() - new Date(b.followup_date as string).getTime(),
    ),
  }))

  return NextResponse.json({ contacts })
}

// POST — create a new followup contact
export async function POST(req: NextRequest) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = profile.role === 'admin'
  const isSetter = profile.role === 'setter'
  if (!isAdmin && !isSetter) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const setterName = profile.setter_name || profile.full_name || ''
  const body = await req.json()
  const { full_name, email, phone, reason } = body

  if (!full_name || !reason) {
    return NextResponse.json({ error: 'full_name and reason are required' }, { status: 400 })
  }

  const db = svc()
  const { data, error } = await db
    .from('setter_followup_contacts')
    .insert({
      full_name,
      email: email || null,
      phone: phone || null,
      setter_name: setterName,
      reason,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
