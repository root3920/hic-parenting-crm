import type { SupabaseClient } from '@supabase/supabase-js'

const STATUS_PRIORITY = ['New', 'Contacted', 'Engaged', 'Call Proposed', 'Call Booked', 'Enrolled']

export interface ContactSyncData {
  email: string
  full_name?: string
  phone?: string
  ghl_id?: string
  status?: string
  tags?: string[]
  is_spc_member?: boolean
  is_spc_trial?: boolean
  is_pwu_student?: boolean
  is_pwu_graduate?: boolean
  spc_status?: string
  pwu_cohort?: string
  source?: string
}

export async function syncContact(supabase: SupabaseClient, data: ContactSyncData) {
  if (!data.email) return

  const { data: existing } = await supabase
    .from('contacts')
    .select('id, status, tags, is_spc_member, is_spc_trial, is_pwu_student, is_pwu_graduate, full_name, phone, ghl_id, spc_status, pwu_cohort')
    .eq('email', data.email)
    .maybeSingle()

  // Merge tags (deduplicate)
  const currentTags: string[] = existing?.tags || []
  const newTags: string[] = data.tags || []
  const mergedTags = Array.from(new Set([...currentTags, ...newTags]))

  // Status priority — never downgrade
  const currentPriority = STATUS_PRIORITY.indexOf(existing?.status || 'New')
  const newPriority = STATUS_PRIORITY.indexOf(data.status || 'New')
  const finalStatus = newPriority > currentPriority ? data.status : (existing?.status || 'New')

  const updates = {
    full_name: data.full_name || existing?.full_name || 'Unknown',
    phone: data.phone || existing?.phone || null,
    ghl_id: data.ghl_id || existing?.ghl_id || null,
    status: finalStatus,
    tags: mergedTags,
    is_spc_member: data.is_spc_member ?? existing?.is_spc_member ?? false,
    is_spc_trial: data.is_spc_trial ?? existing?.is_spc_trial ?? false,
    is_pwu_student: data.is_pwu_student ?? existing?.is_pwu_student ?? false,
    is_pwu_graduate: data.is_pwu_graduate ?? existing?.is_pwu_graduate ?? false,
    spc_status: data.spc_status || existing?.spc_status || null,
    pwu_cohort: data.pwu_cohort || existing?.pwu_cohort || null,
    source: data.source || null,
    updated_at: new Date().toISOString(),
  }

  if (existing) {
    await supabase.from('contacts').update(updates).eq('id', existing.id)
  } else {
    await supabase.from('contacts').insert({
      email: data.email,
      ...updates,
    })
  }
}
