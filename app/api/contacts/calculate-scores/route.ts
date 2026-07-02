import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const FETCH_PAGE = 1000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll<T>(
  svc: ReturnType<typeof getServiceClient>,
  table: string,
  select: string,
  filters?: (q: any) => any,
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  while (true) {
    let query: any = svc.from(table).select(select).range(from, from + FETCH_PAGE - 1)
    if (filters) query = filters(query)
    const { data, error } = await query
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < FETCH_PAGE) break
    from += FETCH_PAGE
  }
  return all
}

function getScoreLabel(score: number): string {
  if (score <= 20) return 'cold'
  if (score <= 40) return 'warm'
  if (score <= 70) return 'hot'
  return 'loyal'
}

const LOW_TICKET_PATTERNS: Record<string, string[]> = {
  'The Coping Strategies': ['coping strategies'],
  'The Tantrums Workshop': ['tantrums'],
  'Discipline Without Harm': ['discipline without harm'],
  'Break The Yelling Cycle': ['yelling cycle'],
  'Navigating Feelings Toolkit': ['navigating feelings', 'navigating emotions'],
  'The U.S.E Framework Workshop': ['use framework', 'u.s.e'],
}

export async function POST() {
  // Auth check — admin only
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await userSupabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const svc = getServiceClient()

  // Gather all data sources
  const [surveys, transactions, calls, spcMembers, freebieLeads] = await Promise.all([
    fetchAll<{ email: string }>(svc, 'survey_responses', 'email'),
    fetchAll<{ buyer_email: string; offer_title: string; cost: number }>(
      svc, 'transactions', 'buyer_email, offer_title, cost',
      (q) => q.or('status.eq.completed,status.is.null'),
    ),
    fetchAll<{ email: string }>(svc, 'calls', 'email'),
    fetchAll<{ email: string; joined_at: string; status: string }>(
      svc, 'spc_members', 'email, joined_at, status',
      (q) => q.eq('status', 'active'),
    ),
    fetchAll<{ email: string }>(svc, 'freebie_leads', 'email'),
  ])

  // Build lookup sets
  const surveyEmails = new Set(surveys.map((s) => s.email?.toLowerCase()).filter(Boolean))
  const callEmails = new Set(calls.map((c) => c.email?.toLowerCase()).filter(Boolean))

  // SPC members by email
  const spcByEmail = new Map<string, string>()
  for (const m of spcMembers) {
    const e = m.email?.toLowerCase()
    if (e) spcByEmail.set(e, m.joined_at)
  }

  // Process transactions per email
  const emailLowTickets = new Map<string, Set<string>>()
  const emailHasMidTicket = new Set<string>()
  const emailHasHighTicket = new Set<string>()

  for (const tx of transactions) {
    const email = (tx.buyer_email || '').toLowerCase()
    if (!email) continue
    const title = (tx.offer_title || '').toLowerCase()

    // High ticket check
    if (title.includes('parenting with understanding') && !title.includes('bundle')) {
      emailHasHighTicket.add(email)
    }

    // Mid ticket check
    const isMidTicket = (
      ['Raising Secure Children', 'Bundle: Secure Parent Collective + Raising Secure Children (Yearly)'].includes(tx.offer_title || '')
      && Number(tx.cost) === 470
    )
    if (isMidTicket) {
      emailHasMidTicket.add(email)
    }

    // Low ticket check
    for (const [productName, patterns] of Object.entries(LOW_TICKET_PATTERNS)) {
      if (patterns.some((p) => title.includes(p))) {
        if (!emailLowTickets.has(email)) emailLowTickets.set(email, new Set())
        emailLowTickets.get(email)!.add(productName)
        break
      }
    }
  }

  // Collect all unique emails
  const allEmails = new Set<string>()
  for (const s of surveys) if (s.email) allEmails.add(s.email.toLowerCase())
  for (const tx of transactions) if (tx.buyer_email) allEmails.add(tx.buyer_email.toLowerCase())
  for (const c of calls) if (c.email) allEmails.add(c.email.toLowerCase())
  for (const m of spcMembers) if (m.email) allEmails.add(m.email.toLowerCase())
  for (const f of freebieLeads) if (f.email) allEmails.add(f.email.toLowerCase())

  // Calculate scores
  const now = new Date()
  const scores: {
    email: string
    score: number
    score_breakdown: Record<string, unknown>
    score_label: string
  }[] = []

  for (const email of Array.from(allEmails)) {
    // Survey: 5 pts
    const surveyPts = surveyEmails.has(email) ? 5 : 0

    // Low ticket: 10 base + 2 per additional (max 16)
    const ltProducts = emailLowTickets.get(email)
    let lowTicketPts = 0
    const ltProductNames: string[] = []
    if (ltProducts && ltProducts.size > 0) {
      ltProductNames.push(...Array.from(ltProducts))
      lowTicketPts = Math.min(16, 10 + (ltProducts.size - 1) * 2)
    }

    // Mid ticket: 15 pts
    const midTicketPts = emailHasMidTicket.has(email) ? 15 : 0

    // High ticket: 40 pts
    const highTicketPts = emailHasHighTicket.has(email) ? 40 : 0

    // Call (no high ticket): 25 pts
    const callNoHtPts = (callEmails.has(email) && !emailHasHighTicket.has(email)) ? 25 : 0

    // SPC: 20 base + 1 per month (max 9 bonus = 29 total)
    let spcPts = 0
    let spcMonths = 0
    const joinedAt = spcByEmail.get(email)
    if (joinedAt) {
      const joinDate = new Date(joinedAt)
      spcMonths = Math.floor(
        (now.getFullYear() - joinDate.getFullYear()) * 12
        + (now.getMonth() - joinDate.getMonth())
      )
      if (spcMonths < 0) spcMonths = 0
      spcPts = 20 + Math.min(9, spcMonths)
    }

    const total = Math.min(100, surveyPts + lowTicketPts + midTicketPts + highTicketPts + callNoHtPts + spcPts)

    scores.push({
      email,
      score: total,
      score_breakdown: {
        survey: surveyPts,
        low_ticket: lowTicketPts,
        low_ticket_products: ltProductNames,
        mid_ticket: midTicketPts,
        call_no_ht: callNoHtPts,
        spc: spcPts,
        spc_months: spcMonths,
        high_ticket: highTicketPts,
        total,
      },
      score_label: getScoreLabel(total),
    })
  }

  // Upsert in batches of 200
  const BATCH_SIZE = 200
  let processed = 0

  for (let i = 0; i < scores.length; i += BATCH_SIZE) {
    const batch = scores.slice(i, i + BATCH_SIZE)
    const { error } = await svc
      .from('contact_scores')
      .upsert(
        batch.map((s) => ({
          email: s.email,
          score: s.score,
          score_breakdown: s.score_breakdown,
          score_label: s.score_label,
          last_calculated: new Date().toISOString(),
        })),
        { onConflict: 'email' },
      )
    if (error) {
      console.error('Batch upsert error:', error)
    } else {
      processed += batch.length
    }
  }

  return NextResponse.json({ processed, total: scores.length })
}
