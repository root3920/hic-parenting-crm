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

  // Build engagement map
  const engagement: Record<string, {
    classes_last_4: number
    engagement_status: 'at_risk' | 'low' | 'active'
    attended_dates: string[]
  }> = {}

  for (const [email, { count, dates }] of Object.entries(countByEmail)) {
    engagement[email] = {
      classes_last_4: count,
      engagement_status: count === 0 ? 'at_risk' : count <= 2 ? 'low' : 'active',
      attended_dates: Array.from(dates).sort().reverse(),
    }
  }

  return NextResponse.json({
    last_4_dates: distinctDates,
    engagement,
  })
}
