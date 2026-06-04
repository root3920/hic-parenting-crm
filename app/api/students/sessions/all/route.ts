import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function verifyAuth() {
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  return user ?? null
}

// GET /api/students/sessions/all?month=YYYY-MM
export async function GET(req: NextRequest) {
  const user = await verifyAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const month = req.nextUrl.searchParams.get('month')
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Missing or invalid month param (YYYY-MM)' }, { status: 400 })
  }

  const [year, mon] = month.split('-').map(Number)
  const firstDay = new Date(year, mon - 1, 1)
  const lastDay = new Date(year, mon, 0)

  const from = firstDay.toISOString()
  const to = new Date(year, mon, 0, 23, 59, 59).toISOString()

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('coaching_sessions')
    .select('*, student:pwu_students(id, first_name, last_name, email)')
    .gte('session_date', from)
    .lte('session_date', to)
    .order('session_date')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
