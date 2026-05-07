import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { syncContact } from '@/lib/contacts-sync'

const SYNC_SECRET = 'hic_sync_2026'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-sync-secret')
  if (secret !== SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Sync SPC members
  const { data: spcMembers } = await supabase
    .from('spc_members')
    .select('name, email, phone, status, plan')

  let spcCount = 0
  for (const member of spcMembers || []) {
    if (!member.email) continue
    await syncContact(supabase, {
      email: member.email,
      full_name: member.name,
      phone: member.phone,
      status: member.status === 'active' ? 'Enrolled' : 'Engaged',
      tags: member.status === 'trial' ? ['SPC Trial'] : ['SPC Member'],
      is_spc_member: member.status === 'active',
      is_spc_trial: member.status === 'trial',
      spc_status: member.status,
    })
    spcCount++
  }

  // Sync PWU students
  const { data: students } = await supabase
    .from('pwu_students')
    .select('name, email, phone, cohort, status')

  let pwuCount = 0
  for (const student of students || []) {
    if (!student.email) continue
    const cohortNum = parseInt(student.cohort)
    const isGraduate = !isNaN(cohortNum) && cohortNum < 39
    await syncContact(supabase, {
      email: student.email,
      full_name: student.name,
      phone: student.phone,
      status: 'Enrolled',
      tags: isGraduate ? ['PWU Graduate'] : ['PWU Student'],
      is_pwu_student: !isGraduate,
      is_pwu_graduate: isGraduate,
      pwu_cohort: student.cohort,
    })
    pwuCount++
  }

  return NextResponse.json({
    success: true,
    synced: { spc: spcCount, pwu: pwuCount },
  })
}
