import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  const todayStr = now.toISOString().slice(0, 10)

  const [
    activeRes,
    trialsRes,
    expiringRes,
    failedRes,
    cancelledRes,
    logsRes,
    failuresRes,
    cartRes,
  ] = await Promise.all([
    // Active from Hotmart
    supabase
      .from('spc_members')
      .select('id', { count: 'exact', head: true })
      .eq('provider', 'Hotmart')
      .eq('status', 'active'),
    // Trials from Hotmart
    supabase
      .from('spc_members')
      .select('id', { count: 'exact', head: true })
      .eq('provider', 'Hotmart')
      .eq('status', 'trial'),
    // Trials expiring in 7 days
    supabase
      .from('spc_members')
      .select('id', { count: 'exact', head: true })
      .eq('provider', 'Hotmart')
      .eq('status', 'trial')
      .lte('trial_end_date', sevenDaysFromNow)
      .gte('trial_end_date', todayStr),
    // Failed payments (unresolved)
    supabase
      .from('hotmart_payment_failures')
      .select('id', { count: 'exact', head: true })
      .eq('resolved', false),
    // Cancelled this month
    supabase
      .from('spc_cancellations')
      .select('id', { count: 'exact', head: true })
      .eq('provider', 'Hotmart')
      .gte('cancelled_at', firstOfMonth),
    // Last 20 webhook logs
    supabase
      .from('hotmart_webhook_logs')
      .select('*')
      .order('processed_at', { ascending: false })
      .limit(20),
    // Unresolved payment failures
    supabase
      .from('hotmart_payment_failures')
      .select('*')
      .eq('resolved', false)
      .order('failed_at', { ascending: false }),
    // Unrecovered cart abandonments
    supabase
      .from('hotmart_cart_abandoned')
      .select('*')
      .eq('recovered', false)
      .order('abandoned_at', { ascending: false }),
  ])

  return NextResponse.json({
    kpis: {
      active_hotmart: activeRes.count ?? 0,
      trials_hotmart: trialsRes.count ?? 0,
      trials_expiring_7d: expiringRes.count ?? 0,
      failed_payments: failedRes.count ?? 0,
      cancelled_this_month: cancelledRes.count ?? 0,
    },
    webhook_logs: logsRes.data ?? [],
    payment_failures: failuresRes.data ?? [],
    cart_abandoned: cartRes.data ?? [],
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
