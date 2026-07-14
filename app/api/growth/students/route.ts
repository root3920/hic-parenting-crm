import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

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

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json([], { status: 200 })
    }

    const unique = Array.from(new Set((data || []).map(r => r.cohort as string)))
    return NextResponse.json(unique)
  }

  const { data, error } = await supabase
    .from('pwu_students')
    .select('id, first_name, last_name, email, type')
    .eq('status', 'active')
    .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`)
    .order('first_name', { ascending: true })
    .limit(20)

  if (error) {
    console.error('Supabase error:', error)
    return NextResponse.json([], { status: 200 })
  }

  return NextResponse.json(data ?? [])
}
