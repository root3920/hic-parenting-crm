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
 * Returns full contact detail + recent transactions for the modal.
 */
export async function GET(req: NextRequest) {
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const email = req.nextUrl.searchParams.get('email')
  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 })

  const svc = getServiceClient()

  // Fetch contact record
  const { data: contact, error: cErr } = await svc
    .from('value_ladder_contacts')
    .select('*')
    .eq('buyer_email', email)
    .single()

  if (cErr || !contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  // Fetch transactions for this email (most recent first, limit 20)
  const { data: transactions } = await svc
    .from('transactions')
    .select('id, date, offer_title, cost, buyer_name, buyer_email, buyer_phone, currency, source, status, created_at')
    .eq('buyer_email', email)
    .order('date', { ascending: false })
    .limit(20)

  return NextResponse.json({
    contact,
    transactions: transactions ?? [],
  })
}
