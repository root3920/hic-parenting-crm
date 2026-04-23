import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getCanonicalProduct } from '@/lib/products'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  // Step 1: Get active members
  const { data: activeMembers, error: membersErr } = await supabase
    .from('spc_members')
    .select('id, email, status, converted_from_trial')
    .eq('status', 'active')

  if (membersErr) {
    return NextResponse.json({ error: membersErr.message }, { status: 500 })
  }

  const sampleMemberEmails = (activeMembers ?? []).slice(0, 10).map((m) => m.email)

  // Step 2: Check what offer_title values exist for SPC-like products
  const { data: spcTitles } = await supabase
    .from('transactions')
    .select('offer_title')
    .or('offer_title.ilike.%Secure%,offer_title.ilike.%SPC%,offer_title.ilike.%Parent%')
    .limit(50)

  const titleSet = new Set<string>()
  for (const t of spcTitles ?? []) if (t.offer_title) titleSet.add(t.offer_title)
  const uniqueTitles = Array.from(titleSet)

  // Step 3: Check zero-cost transactions
  const { data: zeroCostTx } = await supabase
    .from('transactions')
    .select('buyer_email, cost, offer_title, date')
    .eq('status', 'completed')
    .lte('cost', 0)
    .limit(20)

  // Step 4: Also check near-zero costs (some trials might be $0.01 or stored as string)
  const { data: lowCostTx } = await supabase
    .from('transactions')
    .select('buyer_email, cost, offer_title, date')
    .eq('status', 'completed')
    .lt('cost', 1)
    .limit(20)

  // Step 5: Get ALL completed SPC transactions (use canonical product matching)
  const { data: allTx, error: txErr } = await supabase
    .from('transactions')
    .select('buyer_email, date, cost, offer_title, status')
    .eq('status', 'completed')
    .order('date', { ascending: true })

  if (txErr) {
    return NextResponse.json({ error: txErr.message }, { status: 500 })
  }

  // Filter to SPC using canonical product (same logic as the SPC page)
  const spcTx = (allTx ?? []).filter(
    (tx) => getCanonicalProduct(tx.offer_title ?? '') === 'Secure Parent Collective'
  )

  // Build per-email transaction lists (lowercase)
  const txByEmail: Record<string, { date: string; cost: number; offer_title: string }[]> = {}
  for (const tx of spcTx) {
    const email = (tx.buyer_email ?? '').toLowerCase()
    if (!email) continue
    if (!txByEmail[email]) txByEmail[email] = []
    txByEmail[email].push({
      date: tx.date,
      cost: parseFloat(String(tx.cost)) || 0,
      offer_title: tx.offer_title ?? '',
    })
  }

  // Step 6: Sample transaction matches for first 5 members
  const sampleMatches: Record<string, { tx_count: number; costs: number[]; titles: string[] }> = {}
  for (const email of sampleMemberEmails.slice(0, 5)) {
    const lower = (email ?? '').toLowerCase()
    const txList = txByEmail[lower]
    sampleMatches[lower] = {
      tx_count: txList?.length ?? 0,
      costs: (txList ?? []).map((t) => t.cost),
      titles: Array.from(new Set((txList ?? []).map((t) => t.offer_title))),
    }
  }

  // Step 7: Process conversions
  let totalChecked = 0
  let confirmedConversions = 0
  let alreadyMarked = 0
  let noTrialTx = 0
  let hasTxButNoTrial = 0
  let hasTxButNoPaid = 0
  let trialAfterPaid = 0
  const conversionDetails: { email: string; trial_date: string; paid_date: string; paid_cost: number }[] = []

  for (const m of activeMembers ?? []) {
    totalChecked++
    const email = (m.email ?? '').toLowerCase()
    const txList = txByEmail[email]

    if (!txList || txList.length === 0) {
      noTrialTx++
      continue
    }

    const trialTx = txList.find((t) => t.cost === 0)
    const paidTx = txList.find((t) => t.cost > 0)

    if (!trialTx && !paidTx) { noTrialTx++; continue }
    if (!trialTx) { hasTxButNoTrial++; continue }
    if (!paidTx) { hasTxButNoPaid++; continue }
    if (trialTx.date >= paidTx.date) { trialAfterPaid++; continue }

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
      if (conversionDetails.length < 10) {
        conversionDetails.push({
          email,
          trial_date: trialTx.date,
          paid_date: paidTx.date,
          paid_cost: paidTx.cost,
        })
      }
    }
  }

  return NextResponse.json({
    total_active_checked: totalChecked,
    confirmed_conversions: confirmedConversions,
    already_marked: alreadyMarked,
    no_trial_transaction: noTrialTx,
    has_tx_but_no_trial: hasTxButNoTrial,
    has_tx_but_no_paid: hasTxButNoPaid,
    trial_after_paid: trialAfterPaid,
    conversion_details: conversionDetails,
    debug: {
      active_members_count: activeMembers?.length ?? 0,
      sample_member_emails: sampleMemberEmails,
      spc_offer_titles_found: uniqueTitles,
      spc_transactions_total: spcTx.length,
      spc_transactions_by_canonical_match: spcTx.length,
      all_transactions_fetched: (allTx ?? []).length,
      zero_cost_transactions: (zeroCostTx ?? []).map((t) => ({
        email: t.buyer_email,
        cost: t.cost,
        offer: t.offer_title,
        date: t.date,
      })),
      low_cost_transactions: (lowCostTx ?? []).map((t) => ({
        email: t.buyer_email,
        cost: t.cost,
        offer: t.offer_title,
        date: t.date,
      })),
      sample_transaction_matches: sampleMatches,
      emails_with_any_spc_tx: Object.keys(txByEmail).length,
    },
  })
}
