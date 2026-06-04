import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BATCH_SIZE = 500
const PAGE_SIZE = 1000 // Supabase max per request
const CUTOFF_DATE = '2025-01-01'

function calculateAutoStage(
  titles: string[],
  hasCall: boolean
): number {
  const lower = titles.map((t) => t.toLowerCase())

  if (lower.some((t) => t.includes('parenting with understanding'))) return 5
  if (lower.some((t) => t.includes('secure parent collective'))) return 4
  if (hasCall) return 3
  if (lower.some((t) => t.includes('raising secure children'))) return 2
  return 1
}

/** Fetch ALL rows from a table using paginated requests to bypass the 1000-row limit. */
async function fetchAllRows<T>(
  table: string,
  select: string,
  filters?: { column: string; op: 'eq' | 'gte'; value: string }[],
  orderBy?: string
): Promise<T[]> {
  const all: T[] = []
  let from = 0

  while (true) {
    let query = supabase
      .from(table)
      .select(select)
      .range(from, from + PAGE_SIZE - 1)

    if (filters) {
      for (const f of filters) {
        if (f.op === 'eq') query = query.eq(f.column, f.value)
        else if (f.op === 'gte') query = query.gte(f.column, f.value)
      }
    }
    if (orderBy) {
      query = query.order(orderBy, { ascending: false })
    }

    const { data, error } = await query

    if (error) throw error
    if (!data || data.length === 0) break

    all.push(...(data as T[]))

    // If we got fewer than PAGE_SIZE, we've reached the end
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return all
}

export async function POST() {
  const start = Date.now()

  try {
    // 1. Fetch completed transactions from 2025-01-01 onwards (paginated)
    const transactions = await fetchAllRows<{
      buyer_email: string
      buyer_name: string
      buyer_phone: string | null
      offer_title: string
      date: string
    }>(
      'transactions',
      'buyer_email, buyer_name, buyer_phone, offer_title, date',
      [
        { column: 'status', op: 'eq', value: 'completed' },
        { column: 'date', op: 'gte', value: CUTOFF_DATE },
      ],
      'date'
    )

    // 2. Fetch ALL calls (paginated)
    const calls = await fetchAllRows<{
      email: string | null
      start_date: string
      status: string
    }>('calls', 'email, start_date, status')

    // 3. Fetch existing overrides to avoid clobbering manual_override rows
    const existing = await fetchAllRows<{
      buyer_email: string
      manual_override: boolean
      current_stage: number
    }>('value_ladder_contacts', 'buyer_email, manual_override, current_stage')

    const existingMap = new Map(
      existing.map((e) => [e.buyer_email.toLowerCase(), e])
    )

    // Build call lookup
    const callEmails = new Set<string>()
    for (const call of calls) {
      if (call.email) callEmails.add(call.email.toLowerCase())
    }

    // Group transactions by buyer_email
    const buyerMap = new Map<
      string,
      { buyer_name: string; buyer_phone: string | null; offer_titles: string[] }
    >()

    for (const tx of transactions) {
      if (!tx.buyer_email) continue
      const key = tx.buyer_email.toLowerCase()
      if (!buyerMap.has(key)) {
        buyerMap.set(key, {
          buyer_name: tx.buyer_name,
          buyer_phone: tx.buyer_phone ?? null,
          offer_titles: [],
        })
      }
      buyerMap.get(key)!.offer_titles.push(tx.offer_title)
    }

    // 4. Build upsert rows
    const upsertRows: {
      buyer_email: string
      buyer_name: string | null
      current_stage: number
    }[] = []

    for (const [email, buyer] of Array.from(buyerMap.entries())) {
      const hasCall = callEmails.has(email)
      const autoStage = calculateAutoStage(buyer.offer_titles, hasCall)
      const prev = existingMap.get(email)

      // Skip if manual override is active — don't overwrite their stage
      if (prev?.manual_override) continue

      // Only upsert if new or stage changed
      if (!prev || prev.current_stage !== autoStage) {
        upsertRows.push({
          buyer_email: email,
          buyer_name: buyer.buyer_name,
          current_stage: autoStage,
        })
      }
    }

    // 5. Upsert in batches of 500
    let processed = 0
    for (let i = 0; i < upsertRows.length; i += BATCH_SIZE) {
      const batch = upsertRows.slice(i, i + BATCH_SIZE)
      const { error } = await supabase
        .from('value_ladder_contacts')
        .upsert(batch, { onConflict: 'buyer_email' })

      if (error) {
        return NextResponse.json(
          { error: `Batch ${i / BATCH_SIZE + 1} failed: ${error.message}` },
          { status: 500 }
        )
      }
      processed += batch.length
    }

    // 6. Cleanup: remove contacts whose buyer_email has no completed transaction from 2025+
    const validEmails = new Set(Array.from(buyerMap.keys()))
    const toDelete = existing
      .filter((e) => !validEmails.has(e.buyer_email.toLowerCase()))
      .map((e) => e.buyer_email)

    let deleted = 0
    for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
      const batch = toDelete.slice(i, i + BATCH_SIZE)
      const { error } = await supabase
        .from('value_ladder_contacts')
        .delete()
        .in('buyer_email', batch)
      if (error) {
        return NextResponse.json(
          { error: `Cleanup batch failed: ${error.message}` },
          { status: 500 }
        )
      }
      deleted += batch.length
    }

    const duration = Date.now() - start

    return NextResponse.json({
      processed,
      total: buyerMap.size,
      skipped_manual: existing.filter((e) => e.manual_override).length,
      deleted_pre2025: deleted,
      duration_ms: duration,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
