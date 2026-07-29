import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret')
  if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Find trial members with null trial_end_date that have joined_at
  const { data: members, error: fetchError } = await supabase
    .from('spc_members')
    .select('id, joined_at')
    .eq('provider', 'Hotmart')
    .eq('status', 'trial')
    .is('trial_end_date', null)
    .not('joined_at', 'is', null)

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  let updated = 0
  for (const m of members ?? []) {
    const joinedAt = new Date(m.joined_at)
    const trialEnd = new Date(joinedAt)
    trialEnd.setDate(trialEnd.getDate() + 30)
    const trialEndStr = trialEnd.toISOString().slice(0, 10)

    const { error } = await supabase
      .from('spc_members')
      .update({
        trial_end_date: trialEndStr,
        next_payment_date: trialEndStr,
        trial_days: 30,
      })
      .eq('id', m.id)

    if (!error) updated++
  }

  return NextResponse.json({
    success: true,
    found: members?.length ?? 0,
    updated,
  })
}
