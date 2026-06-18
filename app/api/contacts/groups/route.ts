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

  // 3. Transactions — classify into Low/Mid/High ticket
  const { data: transactions } = await svc
    .from('transactions')
    .select('offer_title')
    .or('status.eq.completed,status.is.null')

  const lowTicketGroups: Record<string, number> = {}
  const midTicketGroups: Record<string, number> = {}
  const highTicketGroups: Record<string, number> = {}
  let lowTotal = 0
  let midTotal = 0
  let highTotal = 0

  for (const tx of transactions ?? []) {
    const title = tx.offer_title || ''

    for (const product of LOW_TICKET_PRODUCTS) {
      if (matchProduct(title, product.patterns)) {
        lowTicketGroups[product.name] = (lowTicketGroups[product.name] || 0) + 1
        lowTotal++
        break
      }
    }

    for (const product of MID_TICKET_PRODUCTS) {
      if (matchProduct(title, product.patterns)) {
        midTicketGroups[product.name] = (midTicketGroups[product.name] || 0) + 1
        midTotal++
        break
      }
    }

    for (const product of HIGH_TICKET_PRODUCTS) {
      if (matchProduct(title, product.patterns)) {
        highTicketGroups[product.name] = (highTicketGroups[product.name] || 0) + 1
        highTotal++
        break
      }
    }
  }

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
