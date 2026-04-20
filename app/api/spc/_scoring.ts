import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Score helpers ─────────────────────────────────────────────────────────────

function attendanceScore(classCount: number): number {
  if (classCount <= 0) return 0
  if (classCount === 1) return 10
  if (classCount === 2) return 20
  if (classCount === 3) return 30
  if (classCount === 4) return 40
  return 50 // 5+
}

const PAYMENT_SCALE = [0, 5, 10, 15, 18, 21, 23, 25, 27, 28, 30]

function paymentScore(paymentDates: string[], plan: 'monthly' | 'annual'): number {
  const count = paymentDates.length
  let score = PAYMENT_SCALE[Math.min(count, 10)]

  if (count > 0) {
    const lastDate = paymentDates[count - 1] // dates sorted ASC
    const daysSinceLast = (Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)
    const overdueThreshold = plan === 'annual' ? 370 : 35
    if (daysSinceLast > overdueThreshold) score = Math.max(0, score - 5)
  }

  return score
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface RecalcResult {
  updated: number
  errors: number
}

export async function recalculateAllScores(): Promise<RecalcResult> {
  // Fetch all active + trial members
  const { data: members, error: membersError } = await supabaseAdmin
    .from('spc_members')
    .select('id, email, plan, whatsapp_active')
    .in('status', ['active', 'trial'])

  if (membersError) {
    console.error('[scoring] Members fetch error:', membersError.message)
    return { updated: 0, errors: 1 }
  }
  if (!members || members.length === 0) {
    console.log('[scoring] No active/trial members')
    return { updated: 0, errors: 0 }
  }

  console.log(`[scoring] Processing ${members.length} members`)

  const emailsLower = members.map((m: { email: string }) => m.email.toLowerCase())

  // Attendance: one row per (member_email, class_date) — count rows = classes attended
  const { data: attendanceRows, error: attError } = await supabaseAdmin
    .from('spc_class_attendance')
    .select('member_email')
    .in('member_email', emailsLower)

  if (attError) console.error('[scoring] Attendance fetch error:', attError.message)

  const attendanceByEmail: Record<string, number> = {}
  for (const row of (attendanceRows ?? [])) {
    const e = row.member_email.toLowerCase()
    attendanceByEmail[e] = (attendanceByEmail[e] ?? 0) + 1
  }
  console.log('[scoring] Attendance counts:', JSON.stringify(attendanceByEmail))

  // Transactions: completed SPC payments, sorted ASC
  const { data: txRows, error: txError } = await supabaseAdmin
    .from('transactions')
    .select('buyer_email, date')
    .ilike('offer_title', '%Secure Parent%')
    .eq('status', 'completed')
    .order('date', { ascending: true })

  if (txError) console.error('[scoring] TX fetch error:', txError.message)

  const txByEmail: Record<string, string[]> = {}
  for (const tx of (txRows ?? [])) {
    const e = (tx.buyer_email ?? '').toLowerCase()
    if (!e) continue
    if (!txByEmail[e]) txByEmail[e] = []
    txByEmail[e].push(tx.date)
  }

  // Calculate + UPDATE each member
  let updated = 0
  let errors  = 0

  for (const member of members) {
    const email      = member.email.toLowerCase()
    const classCount = attendanceByEmail[email] ?? 0
    const attScore   = attendanceScore(classCount)
    const waScore    = member.whatsapp_active ? 20 : 0
    const plan       = (member.plan as 'monthly' | 'annual') ?? 'monthly'
    const payDates   = txByEmail[email] ?? []
    const payScore   = paymentScore(payDates, plan)
    const total      = Math.min(100, attScore + waScore + payScore)

    console.log(`[scoring] ${email}: classes=${classCount}(${attScore}pts) wa=${waScore}pts pay=${payDates.length}(${payScore}pts) → ${total}`)

    const { error: updateError } = await supabaseAdmin
      .from('spc_members')
      .update({ lead_score: total })
      .eq('id', member.id)

    if (updateError) {
      console.error(`[scoring] Update failed for ${member.id}:`, updateError.message)
      errors++
    } else {
      updated++
    }
  }

  console.log(`[scoring] Done: ${updated} updated, ${errors} errors`)
  return { updated, errors }
}
