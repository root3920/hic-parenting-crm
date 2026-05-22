import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const body = await request.json()

  const {
    full_name,
    email,
    country_timezone,
    phone,
    how_heard,
    english_level,
    has_experience,
    past_experience,
    crm_tools,
    hours_per_day,
    availability,
    available_immediately,
    why_hic,
    great_setter,
    communication_style,
    biggest_strength,
    five_year_vision,
    confirmed_job_description,
    confirmed_remote,
    additional_comments,
    video_url,
  } = body

  if (!full_name || !email || !country_timezone || !phone || !video_url || !confirmed_job_description || !confirmed_remote) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { error } = await supabase.from('job_applications').insert({
    position: 'dm_setter',
    full_name,
    email,
    country_timezone,
    phone,
    how_heard,
    english_level,
    has_experience,
    past_experience,
    crm_tools,
    hours_per_day,
    availability,
    available_immediately,
    why_hic,
    great_setter,
    communication_style,
    biggest_strength,
    five_year_vision,
    confirmed_job_description,
    confirmed_remote,
    additional_comments,
    video_url,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
