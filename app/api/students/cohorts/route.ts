import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function verifyAuth() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user ?? null
}

export async function GET() {
  const user = await verifyAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getServiceClient()
  const { data, error } = await db
    .from('pwu_cohorts')
    .select('cohort_number')
    .order('cohort_number', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const cohorts = (data ?? []).map((r) => r.cohort_number as string)
  return NextResponse.json(cohorts)
}

export async function POST(request: Request) {
  const user = await verifyAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { cohort_number } = await request.json()
  if (!cohort_number || typeof cohort_number !== 'string') {
    return NextResponse.json({ error: 'cohort_number is required' }, { status: 400 })
  }

  const db = getServiceClient()
  const { error } = await db
    .from('pwu_cohorts')
    .insert({ cohort_number: cohort_number.trim() })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Cohort already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ cohort_number: cohort_number.trim() })
}
