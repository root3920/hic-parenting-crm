import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export interface SpcMemberChecklist {
  id: string
  member_email: string
  kajabi_access: boolean
  whatsapp_joined: boolean
  checkin_2weeks: boolean
  checkin_7days_before_trial_end: boolean
  stayed_active: boolean
  checkin_3months: boolean
  checkin_6months: boolean
  checkin_12months: boolean
  updated_at: string
}

const CHECKLIST_FIELDS = [
  'kajabi_access',
  'whatsapp_joined',
  'checkin_2weeks',
  'checkin_7days_before_trial_end',
  'stayed_active',
  'checkin_3months',
  'checkin_6months',
  'checkin_12months',
] as const

export async function GET(req: NextRequest) {
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const email = req.nextUrl.searchParams.get('email')?.toLowerCase().trim()
  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 })

  const svc = getServiceClient()

  // Try to fetch existing checklist
  let { data: checklist, error } = await svc
    .from('spc_member_checklist')
    .select('*')
    .eq('member_email', email)
    .single()

  if (error && error.code === 'PGRST116') {
    // Not found — create empty record
    const { data: created, error: insertErr } = await svc
      .from('spc_member_checklist')
      .insert({ member_email: email })
      .select()
      .single()

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
    checklist = created
  } else if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Auto-populate from spc_members
  const { data: member } = await svc
    .from('spc_members')
    .select('whatsapp_active, status')
    .eq('email', email)
    .single()

  if (member) {
    const autoUpdates: Record<string, boolean> = {}
    if (member.whatsapp_active && !checklist.whatsapp_joined) {
      autoUpdates.whatsapp_joined = true
    }
    if (member.status === 'active' && !checklist.stayed_active) {
      autoUpdates.stayed_active = true
    }

    if (Object.keys(autoUpdates).length > 0) {
      const { data: updated, error: upErr } = await svc
        .from('spc_member_checklist')
        .update({ ...autoUpdates, updated_at: new Date().toISOString() })
        .eq('member_email', email)
        .select()
        .single()

      if (!upErr && updated) checklist = updated
    }
  }

  return NextResponse.json({ checklist })
}

export async function PATCH(req: NextRequest) {
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const email = req.nextUrl.searchParams.get('email')?.toLowerCase().trim()
  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 })

  const body = await req.json()

  // Only allow known checklist boolean fields
  const updates: Record<string, boolean> = {}
  for (const field of CHECKLIST_FIELDS) {
    if (field in body && typeof body[field] === 'boolean') {
      updates[field] = body[field]
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const svc = getServiceClient()

  const { data: checklist, error } = await svc
    .from('spc_member_checklist')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('member_email', email)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ checklist })
}
