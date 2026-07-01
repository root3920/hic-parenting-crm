import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get('search') ?? ''
  const view = request.nextUrl.searchParams.get('view')

  // Return distinct active cohorts
  if (view === 'cohorts') {
    const { data, error } = await supabaseAdmin
      .from('pwu_students')
      .select('cohort')
      .eq('status', 'active')
      .not('cohort', 'is', null)
      .order('cohort', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const unique = Array.from(new Set((data || []).map(r => r.cohort as string)))
    return NextResponse.json(unique)
  }

  // Return ALL active students filtered by search (no type filter)
  let query = supabaseAdmin
    .from('pwu_students')
    .select('id, first_name, last_name, email, type')
    .eq('status', 'active')
    .order('first_name', { ascending: true })
    .limit(20)

  if (search) {
    const parts = search.trim().split(/\s+/)
    if (parts.length >= 2) {
      // Full-name search: match first AND last name separately
      query = query
        .ilike('first_name', `%${parts[0]}%`)
        .ilike('last_name', `%${parts.slice(1).join(' ')}%`)
    } else {
      const pattern = `%${search}%`
      query = query.or(
        `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`
      )
    }
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
