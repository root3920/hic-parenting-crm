import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(request: Request) {
  const body = await request.json()

  const { client_name, session_date, coach_name } = body
  if (!client_name || !session_date || !coach_name) {
    return NextResponse.json(
      { error: 'client_name, coach_name, and session_date are required' },
      { status: 400 }
    )
  }

  const { data, error } = await supabaseAdmin
    .from('growth_reports')
    .insert(body)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json(data, { status: 201 })
}
