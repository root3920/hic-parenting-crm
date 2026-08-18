import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * GET /api/contacts/pipeline/detail?email=...
 *
 * Returns full contact detail + recent transactions + call history + SPC membership.
 */
export async function GET(req: NextRequest) {
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const email = req.nextUrl.searchParams.get('email')
  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 })

  const svc = getServiceClient()

  // Fetch contact record, transactions, calls, and SPC membership in parallel
  const [contactRes, txRes, callsRes, spcRes] = await Promise.all([
    svc
      .from('value_ladder_contacts')
      .select('*')
      .eq('buyer_email', email)
      .single(),
    svc
      .from('transactions')
      .select('id, date, offer_title, cost, buyer_name, buyer_email, buyer_phone, currency, source, status, created_at')
      .eq('buyer_email', email)
      .order('date', { ascending: false })
      .limit(20),
    svc
      .from('calls')
      .select('id, start_date, full_name, email, status, call_type, call_status, call_summary, setter_name, closer_name, notes')
      .ilike('email', email)
      .order('start_date', { ascending: false })
      .limit(30),
    svc
      .from('spc_members')
      .select('id, name, email, plan, amount, status, provider, joined_at, next_payment_date, trial_end_date')
      .ilike('email', email)
      .limit(1)
      .maybeSingle(),
  ])

  if (contactRes.error || !contactRes.data) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  return NextResponse.json({
    contact: contactRes.data,
    transactions: txRes.data ?? [],
    calls: callsRes.data ?? [],
    spc_member: spcRes.data ?? null,
  })
}
