import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const body = await request.json()

  // First get the current record to access auto scores
  const { data: current, error: fetchError } = await serviceClient
    .from('dm_setter_stage2')
    .select('section1_score, section2_score')
    .eq('id', id)
    .single()

  if (fetchError || !current) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  }

  const updates: Record<string, unknown> = {}

  if (body.q13_human_score !== undefined) updates.q13_human_score = body.q13_human_score
  if (body.q14_human_score !== undefined) updates.q14_human_score = body.q14_human_score
  if (body.q15_human_score !== undefined) updates.q15_human_score = body.q15_human_score
  if (body.alerts !== undefined) updates.alerts = body.alerts

  // Calculate section 3 and final scores if all human scores provided
  const q13s = body.q13_human_score ?? null
  const q14s = body.q14_human_score ?? null
  const q15s = body.q15_human_score ?? null

  if (q13s !== null && q14s !== null && q15s !== null) {
    const section3_score = q13s + q14s + q15s
    updates.section3_score = section3_score

    const final_score = current.section1_score + current.section2_score + section3_score
    updates.final_score = final_score

    if (final_score >= 68) updates.final_label = 'Ajuste alto'
    else if (final_score >= 60) updates.final_label = 'Avanza a entrevista'
    else if (final_score >= 50) updates.final_label = 'Revisión manual'
    else updates.final_label = 'Ajuste bajo'

    updates.reviewed_by = user.email || user.id
    updates.reviewed_at = new Date().toISOString()
  }

  const { data, error } = await serviceClient
    .from('dm_setter_stage2')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json(data)
}
