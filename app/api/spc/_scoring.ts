import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Pure score formula ────────────────────────────────────────────────────────
// Attendance (40 pts max): MIN(classes * 8, 40)
// Payment   (40 pts max): MIN(FLOOR(payments / 2) * 4, 40), -5 if overdue
// WhatsApp  (20 pts):     20 if active, 0 otherwise

export function calcScore({
  classCount,
  payCount,
  lastPayDate,
  plan,
  waActive,
}: {
  classCount:  number
  payCount:    number
  lastPayDate: string | null
  plan:        string
  waActive:    boolean
}): number {
  const attScore = Math.min(classCount * 8, 40)

  let payScore = Math.min(Math.floor(payCount / 2) * 4, 40)
  if (lastPayDate && payCount > 0) {
    const daysSinceLast = (Date.now() - new Date(lastPayDate).getTime()) / 86400000
    const threshold = plan === 'annual' ? 370 : 35
    if (daysSinceLast > threshold) payScore = Math.max(0, payScore - 5)
  }

  const waScore = waActive ? 20 : 0
  return Math.min(100, attScore + payScore + waScore)
}

// ── Per-member targeted calculation ──────────────────────────────────────────
// Used after Zoom upload (only recalculates affected members).

export interface MemberScoreInfo {
  email: string
  score: number
}

export async function calculateMemberScore(
  memberId: string,
  emailLower: string,
  plan: string,
  waActive: boolean,
): Promise<MemberScoreInfo> {
  // Attendance count — stored lowercase so direct eq works
  const { count: classCount } = await supabaseAdmin
    .from('spc_class_attendance')
    .select('id', { count: 'exact', head: true })
    .eq('member_email', emailLower)

  // Completed SPC payments — use ilike for case-insensitive email match
  const { data: txRows } = await supabaseAdmin
    .from('transactions')
    .select('date')
    .ilike('offer_title', '%Secure Parent%')
    .eq('status', 'completed')
    .ilike('buyer_email', emailLower)
    .order('date', { ascending: false })

  const payCount    = txRows?.length ?? 0
  const lastPayDate = txRows?.[0]?.date ?? null

  const score = calcScore({
    classCount:  classCount ?? 0,
    payCount,
    lastPayDate,
    plan,
    waActive,
  })

  const { error } = await supabaseAdmin
    .from('spc_members')
    .update({ lead_score: score })
    .eq('id', memberId)

  if (error) {
    console.error(`[scoring] UPDATE failed for ${memberId} (${emailLower}):`, error.message)
  } else {
    console.log(
      `[scoring] ${emailLower}: classes=${classCount ?? 0}(${Math.min((classCount ?? 0) * 8, 40)}pts)` +
      ` pay=${payCount}(${Math.min(Math.floor(payCount / 2) * 4, 40)}pts)` +
      ` wa=${waActive ? 20 : 0}pts → ${score}`,
    )
  }

  return { email: emailLower, score }
}

// ── Batch recalculation ───────────────────────────────────────────────────────
// Fetches all data in 3 queries, then updates every active/trial member.

export interface RecalcResult {
  processed: number
  scores: MemberScoreInfo[]
}

export async function recalculateAllScores(): Promise<RecalcResult> {
  // 1. All active + trial members
  const { data: members, error: membersError } = await supabaseAdmin
    .from('spc_members')
    .select('id, email, plan, whatsapp_active')
    .in('status', ['active', 'trial'])

  if (membersError) {
    console.error('[scoring] Members fetch error:', membersError.message)
    return { processed: 0, scores: [] }
  }
  if (!members || members.length === 0) {
    console.log('[scoring] No active/trial members found')
    return { processed: 0, scores: [] }
  }

  console.log(`[scoring] Recalculating ${members.length} members`)

  const emailsLower = members.map((m: { email: string }) => m.email.toLowerCase())

  // 2. All attendance rows for these members
  const { data: attRows, error: attError } = await supabaseAdmin
    .from('spc_class_attendance')
    .select('member_email')
    .in('member_email', emailsLower)

  if (attError) console.error('[scoring] Attendance fetch error:', attError.message)

  const classesByEmail: Record<string, number> = {}
  for (const row of (attRows ?? [])) {
    const e = row.member_email.toLowerCase()
    classesByEmail[e] = (classesByEmail[e] ?? 0) + 1
  }
  console.log('[scoring] Class counts:', JSON.stringify(classesByEmail))

  // 3. All completed SPC transactions (fetch all, filter in JS to avoid case issues)
  const { data: txRows, error: txError } = await supabaseAdmin
    .from('transactions')
    .select('buyer_email, date')
    .ilike('offer_title', '%Secure Parent%')
    .eq('status', 'completed')
    .order('date', { ascending: false }) // DESC so index [0] = most recent

  if (txError) console.error('[scoring] TX fetch error:', txError.message)

  // Group by lowercase email: { email: { count, lastDate } }
  const txByEmail: Record<string, { count: number; lastDate: string }> = {}
  for (const tx of (txRows ?? [])) {
    const e = (tx.buyer_email ?? '').toLowerCase()
    if (!e) continue
    if (!txByEmail[e]) txByEmail[e] = { count: 0, lastDate: tx.date }
    txByEmail[e].count++
    // lastDate stays as the first row since we sorted DESC
  }

  // 4. Compute + UPDATE each member
  const scores: MemberScoreInfo[] = []

  for (const member of members) {
    const email = member.email.toLowerCase()
    const classCount  = classesByEmail[email] ?? 0
    const txInfo      = txByEmail[email] ?? { count: 0, lastDate: null }
    const payCount    = txInfo.count
    const lastPayDate = txInfo.lastDate ?? null
    const waActive    = member.whatsapp_active ?? false
    const plan        = (member.plan as string) ?? 'monthly'

    const score = calcScore({ classCount, payCount, lastPayDate, plan, waActive })

    console.log(
      `[scoring] ${email}: classes=${classCount}(${Math.min(classCount * 8, 40)}pts)` +
      ` pay=${payCount}(${Math.min(Math.floor(payCount / 2) * 4, 40)}pts)` +
      ` wa=${waActive ? 20 : 0}pts → ${score}`,
    )

    const { error: updateError } = await supabaseAdmin
      .from('spc_members')
      .update({ lead_score: score })
      .eq('id', member.id)

    if (updateError) {
      console.error(`[scoring] UPDATE failed for ${member.id} (${email}):`, updateError.message)
    } else {
      scores.push({ email, score })
    }
  }

  console.log(`[scoring] Done: ${scores.length}/${members.length} updated`)
  return { processed: scores.length, scores }
}
