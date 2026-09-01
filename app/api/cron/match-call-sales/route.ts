import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  // Verify cron authorization
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const authHeader = req.headers.get('authorization')
  const isValidBearer = authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!isVercelCron && !isValidBearer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const results = { matched_by_email: 0, matched_by_name: 0, errors: [] as string[] }

  try {
    // Get all call IDs that already have a match
    const { data: existingMatches } = await supabase
      .from('call_sale_matches')
      .select('call_id')

    const matchedCallIds = new Set((existingMatches ?? []).map((m) => m.call_id))

    // Get all calls (with email or full_name) that don't have a match yet
    const { data: unmatchedCalls, error: callsErr } = await supabase
      .from('calls')
      .select('id, email, full_name, start_date')
      .order('start_date', { ascending: false })

    if (callsErr) {
      return NextResponse.json({ error: callsErr.message }, { status: 500 })
    }

    const calls = (unmatchedCalls ?? []).filter((c) => !matchedCallIds.has(c.id))

    if (calls.length === 0) {
      return NextResponse.json({ message: 'No unmatched calls found', ...results })
    }

    // Get all transactions for matching
    const { data: transactions, error: txErr } = await supabase
      .from('transactions')
      .select('id, buyer_email, buyer_name, date')
      .in('status', ['completed', 'recovered'])

    if (txErr) {
      return NextResponse.json({ error: txErr.message }, { status: 500 })
    }

    if (!transactions || transactions.length === 0) {
      return NextResponse.json({ message: 'No transactions to match against', ...results })
    }

    const inserts: { call_id: string; transaction_id: string; matched_by: 'auto' }[] = []

    for (const call of calls) {
      const callDate = new Date(call.start_date)
      const maxDate = new Date(callDate)
      maxDate.setDate(maxDate.getDate() + 60)

      const callEmail = (call.email ?? '').trim().toLowerCase()
      const callName = (call.full_name ?? '').trim().toLowerCase()

      // Try match by email first
      if (callEmail) {
        const emailMatch = transactions.find((tx) => {
          const txEmail = (tx.buyer_email ?? '').trim().toLowerCase()
          if (!txEmail || txEmail !== callEmail) return false
          const txDate = new Date(tx.date)
          return txDate >= callDate && txDate <= maxDate
        })

        if (emailMatch) {
          inserts.push({ call_id: call.id, transaction_id: emailMatch.id, matched_by: 'auto' })
          results.matched_by_email++
          continue
        }
      }

      // Fallback: match by name
      if (callName) {
        const nameMatch = transactions.find((tx) => {
          const txName = (tx.buyer_name ?? '').trim().toLowerCase()
          if (!txName || txName !== callName) return false
          const txDate = new Date(tx.date)
          return txDate >= callDate && txDate <= maxDate
        })

        if (nameMatch) {
          inserts.push({ call_id: call.id, transaction_id: nameMatch.id, matched_by: 'auto' })
          results.matched_by_name++
          continue
        }
      }
    }

    // Batch insert matches
    if (inserts.length > 0) {
      const { error: insertErr } = await supabase
        .from('call_sale_matches')
        .upsert(inserts, { onConflict: 'call_id,transaction_id', ignoreDuplicates: true })

      if (insertErr) {
        results.errors.push(`Insert error: ${insertErr.message}`)
      }
    }

    return NextResponse.json({
      message: `Matched ${inserts.length} calls to sales`,
      ...results,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
