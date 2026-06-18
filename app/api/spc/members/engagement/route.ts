import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET() {
  // Authenticate
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = getServiceClient()

  // Get last 4 distinct class dates
  const { data: classRows, error: classErr } = await svc
    .from('spc_class_attendance')
    .select('class_date')
    .order('class_date', { ascending: false })

  if (classErr) return NextResponse.json({ error: classErr.message }, { status: 500 })

  // Deduplicate and take last 4
  const distinctDates = Array.from(new Set((classRows ?? []).map((r) => r.class_date))).slice(0, 4)

  if (distinctDates.length === 0) {
    return NextResponse.json({ last_4_dates: [], engagement: {} })
  }

  // Get all attendance records for those dates
  const { data: attendanceRows, error: attErr } = await svc
    .from('spc_class_attendance')
    .select('member_email, class_date')
    .in('class_date', distinctDates)

  if (attErr) return NextResponse.json({ error: attErr.message }, { status: 500 })

  // Count classes per member email
  const countByEmail: Record<string, { count: number; dates: Set<string> }> = {}
  for (const row of attendanceRows ?? []) {
    const email = row.member_email.toLowerCase()
    if (!countByEmail[email]) countByEmail[email] = { count: 0, dates: new Set() }
    if (!countByEmail[email].dates.has(row.class_date)) {
      countByEmail[email].dates.add(row.class_date)
      countByEmail[email].count++
    }
  }

  // Fetch all checklists for checklist_score
  const { data: checklistRows } = await svc
    .from('spc_member_checklist')
    .select('member_email, kajabi_access, whatsapp_joined, checkin_2weeks, checkin_7days_before_trial_end, stayed_active, checkin_3months, checkin_6months, checkin_12months')

  const checklistByEmail: Record<string, { completed: number; total: number }> = {}
  const CHECKLIST_KEYS = ['kajabi_access', 'whatsapp_joined', 'checkin_2weeks', 'checkin_7days_before_trial_end', 'stayed_active', 'checkin_3months', 'checkin_6months', 'checkin_12months'] as const
  for (const row of checklistRows ?? []) {
    const email = row.member_email.toLowerCase()
    const completed = CHECKLIST_KEYS.filter((k) => row[k] === true).length
    checklistByEmail[email] = { completed, total: 8 }
  }

  // Build engagement map with checklist-aware status
  const engagement: Record<string, {
    classes_last_4: number
    engagement_status: 'at_risk' | 'low' | 'active'
    attended_dates: string[]
    checklist_completed: number
    checklist_total: number
  }> = {}

  // Collect all emails (from attendance + checklists)
  const allEmails = new Set([
    ...Object.keys(countByEmail),
    ...Object.keys(checklistByEmail),
  ])

  for (const email of Array.from(allEmails)) {
    const classData = countByEmail[email]
    const count = classData?.count ?? 0
    const dates = classData?.dates ?? new Set<string>()
    const cl = checklistByEmail[email] ?? { completed: 0, total: 8 }
    const checklistCompletion = cl.completed / cl.total

    // Updated engagement status using checklist
    let status: 'at_risk' | 'low' | 'active'
    if (checklistCompletion < 0.5 && count <= 1) {
      status = 'at_risk'
    } else if (checklistCompletion >= 0.5 && count >= 2) {
      status = 'active'
    } else {
      status = 'low'
    }

    engagement[email] = {
      classes_last_4: count,
      engagement_status: status,
      attended_dates: Array.from(dates).sort().reverse(),
      checklist_completed: cl.completed,
      checklist_total: cl.total,
    }
  }

  return NextResponse.json({
    last_4_dates: distinctDates,
    engagement,
  })
}
