import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const STAGE_NAMES: Record<number, string> = {
  1: 'Low Ticket',
  2: 'Raising Secure Children',
  3: 'Call Booked',
  4: 'SPC Member',
  5: 'Graduated PWU',
}

const PAGE_SIZE = 1000

/** Fetch all rows from a table, paginating past the 1000-row Supabase limit. */
async function fetchAll<T>(
  table: string,
  select: string,
  orderCol?: string
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  while (true) {
    let q = supabase.from(table).select(select).range(from, from + PAGE_SIZE - 1)
    if (orderCol) q = q.order(orderCol, { ascending: false })
    const { data, error } = await q
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as T[]))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

export async function GET() {
  try {
    // 1. Read all value_ladder_contacts (the source of truth after backfill)
    const vlContacts = await fetchAll<{
      buyer_email: string
      buyer_name: string | null
      current_stage: number
      manual_override: boolean
      setter_assigned: string | null
      last_contacted_at: string | null
      product_proposed: string | null
      notes: string | null
    }>('value_ladder_contacts', 'buyer_email, buyer_name, current_stage, manual_override, setter_assigned, last_contacted_at, product_proposed, notes')

    if (vlContacts.length === 0) {
      return NextResponse.json({
        data: [],
        stage_names: STAGE_NAMES,
        counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        total: 0,
        needs_backfill: true,
      })
    }

    // 2. Fetch latest transaction per buyer for display (only need most recent)
    //    We fetch all completed transactions and group client-side, paginated.
    const transactions = await fetchAll<{
      buyer_email: string
      buyer_name: string
      buyer_phone: string | null
      offer_title: string
      date: string
    }>('transactions', 'buyer_email, buyer_name, buyer_phone, offer_title, date', 'date')

    // Build latest-purchase + phone lookup
    const txMap = new Map<string, { offer_title: string; date: string; buyer_phone: string | null }>()
    // transactions are ordered by date desc, so first occurrence per email is the latest
    for (const tx of transactions) {
      if (!tx.buyer_email) continue
      const key = tx.buyer_email.toLowerCase()
      if (!txMap.has(key)) {
        txMap.set(key, {
          offer_title: tx.offer_title,
          date: tx.date,
          buyer_phone: tx.buyer_phone ?? null,
        })
      }
    }

    // 3. Fetch calls for call_info display (paginated)
    const calls = await fetchAll<{
      email: string | null
      start_date: string
      status: string
    }>('calls', 'email, start_date, status')

    const callMap = new Map<string, { start_date: string; status: string }>()
    for (const call of calls) {
      if (!call.email) continue
      const key = call.email.toLowerCase()
      const existing = callMap.get(key)
      if (!existing || call.start_date > existing.start_date) {
        callMap.set(key, { start_date: call.start_date, status: call.status })
      }
    }

    // 4. Build response
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    const data = vlContacts.map((vlc) => {
      const email = vlc.buyer_email.toLowerCase()
      const tx = txMap.get(email)
      const call = callMap.get(email)
      const stage = vlc.current_stage
      counts[stage] = (counts[stage] || 0) + 1

      return {
        buyer_email: vlc.buyer_email,
        buyer_name: vlc.buyer_name ?? tx?.offer_title ?? null,
        buyer_phone: tx?.buyer_phone ?? null,
        display_stage: stage,
        auto_stage: stage, // after backfill, current_stage IS the auto stage (unless manual)
        manual_override: vlc.manual_override,
        setter_assigned: vlc.setter_assigned,
        last_contacted_at: vlc.last_contacted_at,
        product_proposed: vlc.product_proposed,
        notes: vlc.notes,
        latest_purchase: tx ? { offer_title: tx.offer_title, date: tx.date } : null,
        call_info: call ?? null,
      }
    })

    // Sort by stage asc, then name
    data.sort((a, b) => {
      if (a.display_stage !== b.display_stage) return a.display_stage - b.display_stage
      return (a.buyer_name ?? '').localeCompare(b.buyer_name ?? '')
    })

    return NextResponse.json({
      data,
      stage_names: STAGE_NAMES,
      counts,
      total: data.length,
      needs_backfill: false,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
