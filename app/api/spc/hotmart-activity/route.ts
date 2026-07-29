import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [
    trialsRes,
    cancellationsRes,
    refundsRes,
    cartAllRes,
    failuresRes,
    convertedTrialsRes,
    recoveredCartsRes,
    activeHotmartEmails,
    allTransactions,
  ] = await Promise.all([
    // Hotmart trials
    supabase
      .from('spc_members')
      .select('id', { count: 'exact', head: true })
      .eq('provider', 'Hotmart')
      .eq('status', 'trial'),
    // All Hotmart cancellations (with details)
    supabase
      .from('spc_cancellations')
      .select('*')
      .eq('provider', 'Hotmart')
      .order('cancelled_at', { ascending: false })
      .limit(50),
    // Hotmart refunds count (all time, for reference)
    supabase
      .from('spc_cancellations')
      .select('id', { count: 'exact', head: true })
      .eq('provider', 'Hotmart')
      .eq('cancel_type', 'refund'),
    // All cart abandoned (both recovered and not)
    supabase
      .from('hotmart_cart_abandoned')
      .select('*')
      .order('abandoned_at', { ascending: false })
      .limit(50),
    // Unresolved payment failures
    supabase
      .from('hotmart_payment_failures')
      .select('*')
      .eq('resolved', false)
      .order('failed_at', { ascending: false }),
    // Converted trials count
    supabase
      .from('spc_members')
      .select('id', { count: 'exact', head: true })
      .eq('provider', 'Hotmart')
      .eq('converted_from_trial', true),
    // Recovered carts count
    supabase
      .from('hotmart_cart_abandoned')
      .select('id', { count: 'exact', head: true })
      .eq('recovered', true),
    // Active Hotmart member emails (for "converted after" checks)
    supabase
      .from('spc_members')
      .select('email, joined_at, status')
      .eq('provider', 'Hotmart')
      .in('status', ['active', 'trial']),
    // Transactions for "purchased after" checks
    supabase
      .from('transactions')
      .select('buyer_email, date')
      .eq('source', 'Hotmart')
      .eq('status', 'completed')
      .gt('cost', 0)
      .order('date', { ascending: false }),
  ])

  // Build lookup maps for conversion checks
  const activeByEmail: Record<string, string> = {}
  for (const m of activeHotmartEmails.data ?? []) {
    if (m.email) activeByEmail[m.email.toLowerCase()] = m.joined_at
  }

  const txByEmail: Record<string, string> = {}
  for (const tx of allTransactions.data ?? []) {
    const e = (tx.buyer_email ?? '').toLowerCase()
    if (e && !txByEmail[e]) txByEmail[e] = tx.date // latest first
  }

  // Enrich cancellations with "converted after" flag
  const enrichedCancellations = (cancellationsRes.data ?? []).map((c: any) => {
    const email = (c.email ?? '').toLowerCase()
    const joinedAt = activeByEmail[email]
    const convertedAfter = joinedAt && c.cancelled_at ? joinedAt > c.cancelled_at.slice(0, 10) : false
    return { ...c, converted_after: convertedAfter }
  })

  // Merge payment failures into cancellations list with type='failed'
  const failureEntries = (failuresRes.data ?? []).map((f: any) => ({
    id: f.id,
    name: f.name,
    email: f.email,
    cancelled_at: f.failed_at,
    amount: f.amount,
    cancel_type: 'payment_failed',
    paid_cancel: true,
    trial_cancel: false,
    provider: 'Hotmart',
    converted_after: !!activeByEmail[(f.email ?? '').toLowerCase()],
    _is_failure: true,
    _failure_id: f.id,
  }))

  // Enrich cart abandoned with "purchased after" flag
  const enrichedCart = (cartAllRes.data ?? []).map((c: any) => {
    const email = (c.email ?? '').toLowerCase()
    const txDate = txByEmail[email]
    const purchasedAfter = txDate && c.abandoned_at ? txDate > c.abandoned_at.slice(0, 10) : false
    return { ...c, purchased_after: purchasedAfter }
  })

  // Recovery rate
  const totalCancellations = (cancellationsRes.data ?? []).length
  const totalAbandoned = (cartAllRes.data ?? []).length
  const denominator = totalCancellations + totalAbandoned
  const convertedTrials = convertedTrialsRes.count ?? 0
  const recoveredCarts = recoveredCartsRes.count ?? 0
  const numerator = convertedTrials + recoveredCarts
  const recoveryRate = denominator > 0 ? Math.round((numerator / denominator) * 100) : 0

  return NextResponse.json({
    trials_hotmart: trialsRes.count ?? 0,
    cancellations: enrichedCancellations,
    failures: failureEntries,
    cart_abandoned: enrichedCart,
    recovery: {
      rate: recoveryRate,
      converted: numerator,
      total: denominator,
    },
  })
}

// Mark payment failure as resolved or cart abandonment as recovered
export async function PATCH(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const body = await req.json()
  const { type, id } = body

  if (type === 'resolve_failure') {
    const { error } = await supabase
      .from('hotmart_payment_failures')
      .update({ resolved: true })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (type === 'recover_cart') {
    const { error } = await supabase
      .from('hotmart_cart_abandoned')
      .update({ recovered: true, recovered_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
