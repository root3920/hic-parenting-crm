import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// GET /api/team-members?role=closer&active=true
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const role = searchParams.get('role')
  const active = searchParams.get('active')

  const supabase = getServiceClient()
  let q = supabase.from('team_members').select('*').order('name')

  if (role) q = q.eq('role', role)
  if (active !== null && active !== undefined && active !== '') {
    q = q.eq('active', active === 'true')
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/team-members — admin only
export async function POST(req: NextRequest) {
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await userSupabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { name, email, role } = body
  if (!name || !role) {
    return NextResponse.json({ error: 'Name and role are required' }, { status: 400 })
  }

  const validRoles = ['closer', 'setter', 'csm_spc', 'csm_ht']
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('team_members')
    .insert({ name: name.trim(), email: email?.trim() || null, role })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
