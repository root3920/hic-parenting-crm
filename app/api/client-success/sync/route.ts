import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function verifyAuth() {
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await userSupabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  return profile ? { user, role: profile.role as string } : null
}

// Excel records to match and update
const EXCEL_RECORDS = [
  {
    searchTerms: ['michell', 'michelle'],
    data: {
      step1_status: 'completed', step1_date: '2026-06-26',
      step2_status: 'completed', step2_date: '2026-06-26',
      step3_status: 'completed', step3_date: '2026-07-02',
      step4_status: 'completed', step4_date: '2026-07-07',
      step5_status: 'completed', step6_status: 'completed',
      current_step: 6, coach: 'Zynthia',
      notes: 'Start date Friday July 17 at 9:30 PDT',
    },
  },
  {
    searchTerms: ['melisa estrada'],
    data: {
      step1_status: 'completed', step1_date: '2026-07-01',
      step2_status: 'completed', step2_date: '2026-07-02',
      step3_status: 'completed', step3_date: '2026-07-08',
      step4_status: 'completed', step4_date: '2026-07-10',
      step5_status: 'completed', step6_status: 'completed',
      current_step: 6, coach: 'Zynthia',
      notes: 'Start date Friday July 17 at 9:30 PDT',
    },
  },
  {
    searchTerms: ['mohamed', 'manelle'],
    data: {
      step1_status: 'completed', step1_date: '2026-06-01',
      step2_status: 'completed', step2_date: '2026-06-01',
      step3_status: 'completed', step3_date: '2026-07-08',
      step4_status: 'completed', step4_date: '2026-06-10',
      step5_status: 'completed', step6_status: 'completed',
      current_step: 6, coach: 'Holly',
      notes: 'Start Date Monday July 13 at 3:00 PDT',
    },
  },
  {
    searchTerms: ['myrna ramirez'],
    data: {
      step1_status: 'completed', step1_date: '2026-06-26',
      step2_status: 'completed', step2_date: '2026-06-29',
      step3_status: 'waiting', step3_date: '2026-07-17',
      step4_status: 'completed', step4_date: '2026-07-15',
      step5_status: 'waiting', step6_status: 'waiting',
      current_step: 3, coach: 'Zintya',
      notes: 'Waiting Cohort',
    },
  },
  {
    searchTerms: ['katelyn hall'],
    data: {
      step1_status: 'completed', step1_date: '2026-07-09',
      step2_status: 'completed', step2_date: '2026-07-09',
      step3_status: 'completed', step3_date: '2026-07-13',
      step4_status: 'completed', step4_date: '2026-07-15',
      step5_status: 'completed', step6_status: 'waiting',
      current_step: 6, coach: 'Holly',
      notes: 'Start date July 24 at 2:30 PM PDT',
    },
  },
  {
    searchTerms: ['denisse velasco'],
    data: {
      step1_status: 'completed', step1_date: '2026-07-10',
      step2_status: 'completed', step2_date: '2026-07-10',
      step3_status: 'waiting', step3_date: '2026-07-21',
      step4_status: 'waiting', step5_status: 'waiting', step6_status: 'waiting',
      current_step: 3, coach: 'Zintya',
      notes: 'Q&A pending',
    },
  },
  {
    searchTerms: ['ana castillo'],
    data: {
      step1_status: 'completed', step1_date: '2026-05-11',
      step2_status: 'waiting', step3_status: 'waiting',
      step4_status: 'waiting', step5_status: 'waiting', step6_status: 'waiting',
      current_step: 2,
      notes: 'canceled payment plan and not responding as of 7/10/26',
    },
  },
  {
    searchTerms: ['fatima'],
    data: {
      step1_status: 'completed', step1_date: '2026-04-17',
      step2_status: 'completed', step2_date: '2026-04-20',
      step3_status: 'waiting',
      step4_status: 'completed', step4_date: '2026-04-24',
      step5_status: 'waiting', step6_status: 'waiting',
      current_step: 5,
      notes: 'Paused until August',
    },
  },
  {
    searchTerms: ['christian cespedes'],
    data: {
      step1_status: 'completed', step1_date: '2026-03-09',
      step2_status: 'completed', step3_status: 'waiting',
      step4_status: 'waiting', step5_status: 'waiting', step6_status: 'waiting',
      current_step: 3,
      notes: 'Paused - Follow up again on Monday 20',
    },
  },
]

