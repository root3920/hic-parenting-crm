import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Product matching rules for transactions
const LOW_TICKET_PRODUCTS = [
  { name: 'The Coping Strategies', patterns: ['coping strategies'] },
  { name: 'The Tantrums Workshop', patterns: ['tantrums'] },
  { name: 'Discipline Without Harm', patterns: ['discipline without harm'] },
  { name: 'Break The Yelling Cycle', patterns: ['yelling cycle'] },
  { name: 'Navigating Feelings Toolkit', patterns: ['navigating feelings', 'navigating emotions'] },
  { name: 'The U.S.E Framework Workshop', patterns: ['use framework', 'u.s.e'] },
]

const MID_TICKET_PRODUCTS = [
  { name: 'Raising Secure Children', patterns: ['raising secure children'] },
]

const HIGH_TICKET_PRODUCTS = [
  { name: 'Parenting With Understanding', patterns: ['parenting with understanding'] },
]

function matchProduct(offerTitle: string, patterns: string[]): boolean {
  const lower = offerTitle.toLowerCase()
  return patterns.some((p) => lower.includes(p))
}

const PAGE_SIZE = 1000

/** Fetch all rows from a table, paginating past the 1000-row Supabase limit. */
async function fetchAllTransactions(svc: ReturnType<typeof getServiceClient>) {
  const all: { buyer_email: string; offer_title: string }[] = []
  let from = 0
  while (true) {
    const { data, error } = await svc
      .from('transactions')
      .select('buyer_email, offer_title')
      .or('status.eq.completed,status.is.null')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

export async function GET() {
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = getServiceClient()

  // 1. Freebies — group by product
  const { data: freebies } = await svc
    .from('freebie_leads')
    .select('product')

  const freebieGroups: Record<string, number> = {}
  let freebieTotal = 0
  for (const f of freebies ?? []) {
    const product = f.product || 'Unknown'
    freebieGroups[product] = (freebieGroups[product] || 0) + 1
    freebieTotal++
  }

  // 2. SPC Members (active)
  const { count: spcCount } = await svc
    .from('spc_members')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')

  // 3. Transactions — fetch ALL, classify, and deduplicate by email per product
  const transactions = await fetchAllTransactions(svc)

  // Deduplicate: count unique emails per product
  const lowTicketEmails: Record<string, Set<string>> = {}
  const midTicketEmails: Record<string, Set<string>> = {}
  const highTicketEmails: Record<string, Set<string>> = {}

  for (const tx of transactions) {
    const title = tx.offer_title || ''
    const email = (tx.buyer_email || '').toLowerCase()
    if (!email) continue

    for (const product of LOW_TICKET_PRODUCTS) {
      if (matchProduct(title, product.patterns)) {
        if (!lowTicketEmails[product.name]) lowTicketEmails[product.name] = new Set()
        lowTicketEmails[product.name].add(email)
        break
      }
    }

    for (const product of MID_TICKET_PRODUCTS) {
      if (matchProduct(title, product.patterns)) {
        if (!midTicketEmails[product.name]) midTicketEmails[product.name] = new Set()
        midTicketEmails[product.name].add(email)
        break
      }
    }

    for (const product of HIGH_TICKET_PRODUCTS) {
      if (matchProduct(title, product.patterns)) {
        if (!highTicketEmails[product.name]) highTicketEmails[product.name] = new Set()
        highTicketEmails[product.name].add(email)
        break
      }
    }
  }

  // Build subgroup counts from unique emails
  const lowTicketGroups: Record<string, number> = {}
  let lowTotal = 0
  const allLowEmails = new Set<string>()
  for (const [name, emails] of Object.entries(lowTicketEmails)) {
    lowTicketGroups[name] = emails.size
    for (const e of Array.from(emails)) allLowEmails.add(e)
  }
  lowTotal = allLowEmails.size

  const midTicketGroups: Record<string, number> = {}
  let midTotal = 0
  const allMidEmails = new Set<string>()
  for (const [name, emails] of Object.entries(midTicketEmails)) {
    midTicketGroups[name] = emails.size
    for (const e of Array.from(emails)) allMidEmails.add(e)
  }
  midTotal = allMidEmails.size

  const highTicketGroups: Record<string, number> = {}
  let highTotal = 0
  const allHighEmails = new Set<string>()
  for (const [name, emails] of Object.entries(highTicketEmails)) {
    highTicketGroups[name] = emails.size
    for (const e of Array.from(emails)) allHighEmails.add(e)
  }
  highTotal = allHighEmails.size

  return NextResponse.json({
    groups: [
      {
        id: 'freebies',
        name: 'Freebies',
        color: '#6B7280',
        total: freebieTotal,
        subgroups: Object.entries(freebieGroups).map(([name, count]) => ({ name, count })),
      },
      {
        id: 'program',
        name: 'Program (SPC)',
        color: '#8B5CF6',
        total: spcCount ?? 0,
        subgroups: [{ name: 'Secure Parent Collective', count: spcCount ?? 0 }],
      },
      {
        id: 'low-ticket',
        name: 'Low Tickets',
        color: '#3B82F6',
        total: lowTotal,
        subgroups: Object.entries(lowTicketGroups).map(([name, count]) => ({ name, count })),
      },
      {
        id: 'mid-ticket',
        name: 'Mid Ticket',
        color: '#F59E0B',
        total: midTotal,
        subgroups: Object.entries(midTicketGroups).map(([name, count]) => ({ name, count })),
      },
      {
        id: 'high-ticket',
        name: 'High Ticket',
        color: '#10B981',
        total: highTotal,
        subgroups: Object.entries(highTicketGroups).map(([name, count]) => ({ name, count })),
      },
    ],
  })
}
