import { createClient, SupabaseClient } from '@supabase/supabase-js'

interface ParsedContact {
  ghl_id: string | null
  full_name: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  owner: string | null
}

async function autoTagAndUpsert(supabase: SupabaseClient, contact: ParsedContact) {
  const autoTags: string[] = []
  let autoStatus = 'New'
  let is_spc_member = false
  let is_spc_trial = false
  let is_pwu_student = false
  let is_pwu_graduate = false
  let spc_status: string | null = null
  let pwu_cohort: string | null = null

  if (contact.email) {
    // Check SPC members
    const { data: spcMember } = await supabase
      .from('spc_members')
      .select('status, plan')
      .eq('email', contact.email)
      .maybeSingle()

    if (spcMember) {
      if (spcMember.status === 'active') {
        autoTags.push('SPC Member')
        autoStatus = 'Enrolled'
        is_spc_member = true
        spc_status = 'active'
      } else if (spcMember.status === 'trial') {
        autoTags.push('SPC Trial')
        autoStatus = 'Engaged'
        is_spc_trial = true
        spc_status = 'trial'
      } else if (spcMember.status === 'cancelled') {
        autoTags.push('SPC Cancelled')
        spc_status = 'cancelled'
      }
    }

    // Check PWU students
    const { data: pwuStudent } = await supabase
      .from('pwu_students')
      .select('cohort, status')
      .eq('email', contact.email)
      .maybeSingle()

    if (pwuStudent) {
      const cohortNum = parseInt(pwuStudent.cohort || '99')
      const isGraduate = !isNaN(cohortNum) && cohortNum < 39
      if (isGraduate) {
        autoTags.push('PWU Graduate')
        is_pwu_graduate = true
      } else {
        autoTags.push('PWU Student')
        is_pwu_student = true
      }
      pwu_cohort = pwuStudent.cohort || null
      if (autoStatus === 'New') autoStatus = 'Enrolled'
    }
  }

  // Merge with existing tags if contact already exists
  if (contact.email) {
    const { data: existing } = await supabase
      .from('contacts')
      .select('tags')
      .eq('email', contact.email)
      .maybeSingle()

    if (existing?.tags) {
      for (const t of existing.tags) {
        if (!autoTags.includes(t)) autoTags.push(t)
      }
    }
  }

  const { data, error } = await supabase
    .from('contacts')
    .upsert({
      ghl_id: contact.ghl_id,
      full_name: contact.full_name,
      first_name: contact.first_name || null,
      last_name: contact.last_name || null,
      email: contact.email,
      phone: contact.phone,
      owner: contact.owner,
      status: autoStatus,
      tags: autoTags,
      is_spc_member,
      is_spc_trial,
      is_pwu_student,
      is_pwu_graduate,
      spc_status,
      pwu_cohort,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'ghl_id',
      ignoreDuplicates: false,
    })
    .select()
    .single()

  return { data, error, autoTags, autoStatus }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const allParams: Record<string, string> = {}
    searchParams.forEach((value, key) => { allParams[key] = value })
    console.log('=== CONTACTS WEBHOOK GET ===')
    console.log('All params:', JSON.stringify(allParams))
    console.log('Full URL:', request.url)

    const first_name = searchParams.get('first_name') || ''
    const last_name = searchParams.get('last_name') || ''
    const email = searchParams.get('email') || null
    const phone = searchParams.get('phone') || null
    const ghl_id = searchParams.get('ID') || searchParams.get('id') || null
    const owner = searchParams.get('owner') || null
    const full_name = `${first_name} ${last_name}`.trim() || 'Unknown'

    console.log('Parsed:', { ghl_id, full_name, email, phone, owner })

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error('Missing NEXT_PUBLIC_SUPABASE_URL')
      return Response.json({ error: 'Missing Supabase URL' }, { status: 500 })
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing SUPABASE_SERVICE_ROLE_KEY')
      return Response.json({ error: 'Missing service role key' }, { status: 500 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error, autoTags, autoStatus } = await autoTagAndUpsert(supabase, {
      ghl_id, full_name, first_name, last_name, email, phone, owner,
    })

    if (error) {
      console.error('Supabase error:', JSON.stringify(error))
      return Response.json({ error: error.message, details: error }, { status: 500 })
    }

    console.log('Contact saved:', data?.id, 'autoTags:', autoTags, 'status:', autoStatus)
    return Response.json({ success: true, id: data?.id })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const stack = err instanceof Error ? err.stack : undefined
    console.error('Webhook crash:', message, stack)
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    console.log('=== CONTACTS WEBHOOK POST ===')
    console.log('Body:', JSON.stringify(body))

    const first_name = body.first_name || ''
    const last_name = body.last_name || ''
    const email = body.email || null
    const phone = body.phone || null
    const ghl_id = body.ID || body.id || body.ghl_id || null
    const owner = body.owner || null
    const full_name = `${first_name} ${last_name}`.trim() || body.full_name || 'Unknown'

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error, autoTags, autoStatus } = await autoTagAndUpsert(supabase, {
      ghl_id, full_name, first_name, last_name, email, phone, owner,
    })

    if (error) {
      console.error('Supabase error:', error)
      return Response.json({ error: error.message }, { status: 500 })
    }

    console.log('Contact saved:', data?.id, 'autoTags:', autoTags, 'status:', autoStatus)
    return Response.json({ success: true, id: data?.id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('POST crash:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
