import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

async function authenticate() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: NextRequest) {
  const user = await authenticate()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = serviceClient()
  const { searchParams } = request.nextUrl
  const client = searchParams.get('client')
  const coach = searchParams.get('coach')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  let query = db
    .from('growth_reports')
    .select('*')
    .order('session_date', { ascending: false })

  if (client) query = query.ilike('client_name', `%${client}%`)
  if (coach) query = query.eq('coach_name', coach)
  if (from) query = query.gte('session_date', from)
  if (to) query = query.lte('session_date', to)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const user = await authenticate()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = serviceClient()
  const body = await request.json()

  const { client_name, session_date } = body
  if (!client_name || !session_date) {
    return NextResponse.json({ error: 'client_name and session_date are required' }, { status: 400 })
  }

  const { data, error } = await db.from('growth_reports').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}
