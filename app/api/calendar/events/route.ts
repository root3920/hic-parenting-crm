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

async function verifyAuth() {
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  return user ?? null
}

// GET /api/calendar/events?month=YYYY-MM
export async function GET(req: NextRequest) {
  const user = await verifyAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const month = req.nextUrl.searchParams.get('month')
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Missing or invalid month param (YYYY-MM)' }, { status: 400 })
  }

  // Get first and last day of month, plus buffer for events spanning into/out of month
  const [year, mon] = month.split('-').map(Number)
  const firstDay = new Date(year, mon - 1, 1)
  const lastDay = new Date(year, mon, 0)

  // Get events that overlap with this month
  const from = firstDay.toISOString().split('T')[0]
  const to = lastDay.toISOString().split('T')[0]

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*, category:calendar_categories(id, name, color)')
    .lte('start_date', to)
    .gte('end_date', from)
    .order('start_date')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/calendar/events — admin only
export async function POST(req: NextRequest) {
  const admin = await verifyAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { title, description, start_date, end_date, category_id } = body

  if (!title || !start_date || !end_date) {
    return NextResponse.json({ error: 'Title, start_date, and end_date are required' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      title: title.trim(),
      description: description?.trim() || null,
      start_date,
      end_date,
      category_id: category_id || null,
    })
    .select('*, category:calendar_categories(id, name, color)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
