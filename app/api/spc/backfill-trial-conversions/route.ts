import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data: activeMembers, error: membersErr } = await supabase
    .from('spc_members')
    .select('id, email, converted_from_trial')
    .eq('status', 'active')

  if (membersErr) {
    return NextResponse.json({ error: membersErr.message }, { status: 500 })
  }

  const { data: allTx, error: txErr } = await supabase
    .from('transactions')
    .select('buyer_email, date, cost, offer_title, status')
    .eq('status', 'completed')
    .ilike('offer_title', '%Secure Parent%')
    .order('date', { ascending: true })

  if (txErr) {
    return NextResponse.json({ error: txErr.message }, { status: 500 })
  }

  // Build per-email transaction lists
  const txByEmail: Record<string, { date: string; cost: number }[]> = {}
  for (const tx of allTx ?? []) {
    const email = (tx.buyer_email ?? '').toLowerCase()
    if (!email) continue
    if (!txByEmail[email]) txByEmail[email] = []
    txByEmail[email].push({ date: tx.date, cost: parseFloat(String(tx.cost)) || 0 })
  }

  let totalChecked = 0
  let confirmedConversions = 0
  let alreadyMarked = 0
  let noTrialTx = 0

  for (const m of activeMembers ?? []) {
    totalChecked++
    const email = (m.email ?? '').toLowerCase()
    const txList = txByEmail[email]
    if (!txList) { noTrialTx++; continue }

    const trialTx = txList.find((t) => t.cost === 0)
    const paidTx = txList.find((t) => t.cost > 0)

    if (!trialTx || !paidTx || trialTx.date >= paidTx.date) {
      noTrialTx++
      continue
    }

    if (m.converted_from_trial === true) {
      alreadyMarked++
      continue
    }

    const { error } = await supabase
      .from('spc_members')
      .update({ converted_from_trial: true, converted_at: paidTx.date })
      .eq('id', m.id)

    if (error) {
      console.error(`Failed to update ${email}: ${error.message}`)
    } else {
      confirmedConversions++
    }
  }

  return NextResponse.json({
    total_active_checked: totalChecked,
    confirmed_conversions: confirmedConversions,
    already_marked: alreadyMarked,
    no_trial_transaction: noTrialTx,
  })
}
