import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')

  if (!query || query.length < 2) {
    return NextResponse.json([])
  }

  const pattern = `%${query}%`

  const { data, error } = await supabaseAdmin
    .from('transactions')
    .select('id, transaction_id, offer_title, cost, date, buyer_email, status')
    .or(`buyer_email.ilike.${pattern},transaction_id.ilike.${pattern}`)
    .order('date', { ascending: false })
    .limit(10)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
