import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// Use service role to bypass RLS on finance_commissions
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET() {
  // Verify the user is authenticated and is an admin
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: profile } = await userSupabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getServiceClient()

  // Paginated fetch to handle >1000 rows
  const pageSize = 1000
  let all: Record<string, unknown>[] = []
  let page = 0
  while (true) {
    const { data, error } = await supabase
      .from('finance_commissions')
      .select('*')
      .ilike('payment_description', '%Parenting With Understanding%')
      .order('payment_date', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)
    if (error) {
      console.error('[API finance/commissions] Error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data || data.length === 0) break
    all = [...all, ...data]
    if (data.length < pageSize) break
    page++
  }

  return NextResponse.json(all)
}

export async function PATCH(req: NextRequest) {
  // Verify the user is authenticated and is an admin
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: profile } = await userSupabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { id, field, value } = body
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const allowedFields = [
    'closer_commission_status', 'setter_commission_status',
    'closer', 'setter', 'closer_commission', 'setter_commission',
    'total_commission', 'commission_paid', 'commission_pending', 'net_total',
  ]

  // Support multi-field updates ({ id, updates: {...} }) or single-field ({ id, field, value })
  const updates: Record<string, unknown> = {}
  if (body.updates && typeof body.updates === 'object') {
    for (const [k, v] of Object.entries(body.updates)) {
      if (allowedFields.includes(k)) updates[k] = v
    }
  } else if (field && allowedFields.includes(field)) {
    updates[field] = value
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No allowed fields to update' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const { error } = await supabase
    .from('finance_commissions')
    .update(updates)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
