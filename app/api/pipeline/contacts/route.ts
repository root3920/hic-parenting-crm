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

function calculateAutoStage(
  purchases: { offer_title: string; date: string }[],
  hasCall: boolean
): number {
  const titles = purchases.map((p) => p.offer_title.toLowerCase())

  const hasPWU = titles.some((t) => t.includes('parenting with understanding'))
  if (hasPWU) return 5

  const hasSPC = titles.some((t) => t.includes('secure parent collective'))
  if (hasSPC) return 4

  if (hasCall) return 3

  const hasRSC = titles.some((t) => t.includes('raising secure children'))
  if (hasRSC) return 2

  return 1
}

export async function GET() {
  // 1. Get all distinct buyers from completed transactions
  const { data: transactions, error: txErr } = await supabase
    .from('transactions')
    .select('buyer_email, buyer_name, buyer_phone, offer_title, date')
    .eq('status', 'completed')
    .order('date', { ascending: false })

  if (txErr) {
    return NextResponse.json({ error: txErr.message }, { status: 500 })
  }

  // 2. Get all calls
  const { data: calls, error: callErr } = await supabase
    .from('calls')
    .select('email, start_date, status')

  if (callErr) {
    return NextResponse.json({ error: callErr.message }, { status: 500 })
  }

  // 3. Get existing overrides
  const { data: overrides } = await supabase
    .from('value_ladder_contacts')
    .select('*')

  const overrideMap = new Map(
    (overrides ?? []).map((o: Record<string, unknown>) => [
      (o.buyer_email as string).toLowerCase(),
      o,
    ])
  )

  // Build call lookup by email
  const callMap = new Map<string, { start_date: string; status: string }>()
  for (const call of calls ?? []) {
    if (!call.email) continue
    const key = call.email.toLowerCase()
    const existing = callMap.get(key)
    if (!existing || call.start_date > existing.start_date) {
      callMap.set(key, { start_date: call.start_date, status: call.status })
    }
  }

  // Group transactions by buyer_email
  const buyerMap = new Map<
    string,
    {
      buyer_name: string
      buyer_phone: string | null
      purchases: { offer_title: string; date: string }[]
    }
  >()

  for (const tx of transactions ?? []) {
    if (!tx.buyer_email) continue
    const key = tx.buyer_email.toLowerCase()
    if (!buyerMap.has(key)) {
      buyerMap.set(key, {
        buyer_name: tx.buyer_name,
        buyer_phone: tx.buyer_phone ?? null,
        purchases: [],
      })
    }
    buyerMap.get(key)!.purchases.push({
      offer_title: tx.offer_title,
      date: tx.date,
    })
  }

  // 4. Build pipeline contacts
  const contacts = []
  const upsertRows: {
    buyer_email: string
    buyer_name: string | null
    current_stage: number
  }[] = []

  for (const [email, buyer] of Array.from(buyerMap.entries())) {
    const hasCall = callMap.has(email)
    const autoStage = calculateAutoStage(buyer.purchases, hasCall)
    const override = overrideMap.get(email) as Record<string, unknown> | undefined

    const manualOverride = override?.manual_override === true
    const displayStage = manualOverride
      ? (override!.current_stage as number)
      : autoStage

    contacts.push({
      buyer_email: email,
      buyer_name: buyer.buyer_name,
      buyer_phone: buyer.buyer_phone,
      display_stage: displayStage,
      auto_stage: autoStage,
      manual_override: manualOverride,
      setter_assigned: (override?.setter_assigned as string) ?? null,
      last_contacted_at: (override?.last_contacted_at as string) ?? null,
      product_proposed: (override?.product_proposed as string) ?? null,
      notes: (override?.notes as string) ?? null,
      latest_purchase: buyer.purchases[0] ?? null,
      call_info: callMap.get(email) ?? null,
    })

    // Queue upsert for contacts not yet in the table (don't overwrite manual overrides)
    if (!override) {
      upsertRows.push({
        buyer_email: email,
        buyer_name: buyer.buyer_name,
        current_stage: autoStage,
      })
    }
  }

  // 5. Upsert new contacts into value_ladder_contacts
  if (upsertRows.length > 0) {
    await supabase
      .from('value_ladder_contacts')
      .upsert(upsertRows, { onConflict: 'buyer_email', ignoreDuplicates: true })
  }

  // Sort by display_stage ascending, then name
  contacts.sort((a, b) => {
    if (a.display_stage !== b.display_stage) return a.display_stage - b.display_stage
    return (a.buyer_name ?? '').localeCompare(b.buyer_name ?? '')
  })

  return NextResponse.json({
    data: contacts,
    stage_names: STAGE_NAMES,
    counts: {
      1: contacts.filter((c) => c.display_stage === 1).length,
      2: contacts.filter((c) => c.display_stage === 2).length,
      3: contacts.filter((c) => c.display_stage === 3).length,
      4: contacts.filter((c) => c.display_stage === 4).length,
      5: contacts.filter((c) => c.display_stage === 5).length,
    },
    total: contacts.length,
  })
}
