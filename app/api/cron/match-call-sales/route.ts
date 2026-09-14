import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const PAGE = 1000

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

  const results = { matched_by_email: 0, matched_by_name: 0, total_calls: 0, total_transactions: 0, errors: [] as string[] }

  try {
    // ── 1. Fetch all existing match call_ids (paginated) ──────────
    const matchedCallIds = new Set<string>()
    {
      let from = 0
      while (true) {
        const { data } = await supabase
          .from('call_sale_matches')
          .select('call_id')
          .range(from, from + PAGE - 1)
        if (!data || data.length === 0) break
        for (const m of data) matchedCallIds.add(m.call_id)
        if (data.length < PAGE) break
        from += PAGE
      }
    }

    // ── 2. Fetch all calls (paginated) ────────────────────────────
    const calls: { id: string; email: string | null; full_name: string | null; start_date: string }[] = []
    {
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('calls')
          .select('id, email, full_name, start_date')
          .order('start_date', { ascending: false })
          .range(from, from + PAGE - 1)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        if (!data || data.length === 0) break
        for (const c of data) {
          if (!matchedCallIds.has(c.id)) calls.push(c)
        }
        if (data.length < PAGE) break
        from += PAGE
      }
    }
    results.total_calls = calls.length

    if (calls.length === 0) {
      return NextResponse.json({ message: 'No unmatched calls found', ...results })
    }

    // ── 3. Fetch all completed/recovered transactions (paginated) ─
    const transactions: { id: string; buyer_email: string | null; buyer_name: string | null; date: string }[] = []
    {
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('transactions')
          .select('id, buyer_email, buyer_name, date')
          .in('status', ['completed', 'recovered'])
          .range(from, from + PAGE - 1)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        if (!data || data.length === 0) break
        transactions.push(...data)
        if (data.length < PAGE) break
        from += PAGE
      }
    }
    results.total_transactions = transactions.length

    if (transactions.length === 0) {
      return NextResponse.json({ message: 'No transactions to match against', ...results })
    }

    // ── 4. Build indexes for O(1) email/name lookups ──────────────
    const txByEmail = new Map<string, typeof transactions>()
    const txByName = new Map<string, typeof transactions>()
    for (const tx of transactions) {
      const email = (tx.buyer_email ?? '').trim().toLowerCase()
      if (email) {
        const arr = txByEmail.get(email)
        if (arr) arr.push(tx)
        else txByEmail.set(email, [tx])
      }
      const name = (tx.buyer_name ?? '').trim().toLowerCase()
      if (name) {
        const arr = txByName.get(name)
        if (arr) arr.push(tx)
        else txByName.set(name, [tx])
      }
    }

    // ── 5. Match calls → transactions ─────────────────────────────
    const inserts: { call_id: string; transaction_id: string; matched_by: 'auto' }[] = []

    for (const call of calls) {
      // Normalize to start of day (UTC) so same-day transactions match
      // (transaction.date has no time component → parsed as midnight)
      const callDate = new Date(call.start_date)
      callDate.setUTCHours(0, 0, 0, 0)
      const maxDate = new Date(callDate)
      maxDate.setDate(maxDate.getDate() + 60)

      const callEmail = (call.email ?? '').trim().toLowerCase()
      const callName = (call.full_name ?? '').trim().toLowerCase()

      // Try match by email first
      if (callEmail) {
        const candidates = txByEmail.get(callEmail)
        if (candidates) {
          const emailMatch = candidates.find((tx) => {
            const txDate = new Date(tx.date)
            return txDate >= callDate && txDate <= maxDate
          })
          if (emailMatch) {
            inserts.push({ call_id: call.id, transaction_id: emailMatch.id, matched_by: 'auto' })
            results.matched_by_email++
            continue
          }
        }
      }

      // Fallback: match by name
      if (callName) {
        const candidates = txByName.get(callName)
        if (candidates) {
          const nameMatch = candidates.find((tx) => {
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
    }

    // ── 6. Batch insert (chunked) ─────────────────────────────────
    if (inserts.length > 0) {
      for (let i = 0; i < inserts.length; i += PAGE) {
        const chunk = inserts.slice(i, i + PAGE)
        const { error: insertErr } = await supabase
          .from('call_sale_matches')
          .upsert(chunk, { onConflict: 'call_id,transaction_id', ignoreDuplicates: true })

        if (insertErr) {
          results.errors.push(`Insert error (chunk ${i / PAGE}): ${insertErr.message}`)
        }
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
