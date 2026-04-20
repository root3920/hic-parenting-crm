import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Helpers ───────────────────────────────────────────────────────────────────

function attendanceScore(classCount: number): number {
  if (classCount <= 0) return 0
  if (classCount === 1) return 10
  if (classCount === 2) return 20
  if (classCount === 3) return 30
  if (classCount === 4) return 40
  return 50
}

function paymentConsistencyScore(
  paymentDates: string[], // YYYY-MM-DD sorted ascending
  plan: 'monthly' | 'annual'
): number {
  if (paymentDates.length === 0) return 0

  let consecutive = 1
  for (let i = 1; i < paymentDates.length; i++) {
    const prev = new Date(paymentDates[i - 1]).getTime()
    const curr = new Date(paymentDates[i]).getTime()
    const gap  = (curr - prev) / (1000 * 60 * 60 * 24)
    if (gap <= 45) consecutive++
    else consecutive = 1
  }

  let score = 0
  if (consecutive >= 3) score = 30
  else if (consecutive === 2) score = 15
  else if (consecutive === 1) score = 5

  const lastDate = paymentDates[paymentDates.length - 1]
  const daysSinceLast = (Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)
  const overdueThreshold = plan === 'annual' ? 370 : 35
  if (daysSinceLast > overdueThreshold) score = Math.max(0, score - 10)

  return score
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // Fetch ALL active+trial members — always recalculate everyone for accuracy
    const { data: members, error: membersError } = await supabaseAdmin
      .from('spc_members')
      .select('id, email, plan, whatsapp_active')
      .in('status', ['active', 'trial'])

    if (membersError) {
      console.error('[recalculate-scores] Members fetch error:', membersError.message)
      return NextResponse.json({ error: membersError.message }, { status: 500 })
    }
    if (!members || members.length === 0) {
      console.log('[recalculate-scores] No active/trial members found')
      return NextResponse.json({ updated: 0 })
    }

    console.log(`[recalculate-scores] Processing ${members.length} members`)

    // Lowercase all member emails for consistent matching
    const emailsLower = members.map((m: { email: string }) => m.email.toLowerCase())

    // ── Attendance: fetch all rows for these members ──
    const { data: attendanceRows, error: attError } = await supabaseAdmin
      .from('spc_class_attendance')
      .select('member_email')
      .in('member_email', emailsLower)

    if (attError) console.error('[recalculate-scores] Attendance fetch error:', attError.message)

    console.log(`[recalculate-scores] Attendance rows found: ${(attendanceRows ?? []).length}`)

    // Count distinct classes per email (each row = 1 class attended)
    const attendanceByEmail: Record<string, number> = {}
    for (const row of (attendanceRows ?? [])) {
      const e = row.member_email.toLowerCase()
      attendanceByEmail[e] = (attendanceByEmail[e] ?? 0) + 1
    }
    console.log('[recalculate-scores] Attendance by email:', JSON.stringify(attendanceByEmail))

    // ── Transactions: completed SPC payments ──
    const { data: txRows, error: txError } = await supabaseAdmin
      .from('transactions')
      .select('buyer_email, date')
      .ilike('offer_title', '%Secure Parent%')
      .eq('status', 'completed')
      .order('date', { ascending: true })

    if (txError) console.error('[recalculate-scores] TX fetch error:', txError.message)

    const txByEmail: Record<string, string[]> = {}
    for (const tx of (txRows ?? [])) {
      const e = (tx.buyer_email ?? '').toLowerCase()
      if (!e) continue
      if (!txByEmail[e]) txByEmail[e] = []
      txByEmail[e].push(tx.date)
    }

    // ── Calculate scores and UPDATE (not upsert — avoids NOT NULL violations) ──
    let successCount = 0
    for (const member of members) {
      const email = member.email.toLowerCase()

      const classCount = attendanceByEmail[email] ?? 0
      const attScore   = attendanceScore(classCount)
      const waScore    = member.whatsapp_active ? 20 : 0
      const plan       = (member.plan as 'monthly' | 'annual') ?? 'monthly'
      const payScore   = paymentConsistencyScore(txByEmail[email] ?? [], plan)
      const total      = Math.min(100, attScore + waScore + payScore)

      console.log(`[recalculate-scores] ${email}: classes=${classCount} att=${attScore} wa=${waScore} pay=${payScore} → total=${total}`)

      // UPDATE only lead_score — never upsert (upsert requires all NOT NULL fields)
      const { error: updateError } = await supabaseAdmin
        .from('spc_members')
        .update({ lead_score: total })
        .eq('id', member.id)

      if (updateError) {
        console.error(`[recalculate-scores] Update failed for ${member.id} (${email}):`, updateError.message)
      } else {
        successCount++
      }
    }

    console.log(`[recalculate-scores] Done. Updated ${successCount}/${members.length} members.`)
    return NextResponse.json({ updated: successCount })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[recalculate-scores] Unexpected error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
