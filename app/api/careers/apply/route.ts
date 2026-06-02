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
    position,
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
    // Closer-specific fields
    past_sales_performance,
    best_month_cash_collected,
    sales_methodologies,
    objection_handling,
    closing_superpower,
    crm_tools_proficient,
    // CSM-specific fields
    linkedin_url,
    resume_url,
    tools_used,
    clients_managed_range,
    prioritization_answer,
    difficult_situation,
    welcome_message,
    missed_session_message,
    client_not_working_response,
    csm_responsibility,
    re_engagement_steps,
    culture_fit_why,
    excites_most,
  } = body

  if (!full_name || !email || !country_timezone || !phone || !video_url || !confirmed_job_description || !confirmed_remote) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const insertData: Record<string, unknown> = {
    position: position === 'closer' ? 'closer' : position === 'csm' ? 'csm' : 'dm_setter',
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
  }

  // Add closer-specific fields only for closer applications
  if (position === 'closer') {
    insertData.past_sales_performance = past_sales_performance
    insertData.best_month_cash_collected = best_month_cash_collected
    insertData.sales_methodologies = sales_methodologies
    insertData.objection_handling = objection_handling
    insertData.closing_superpower = closing_superpower
    insertData.crm_tools_proficient = crm_tools_proficient
  }

  // Add CSM-specific fields only for CSM applications
  if (position === 'csm') {
    insertData.linkedin_url = linkedin_url
    insertData.resume_url = resume_url
    insertData.tools_used = tools_used
    insertData.clients_managed_range = clients_managed_range
    insertData.prioritization_answer = prioritization_answer
    insertData.difficult_situation = difficult_situation
    insertData.welcome_message = welcome_message
    insertData.missed_session_message = missed_session_message
    insertData.client_not_working_response = client_not_working_response
    insertData.csm_responsibility = csm_responsibility
    insertData.re_engagement_steps = re_engagement_steps
    insertData.culture_fit_why = culture_fit_why
    insertData.excites_most = excites_most
  }

  const { error } = await supabase.from('job_applications').insert(insertData)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