// POST /api/client-success/sync
export async function POST() {
  const auth = await verifyAuth()
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getServiceClient()

  // ── PART A: Auto-add missing active students ──
  const { data: activeStudents, error: studentsErr } = await db
    .from('pwu_students')
    .select('id')
    .eq('status', 'active')

  if (studentsErr) return NextResponse.json({ error: studentsErr.message }, { status: 400 })

  let synced_new = 0
  if (activeStudents && activeStudents.length > 0) {
    const rows = activeStudents.map((s) => ({
      student_id: s.id,
      current_step: 1,
      step1_status: 'pending',
      step2_status: 'pending',
      step3_status: 'pending',
      step4_status: 'pending',
      step5_status: 'pending',
      step6_status: 'pending',
    }))

    const { data: upserted } = await db
      .from('onboarding_pipeline')
      .upsert(rows, { onConflict: 'student_id', ignoreDuplicates: true })
      .select('id')

    synced_new = upserted?.length ?? 0
  }

  // ── PART B: Match Excel data by name ──
  const matched_and_updated: string[] = []
  const skipped_no_match: string[] = []
  const skipped_multiple_matches: string[] = []

  for (const record of EXCEL_RECORDS) {
    const label = record.searchTerms.join(' / ')
    let matchedStudentId: string | null = null

    for (const term of record.searchTerms) {
      const { data: matches } = await db
        .from('pwu_students')
        .select('id, first_name, last_name')
        .ilike('first_name', `%${term}%`)

      // Also try full name match
      const { data: fullNameMatches } = await db
        .from('pwu_students')
        .select('id, first_name, last_name')
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`)

      // Combine and deduplicate
      const allMatches = new Map<string, { id: string; first_name: string; last_name: string | null }>()
      for (const m of [...(matches ?? []), ...(fullNameMatches ?? [])]) {
        const fullName = `${m.first_name} ${m.last_name ?? ''}`.toLowerCase().trim()
        if (fullName.includes(term.toLowerCase()) || m.first_name.toLowerCase().includes(term.toLowerCase())) {
          allMatches.set(m.id, m)
        }
      }

      if (allMatches.size === 1) {
        matchedStudentId = Array.from(allMatches.values())[0].id
        break
      }
    }

    if (!matchedStudentId) {
      // Try a broader search for multi-word terms
      for (const term of record.searchTerms) {
        if (!term.includes(' ')) continue
        const parts = term.split(' ')
        const { data: matches } = await db
          .from('pwu_students')
          .select('id, first_name, last_name')
          .ilike('first_name', `%${parts[0]}%`)
          .ilike('last_name', `%${parts[parts.length - 1]}%`)

        if (matches && matches.length === 1) {
          matchedStudentId = matches[0].id
          break
        } else if (matches && matches.length > 1) {
          skipped_multiple_matches.push(label)
          break
        }
      }
    }

    if (!matchedStudentId) {
      if (!skipped_multiple_matches.includes(label)) {
        skipped_no_match.push(label)
      }
      continue
    }

    // Ensure pipeline record exists for this student
    await db
      .from('onboarding_pipeline')
      .upsert({
        student_id: matchedStudentId,
        current_step: 1,
        step1_status: 'pending', step2_status: 'pending',
        step3_status: 'pending', step4_status: 'pending',
        step5_status: 'pending', step6_status: 'pending',
      }, { onConflict: 'student_id', ignoreDuplicates: true })

    // Update with Excel data
    const { error: updateErr } = await db
      .from('onboarding_pipeline')
      .update({ ...record.data, updated_at: new Date().toISOString() })
      .eq('student_id', matchedStudentId)

    if (!updateErr) {
      matched_and_updated.push(label)
    }
  }

  return NextResponse.json({
    synced_new,
    matched_and_updated,
    skipped_no_match,
    skipped_multiple_matches,
  })
}
