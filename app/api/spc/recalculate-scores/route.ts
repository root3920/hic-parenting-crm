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

  // Count consecutive months (no gap > 45 days)
  let consecutive = 1
  for (let i = 1; i < paymentDates.length; i++) {
    const prev = new Date(paymentDates[i - 1]).getTime()
    const curr = new Date(paymentDates[i]).getTime()
    const gap  = (curr - prev) / (1000 * 60 * 60 * 24)
    if (gap <= 45) consecutive++
    else consecutive = 1 // reset on gap
  }

  let score = 0
  if (consecutive >= 3) score = 30
  else if (consecutive === 2) score = 15
  else if (consecutive === 1) score = 5

  // Deduct 10pts if most recent payment is overdue
  const lastDate = paymentDates[paymentDates.length - 1]
  const daysSinceLast = (Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)
  const overdueThreshold = plan === 'annual' ? 370 : 35
  if (daysSinceLast > overdueThreshold) score = Math.max(0, score - 10)

  return score
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { emails?: string[] }
    const filterEmails = body.emails ?? []

    // Fetch members (filtered if emails provided)
    let membersQuery = supabaseAdmin
      .from('spc_members')
      .select('id, email, plan, whatsapp_active')
      .in('status', ['active', 'trial'])

    if (filterEmails.length > 0) {
      membersQuery = membersQuery.in('email', filterEmails)
    }

    const { data: members, error: membersError } = await membersQuery
    if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 })
    if (!members || members.length === 0) return NextResponse.json({ updated: 0 })

    const emails = members.map((m: { email: string }) => m.email.toLowerCase())

    // Fetch attendance counts per email
    const { data: attendanceRows } = await supabaseAdmin
      .from('spc_class_attendance')
      .select('member_email')
      .in('member_email', emails)

    const attendanceByEmail: Record<string, number> = {}
    for (const row of (attendanceRows ?? [])) {
      const e = row.member_email.toLowerCase()
      attendanceByEmail[e] = (attendanceByEmail[e] ?? 0) + 1
    }

    // Fetch completed SPC transactions per email
    const { data: txRows } = await supabaseAdmin
      .from('transactions')
      .select('buyer_email, date')
      .in('buyer_email', emails)
      .ilike('offer_title', '%Secure Parent%')
      .eq('status', 'completed')
      .order('date', { ascending: true })

    const txByEmail: Record<string, string[]> = {}
    for (const tx of (txRows ?? [])) {
      const e = (tx.buyer_email ?? '').toLowerCase()
      if (!e) continue
      if (!txByEmail[e]) txByEmail[e] = []
      txByEmail[e].push(tx.date)
    }

    // Calculate and update scores
    const updates: { id: string; lead_score: number }[] = []

    for (const member of members) {
      const email = member.email.toLowerCase()

      const classCount = attendanceByEmail[email] ?? 0
      const attScore   = attendanceScore(classCount)

      const waScore    = member.whatsapp_active ? 20 : 0

      const plan       = (member.plan as 'monthly' | 'annual') ?? 'monthly'
      const payDates   = txByEmail[email] ?? []
      const payScore   = paymentConsistencyScore(payDates, plan)

      const total = Math.min(100, attScore + waScore + payScore)
      updates.push({ id: member.id, lead_score: total })
    }

    // Batch update in chunks of 50
    const CHUNK = 50
    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK)
      await supabaseAdmin.from('spc_members').upsert(
        chunk.map(({ id, lead_score }) => ({ id, lead_score })),
        { onConflict: 'id' }
      )
    }

    return NextResponse.json({ updated: updates.length })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
