import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function verifyAuth() {
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await userSupabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  return profile ? { user, role: profile.role as string } : null
}

// GET /api/client-success/pipeline
export async function GET() {
  const auth = await verifyAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getServiceClient()

  const { data, error } = await db
    .from('onboarding_pipeline')
    .select(`
      *,
      student:pwu_students (
        id, first_name, last_name, email, phone, type, cohort, cohort_assigned_at, status
      )
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data ?? [])
}

// POST /api/client-success/pipeline — create a single pipeline record
export async function POST(req: NextRequest) {
  const auth = await verifyAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { student_id } = await req.json()
  if (!student_id) return NextResponse.json({ error: 'student_id required' }, { status: 400 })

  const db = getServiceClient()

  const { data, error } = await db
    .from('onboarding_pipeline')
    .upsert({
      student_id,
      current_step: 1,
      step1_status: 'pending',
      step2_status: 'pending',
      step3_status: 'pending',
      step4_status: 'pending',
      step5_status: 'pending',
      step6_status: 'pending',
    }, { onConflict: 'student_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
