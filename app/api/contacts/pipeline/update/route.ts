import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const VALID_LEAD_STATUSES = ['not_contacted', 'contacted', 'following_up', 'call_proposed', 'call_scheduled'] as const

/**
 * PATCH /api/contacts/pipeline/update
 *
 * Updates setter_assigned and/or lead_status for a contact.
 *
 * Body: { email: string, setter_assigned?: string | null, lead_status?: string | null,
 *         notes?: string | null, last_contacted_at?: string | null }
 *
 * Permissions:
 *   - Admin: can update any contact
 *   - Setter: can self-assign unassigned contacts, can edit own assigned contacts,
 *     cannot reassign contacts owned by another setter
 */
export async function PATCH(req: NextRequest) {
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get user profile for role + setter_name
  const { data: profile } = await userSupabase
    .from('profiles')
    .select('role, setter_name, full_name')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  const body = await req.json()
  const { email, setter_assigned, lead_status, notes, last_contacted_at } = body as {
    email?: string
    setter_assigned?: string | null
    lead_status?: string | null
    notes?: string | null
    last_contacted_at?: string | null
  }

  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  // Validate lead_status
  if (lead_status !== undefined && lead_status !== null && !VALID_LEAD_STATUSES.includes(lead_status as typeof VALID_LEAD_STATUSES[number])) {
    return NextResponse.json({ error: 'Invalid lead_status' }, { status: 400 })
  }

  const svc = getServiceClient()
  const isAdmin = profile.role === 'admin'

  // For setter role: enforce permission rules
  if (!isAdmin) {
    if (profile.role !== 'setter') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Determine the setter's display name
    const setterIdentity = profile.setter_name || profile.full_name

    // Fetch current contact state
    const { data: current } = await svc
      .from('value_ladder_contacts')
      .select('setter_assigned')
      .eq('buyer_email', email)
      .single()

    if (!current) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    const currentSetter = current.setter_assigned

    // Setter can only edit contacts assigned to them or unassigned contacts
    if (currentSetter && currentSetter !== setterIdentity) {
      return NextResponse.json(
        { error: 'Cannot modify a contact assigned to another setter' },
        { status: 403 },
      )
    }

    // Setter cannot reassign to someone else (only self-assign or clear)
    if (setter_assigned !== undefined && setter_assigned !== null && setter_assigned !== setterIdentity) {
      return NextResponse.json(
        { error: 'Setters can only assign contacts to themselves' },
        { status: 403 },
      )
    }
  }

  // Build update payload
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = { updated_at: new Date().toISOString() }
  if (setter_assigned !== undefined) updates.setter_assigned = setter_assigned
  if (lead_status !== undefined) updates.lead_status = lead_status
  if (notes !== undefined) updates.notes = notes
  if (last_contacted_at !== undefined) updates.last_contacted_at = last_contacted_at

  const { error } = await svc
    .from('value_ladder_contacts')
    .update(updates)
    .eq('buyer_email', email)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
