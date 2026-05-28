import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { searchParams } = request.nextUrl
  const view = searchParams.get('view')

  // Return distinct active cohorts
  if (view === 'cohorts') {
    const { data, error } = await db
      .from('pwu_students')
      .select('cohort')
      .eq('status', 'active')
      .not('cohort', 'is', null)
      .order('cohort', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const unique = Array.from(new Set((data || []).map(r => r.cohort as string)))
    return NextResponse.json(unique)
  }

  // Return active students, optionally filtered by type
  const type = searchParams.get('type')

  let query = db
    .from('pwu_students')
    .select('id, first_name, last_name, email, type')
    .eq('status', 'active')
    .order('first_name', { ascending: true })

  if (type) query = query.eq('type', type)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
