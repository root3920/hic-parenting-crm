import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getCanonicalProduct } from '@/lib/products'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-sync-secret')
  if (secret !== 'hic_sync_2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch all active members
  const { data: members, error: membersErr } = await supabase
    .from('spc_members')
    .select('id, email, plan, next_payment_date')
    .eq('status', 'active')

  if (membersErr) {
    return NextResponse.json({ error: membersErr.message }, { status: 500 })
  }

  // Fetch all completed SPC transactions
  const { data: allTx, error: txErr } = await supabase
    .from('transactions')
    .select('buyer_email, date, offer_title, status')
    .eq('status', 'completed')
    .order('date', { ascending: false })

  if (txErr) {
    return NextResponse.json({ error: txErr.message }, { status: 500 })
  }

  // Build map: lowercase email → most recent SPC transaction date
  const lastPaymentByEmail: Record<string, string> = {}
  for (const tx of allTx ?? []) {
    if (getCanonicalProduct(tx.offer_title ?? '') !== 'Secure Parent Collective') continue
    const email = (tx.buyer_email ?? '').toLowerCase()
    if (!email) continue
    if (!lastPaymentByEmail[email] || tx.date > lastPaymentByEmail[email]) {
      lastPaymentByEmail[email] = tx.date
    }
  }

  let updated = 0
  let skipped = 0
  let noTransactions = 0

  for (const m of members ?? []) {
    const email = (m.email ?? '').toLowerCase()
    const lastPayment = lastPaymentByEmail[email]

    if (!lastPayment) {
      noTransactions++
      continue
    }

    const plan: 'annual' | 'monthly' = m.plan ?? 'monthly'
    const d = new Date(lastPayment + 'T12:00:00')
    if (plan === 'annual') d.setFullYear(d.getFullYear() + 1)
    else d.setMonth(d.getMonth() + 1)
    const calculated = d.toISOString().slice(0, 10)

    if (m.next_payment_date === calculated) {
      skipped++
      continue
    }

    const { error } = await supabase
      .from('spc_members')
      .update({ next_payment_date: calculated })
      .eq('id', m.id)

    if (error) {
      console.error(`Failed to update ${email}: ${error.message}`)
      skipped++
    } else {
      updated++
    }
  }

  return NextResponse.json({ updated, skipped, no_transactions: noTransactions })
}
