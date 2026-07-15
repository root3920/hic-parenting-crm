import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function todayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// PATCH /api/team/setter/reports/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // Authenticate
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await userSupabase
    .from('profiles')
    .select('role, setter_name, full_name')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const isAdmin = profile.role === 'admin'
  const isSetter = profile.role === 'setter'

  if (!isAdmin && !isSetter) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const svc = getServiceClient()

  // Fetch the existing report to check ownership + date
  const { data: existing, error: fetchErr } = await svc
    .from('setter_daily_reports')
    .select('id, setter_name, date')
    .eq('id', id)
    .single()

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  }

  // Setter can only edit their own reports from today
  if (isSetter) {
    const profileName = (profile.setter_name || profile.full_name || '').trim().toLowerCase()
    const reportName = (existing.setter_name || '').trim().toLowerCase()
    if (profileName !== reportName) {
      return NextResponse.json({ error: 'You can only edit your own reports' }, { status: 403 })
    }
    const reportDate = (existing.date || '').slice(0, 10)
    if (reportDate !== todayStr()) {
      return NextResponse.json({ error: 'You can only edit today\'s reports' }, { status: 403 })
    }
  }

  const body = await req.json()

  // Only allow updating known fields
  const allowed = [
    'date', 'setter_name', 'hours_worked',
    'total_convos', 'active_conversations', 'followups',
    'inbound', 'outbound', 'no_reply', 'new_leads',
    'calls_proposed', 'calls_booked', 'calls_no_reply', 'calls_followup',
    'qual_apps', 'disqual_apps', 'waiting', 'requalified', 'disqual_reasons',
    'dq_detected', 'dq_spc_offered', 'spc_buyers',
    'performance_score', 'highs', 'lows', 'notas',
  ]

  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data, error } = await svc
    .from('setter_daily_reports')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
