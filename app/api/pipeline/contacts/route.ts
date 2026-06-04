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
const CUTOFF_DATE = '2025-01-01'

/** Fetch all rows from a table, paginating past the 1000-row Supabase limit. */
async function fetchAll<T>(
  table: string,
  select: string,
  orderCol?: string,
  filters?: { column: string; op: 'eq' | 'gte'; value: string }[]
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  while (true) {
    let q = supabase.from(table).select(select).range(from, from + PAGE_SIZE - 1)
    if (filters) {
      for (const f of filters) {
        if (f.op === 'eq') q = q.eq(f.column, f.value)
        else if (f.op === 'gte') q = q.gte(f.column, f.value)
      }
    }
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

    // 2. Fetch transactions from 2025-01-01 onwards for display, paginated.
    //    Fetch all statuses then filter client-side to include null status (legacy rows).
    const allTransactions = await fetchAll<{
      buyer_email: string
      buyer_name: string
      buyer_phone: string | null
      offer_title: string
      date: string
      status: string | null
    }>(
      'transactions',
      'buyer_email, buyer_name, buyer_phone, offer_title, date, status',
      'date',
      [
        { column: 'date', op: 'gte', value: CUTOFF_DATE },
      ]
    )

    // Only include completed or null-status (legacy) transactions
    const transactions = allTransactions.filter(
      (tx) => !tx.status || tx.status === 'completed'
    )

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

    // 3b. Fetch active SPC members to recalculate stage 4 live
    const spcMembers = await fetchAll<{
      email: string
    }>(
      'spc_members',
      'email',
      undefined,
      [{ column: 'status', op: 'eq', value: 'active' }]
    )
    const activeSpcEmails = new Set<string>()
    for (const m of spcMembers) {
      if (m.email) activeSpcEmails.add(m.email.toLowerCase())
    }

    // 4. Build response — recalculate stage 4 from spc_members on every read
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    const data = vlContacts.map((vlc) => {
      const email = vlc.buyer_email.toLowerCase()
      const tx = txMap.get(email)
      const call = callMap.get(email)
      const isActiveSpc = activeSpcEmails.has(email)
      let stage = vlc.current_stage

      // Recalculate stage 4 from spc_members (source of truth)
      if (!vlc.manual_override) {
        if (stage === 4 && !isActiveSpc) {
          // Was stage 4 but no longer active in SPC — demote
          if (call) stage = 3
          else {
            const titles = (transactions
              .filter((t) => t.buyer_email && t.buyer_email.toLowerCase() === email)
              .map((t) => t.offer_title.toLowerCase()))
            if (titles.some((t) => t.includes('raising secure children'))) stage = 2
            else stage = 1
          }
        } else if (stage < 4 && isActiveSpc) {
          // Is active SPC but wasn't marked as stage 4 — promote
          stage = 4
        }
        // Stage 5 (PWU) always takes precedence, never demote from 5
      }

      counts[stage] = (counts[stage] || 0) + 1

      return {
        buyer_email: vlc.buyer_email,
        buyer_name: vlc.buyer_name ?? tx?.offer_title ?? null,
        buyer_phone: tx?.buyer_phone ?? null,
        display_stage: stage,
        auto_stage: stage,
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
    return NextResponse.json({
      error: message,
      data: [],
      stage_names: STAGE_NAMES,
      counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      total: 0,
      needs_backfill: false,
    }, { status: 500 })
  }
}
