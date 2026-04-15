import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const SYNC_SECRET = 'hic_sync_2026'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-sync-secret')
  if (secret !== SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // ── 1. Fetch all SPC-related transactions ────────────────────────────────
    const { data: allTxs, error: txErr } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .ilike('offer_title', '%Secure Parent%')
      .order('date', { ascending: true })

    if (txErr) {
      return NextResponse.json({ error: txErr.message }, { status: 500 })
    }

    const transactions = allTxs ?? []

    // ── 2. Fetch existing members and cancellation emails ────────────────────
    const [{ data: existingMembers }, { data: existingCancels }] = await Promise.all([
      supabaseAdmin.from('spc_members').select('email'),
      supabaseAdmin.from('spc_cancellations').select('email'),
    ])

    const memberEmails = new Set((existingMembers ?? []).map((m: { email: string }) => m.email?.toLowerCase()))
    const cancelEmails = new Set((existingCancels ?? []).map((c: { email: string | null }) => c.email?.toLowerCase()))

    // ── 3. Group paid transactions by email (cost > 0) ───────────────────────
    type TxRow = {
      buyer_email: string | null
      buyer_name: string | null
      buyer_phone: string | null
      cost: number
      date: string
      source: string | null
    }

    const paidTxs = transactions.filter((t: TxRow) => Number(t.cost) > 0 && t.buyer_email)
    const paidByEmail = new Map<string, TxRow[]>()
    for (const tx of paidTxs as TxRow[]) {
      const email = tx.buyer_email!.toLowerCase()
      if (!paidByEmail.has(email)) paidByEmail.set(email, [])
      paidByEmail.get(email)!.push(tx)
    }

    // ── 4. Insert paid members ────────────────────────────────────────────────
    let addedActive = 0
    const activeInserts: object[] = []

    for (const [email, txList] of Array.from(paidByEmail.entries())) {
      if (cancelEmails.has(email)) continue   // skip — already cancelled
      if (memberEmails.has(email)) continue   // skip — already exists

      // Earliest transaction date = joined_at
      const earliest = txList[0]
      const hasAnnual = txList.some((t: TxRow) => Number(t.cost) >= 400)
      const maxCost = Math.max(...txList.map((t: TxRow) => Number(t.cost)))
      const spcProvider = earliest.source === 'Kajabi' ? 'Kajabi' : 'Stripe'

      activeInserts.push({
        name: earliest.buyer_name || 'Unknown',
        email: earliest.buyer_email,
        phone: earliest.buyer_phone ?? null,
        status: 'active',
        plan: hasAnnual ? 'annual' : 'monthly',
        amount: maxCost,
        provider: spcProvider,
        joined_at: earliest.date,
      })
      memberEmails.add(email) // prevent duplicates within this run
    }

    if (activeInserts.length > 0) {
      const { error: insertErr } = await supabaseAdmin.from('spc_members').insert(activeInserts)
      if (insertErr) return NextResponse.json({ error: `Active insert: ${insertErr.message}` }, { status: 500 })
      addedActive = activeInserts.length
    }

    // ── 5. Insert trial members (cost === 0) ─────────────────────────────────
    const trialTxs = transactions.filter((t: TxRow) => Number(t.cost) === 0 && t.buyer_email)
    const trialByEmail = new Map<string, TxRow>()
    for (const tx of trialTxs as TxRow[]) {
      const email = tx.buyer_email!.toLowerCase()
      if (!trialByEmail.has(email)) trialByEmail.set(email, tx) // keep earliest
    }

    let addedTrial = 0
    const trialInserts: object[] = []

    for (const [email, tx] of Array.from(trialByEmail.entries())) {
      if (cancelEmails.has(email)) continue
      if (memberEmails.has(email)) continue

      const spcProvider = tx.source === 'Kajabi' ? 'Kajabi' : 'Stripe'
      trialInserts.push({
        name: tx.buyer_name || 'Unknown',
        email: tx.buyer_email,
        phone: tx.buyer_phone ?? null,
        status: 'trial',
        plan: 'monthly',
        amount: 0,
        provider: spcProvider,
        joined_at: tx.date,
      })
      memberEmails.add(email)
    }

    if (trialInserts.length > 0) {
      const { error: insertErr } = await supabaseAdmin.from('spc_members').insert(trialInserts)
      if (insertErr) return NextResponse.json({ error: `Trial insert: ${insertErr.message}` }, { status: 500 })
      addedTrial = trialInserts.length
    }

    const skipped = paidByEmail.size + trialByEmail.size - addedActive - addedTrial

    return NextResponse.json({
      added_active: addedActive,
      added_trial: addedTrial,
      skipped,
      total_transactions_scanned: transactions.length,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
