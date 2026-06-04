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

// PATCH /api/students/sessions/[id] — admin, csm_ht only
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAuthRole()
  if (!auth || !['admin', 'csm_ht'].includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const { status, notes, session_date, duration_minutes, session_type } = body

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (status !== undefined) updates.status = status
  if (notes !== undefined) updates.notes = notes?.trim() || null
  if (session_date !== undefined) updates.session_date = session_date
  if (duration_minutes !== undefined) updates.duration_minutes = duration_minutes
  if (session_type !== undefined) updates.session_type = session_type

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('coaching_sessions')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/students/sessions/[id] — admin, csm_ht only
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAuthRole()
  if (!auth || !['admin', 'csm_ht'].includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const supabase = getServiceClient()
  const { error } = await supabase.from('coaching_sessions').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
