import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ROWS = [
  { rep_name: 'Mariana Llano', date: '2026-03-30', new_members: 1, welcome_sent: 1, new_members_introduced: 0, support_messages: 0, checkin_active_inactive: 0, checkins_sent: 7, checkins_responded: 0, questions_answered_24h: 1, referrals_generated: 0, community_energy: 3, performance_score: 8 },
  { rep_name: 'Mariana Llano', date: '2026-03-31', new_members: 10, welcome_sent: 10, new_members_introduced: 2, support_messages: 0, checkin_active_inactive: 0, checkins_sent: 0, checkins_responded: 0, questions_answered_24h: 2, referrals_generated: 0, community_energy: 3, performance_score: 8 },
  { rep_name: 'Mariana Llano', date: '2026-04-01', new_members: 0, welcome_sent: 0, new_members_introduced: 0, support_messages: 0, checkin_active_inactive: 0, checkins_sent: 1, checkins_responded: 0, questions_answered_24h: 4, referrals_generated: 0, community_energy: 3, performance_score: 8 },
  { rep_name: 'Mariana Llano', date: '2026-04-02', new_members: 0, welcome_sent: 0, new_members_introduced: 0, support_messages: 0, checkin_active_inactive: 0, checkins_sent: 2, checkins_responded: 0, questions_answered_24h: 0, referrals_generated: 0, community_energy: 3, performance_score: 8 },
  { rep_name: 'Mariana Llano', date: '2026-04-06', new_members: 1, welcome_sent: 1, new_members_introduced: 0, support_messages: 0, checkin_active_inactive: 2, checkins_sent: 2, checkins_responded: 0, questions_answered_24h: 5, referrals_generated: 0, community_energy: 3, performance_score: 9 },
  { rep_name: 'Mariana Llano', date: '2026-04-07', new_members: 0, welcome_sent: 0, new_members_introduced: 0, support_messages: 0, checkin_active_inactive: 0, checkins_sent: 0, checkins_responded: 0, questions_answered_24h: 0, referrals_generated: 0, community_energy: 3, performance_score: 9 },
  { rep_name: 'Mariana Llano', date: '2026-04-08', new_members: 6, welcome_sent: 6, new_members_introduced: 0, support_messages: 0, checkin_active_inactive: 0, checkins_sent: 0, checkins_responded: 0, questions_answered_24h: 3, referrals_generated: 0, community_energy: 3, performance_score: 10 },
  { rep_name: 'Mariana Llano', date: '2026-04-09', new_members: 0, welcome_sent: 0, new_members_introduced: 2, support_messages: 0, checkin_active_inactive: 0, checkins_sent: 1, checkins_responded: 0, questions_answered_24h: 2, referrals_generated: 0, community_energy: 3, performance_score: 9 },
  { rep_name: 'Mariana Llano', date: '2026-04-10', new_members: 1, welcome_sent: 1, new_members_introduced: 0, support_messages: 0, checkin_active_inactive: 0, checkins_sent: 2, checkins_responded: 0, questions_answered_24h: 0, referrals_generated: 0, community_energy: 3, performance_score: 9 },
  { rep_name: 'Mariana Llano', date: '2026-04-13', new_members: 1, welcome_sent: 1, new_members_introduced: 0, support_messages: 0, checkin_active_inactive: 8, checkins_sent: 8, checkins_responded: 0, questions_answered_24h: 1, referrals_generated: 0, community_energy: 3, performance_score: 10 },
  { rep_name: 'Mariana Llano', date: '2026-04-14', new_members: 1, welcome_sent: 1, new_members_introduced: 0, support_messages: 0, checkin_active_inactive: 1, checkins_sent: 0, checkins_responded: 0, questions_answered_24h: 0, referrals_generated: 0, community_energy: 3, performance_score: 8 },
  { rep_name: 'Mariana Llano', date: '2026-04-15', new_members: 2, welcome_sent: 2, new_members_introduced: 0, support_messages: 0, checkin_active_inactive: 0, checkins_sent: 13, checkins_responded: 0, questions_answered_24h: 1, referrals_generated: 2, community_energy: 3, performance_score: 10 },
  { rep_name: 'Mariana Llano', date: '2026-04-16', new_members: 5, welcome_sent: 5, new_members_introduced: 0, support_messages: 0, checkin_active_inactive: 0, checkins_sent: 12, checkins_responded: 0, questions_answered_24h: 0, referrals_generated: 0, community_energy: 3, performance_score: 9 },
]

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-sync-secret')
  if (secret !== 'hic_sync_2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let inserted = 0
  let updated = 0
  const errors: string[] = []

  for (const row of ROWS) {
    // Check if report already exists for this rep+date
    const { data: existing } = await supabase
      .from('spc_performance_reports')
      .select('id')
      .eq('rep_name', row.rep_name)
      .eq('date', row.date)
      .maybeSingle()

    const record = {
      ...row,
      active_members_count: 0,
      total_members_count: 0,
      members_participated: 0,
      avg_daily_messages: 0,
      conversation_quality: 3,
      trials_expiring_today: 0,
      trials_converted: 0,
      trials_contacted: 0,
      cancellation_requests: 0,
      cancellations_retained: 0,
      questions_total: 0,
      retention_contacts: 0,
      successfully_retained: 0,
      checkin_after_cancellation: 0,
      failed_purchase_contact: 0,
    }

    if (existing) {
      const { error } = await supabase
        .from('spc_performance_reports')
        .update(record)
        .eq('id', existing.id)
      if (error) errors.push(`Update ${row.date}: ${error.message}`)
      else updated++
    } else {
      const { error } = await supabase
        .from('spc_performance_reports')
        .insert(record)
      if (error) errors.push(`Insert ${row.date}: ${error.message}`)
      else inserted++
    }
  }

  return NextResponse.json({ inserted, updated, total: ROWS.length, errors: errors.length > 0 ? errors : undefined })
}
