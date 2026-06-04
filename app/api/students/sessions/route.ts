import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function verifyAuthRole() {
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

// GET /api/students/sessions?student_id=X
export async function GET(req: NextRequest) {
  const auth = await verifyAuthRole()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const studentId = req.nextUrl.searchParams.get('student_id')
  if (!studentId) {
    return NextResponse.json({ error: 'student_id is required' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('coaching_sessions')
    .select('*')
    .eq('student_id', studentId)
    .order('session_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/students/sessions — admin, csm_ht only
export async function POST(req: NextRequest) {
  const auth = await verifyAuthRole()
  if (!auth || !['admin', 'csm_ht'].includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { student_id, session_date, duration_minutes, session_type, notes } = body

  if (!student_id || !session_date) {
    return NextResponse.json({ error: 'student_id and session_date are required' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('coaching_sessions')
    .insert({
      student_id,
      session_date,
      duration_minutes: duration_minutes ?? 60,
      session_type: session_type ?? 'individual',
      status: 'scheduled',
      notes: notes?.trim() || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
