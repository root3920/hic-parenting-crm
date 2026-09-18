import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// PATCH — update contact status (responded / closed)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const sb = await createServerSupabaseClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await sb
    .from('profiles')
    .select('role, setter_name, full_name')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const isAdmin = profile.role === 'admin'
  const isSetter = profile.role === 'setter'
  if (!isAdmin && !isSetter) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { status } = body

  if (!status || !['active', 'responded', 'closed'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const db = svc()

  // Verify ownership for non-admins
  if (!isAdmin) {
    const setterName = profile.setter_name || profile.full_name || ''
    const { data: existing } = await db
      .from('setter_followup_contacts')
      .select('setter_name')
      .eq('id', id)
      .single()
    if (!existing || existing.setter_name !== setterName) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const update: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  }

  if (status === 'responded') {
    update.responded_at = new Date().toISOString()
  }

  const { data, error } = await db
    .from('setter_followup_contacts')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Update returned no data' }, { status: 500 })
  return NextResponse.json(data)
}
