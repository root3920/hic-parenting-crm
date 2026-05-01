import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

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

// GET: fetch all months for a year
export async function GET(req: NextRequest) {
  const user = await verifyAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const year = req.nextUrl.searchParams.get('year')
  if (!year) {
    return NextResponse.json({ error: 'Missing year param' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('finance_monthly')
    .select('*')
    .gte('month_date', `${year}-01-01`)
    .lte('month_date', `${year}-12-31`)
    .order('month_date')

  if (error) {
    console.error('[API finance/monthly] GET error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data || [])
}

// POST: ensure all 12 months exist for a year
export async function POST(req: NextRequest) {
  const user = await verifyAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { year } = await req.json()
  if (!year) {
    return NextResponse.json({ error: 'Missing year' }, { status: 400 })
  }

  const supabase = getServiceClient()

  // Check which months already exist
  const { data: existing } = await supabase
    .from('finance_monthly')
    .select('month_date')
    .gte('month_date', `${year}-01-01`)
    .lte('month_date', `${year}-12-31`)

  const existingSet = new Set((existing || []).map((r: { month_date: string }) => r.month_date))
  const toCreate: { month_date: string }[] = []

  for (let i = 1; i <= 12; i++) {
    const md = `${year}-${String(i).padStart(2, '0')}-01`
    if (!existingSet.has(md)) {
      toCreate.push({ month_date: md })
    }
  }

  if (toCreate.length > 0) {
    const { error } = await supabase.from('finance_monthly').insert(toCreate)
    if (error) {
      console.error('[API finance/monthly] Insert error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  // Return all 12 months
  const { data: all } = await supabase
    .from('finance_monthly')
    .select('*')
    .gte('month_date', `${year}-01-01`)
    .lte('month_date', `${year}-12-31`)
    .order('month_date')

  return NextResponse.json(all || [])
}

export async function PATCH(req: NextRequest) {
  const user = await verifyAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { id, updates } = body
  if (!id || !updates || typeof updates !== 'object') {
    return NextResponse.json({ error: 'Missing id or updates' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('finance_monthly')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[API finance/monthly] Update error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

// PUT: upsert by month_date (create if not exists, update field)
export async function PUT(req: NextRequest) {
  const user = await verifyAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { month_date, field, value } = await req.json()
  if (!month_date || !field) {
    return NextResponse.json({ error: 'Missing month_date or field' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('finance_monthly')
    .upsert(
      { month_date, [field]: value },
      { onConflict: 'month_date' }
    )
    .select()
    .single()

  if (error) {
    console.error('[API finance/monthly] Upsert error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
