import { createClient } from '@supabase/supabase-js'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') || ''
  const view = searchParams.get('view')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Return distinct active cohorts
  if (view === 'cohorts') {
    const { data, error } = await supabase
      .from('pwu_students')
      .select('cohort')
      .eq('status', 'active')
      .not('cohort', 'is', null)
      .order('cohort', { ascending: true })

    if (error) return Response.json({ error: error.message }, { status: 500 })

    const unique = Array.from(new Set((data || []).map(r => r.cohort as string)))
    return Response.json(unique)
  }

  let query = supabase
    .from('pwu_students')
    .select('id, first_name, last_name, email, type')
    .eq('status', 'active')
    .order('first_name', { ascending: true })
    .limit(20)

  if (search.length > 0) {
    query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`)
  }

  const { data, error } = await query

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data ?? [])
}
