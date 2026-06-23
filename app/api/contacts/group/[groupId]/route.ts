import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const LOW_TICKET_PRODUCTS: Record<string, string[]> = {
  'The Coping Strategies': ['coping strategies'],
  'The Tantrums Workshop': ['tantrums'],
  'Discipline Without Harm': ['discipline without harm'],
  'Break The Yelling Cycle': ['yelling cycle'],
  'Navigating Feelings Toolkit': ['navigating feelings', 'navigating emotions'],
  'The U.S.E Framework Workshop': ['use framework', 'u.s.e'],
}

const MID_TICKET_PRODUCTS: Record<string, string[]> = {
  'Raising Secure Children': ['raising secure children'],
}

const HIGH_TICKET_PRODUCTS: Record<string, string[]> = {
  'Parenting With Understanding': ['parenting with understanding'],
}

const PAGE_SIZE = 50
const FETCH_PAGE = 1000

/** Fetch all matching transactions, paginating past Supabase 1000-row limit. */
async function fetchAllMatching(
  svc: ReturnType<typeof getServiceClient>,
  orClauses: string,
  search: string,
) {
  const all: {
    buyer_email: string
    buyer_name: string | null
    buyer_phone: string | null
    offer_title: string
    date: string
    source: string | null
  }[] = []
  let from = 0
  while (true) {
    let query = svc
      .from('transactions')
      .select('buyer_email, buyer_name, buyer_phone, offer_title, date, source')
      .or('status.eq.completed,status.is.null')
      .or(orClauses)
      .order('date', { ascending: false })
      .range(from, from + FETCH_PAGE - 1)

    if (search) {
      query = query.or(`buyer_email.ilike.%${search}%,buyer_name.ilike.%${search}%`)
    }

    const { data, error } = await query
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < FETCH_PAGE) break
    from += FETCH_PAGE
  }
  return all
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { groupId } = await params
  const product = req.nextUrl.searchParams.get('product') || ''
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1'))
  const search = (req.nextUrl.searchParams.get('search') || '').toLowerCase().trim()

  const svc = getServiceClient()
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  if (groupId === 'freebies') {
    let query = svc
      .from('freebie_leads')
      .select('*', { count: 'exact' })
      .order('purchase_date', { ascending: false })

    if (product) query = query.eq('product', product)
    if (search) {
      query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`)
    }
    query = query.range(from, to)

    const { data, count, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const contacts = (data ?? []).map((r) => ({
      email: r.email,
      name: [r.first_name, r.last_name].filter(Boolean).join(' ') || null,
      phone: r.phone,
      source: r.source,
      date: r.purchase_date,
      product: r.product,
      instagram: r.instagram,
    }))

    return NextResponse.json({ contacts, total: count ?? 0, page, pageSize: PAGE_SIZE })
  }

  if (groupId === 'program') {
    let query = svc
      .from('spc_members')
      .select('email, name, phone, joined_at, provider', { count: 'exact' })
      .eq('status', 'active')
      .order('joined_at', { ascending: false })

    if (search) {
      query = query.or(`email.ilike.%${search}%,name.ilike.%${search}%`)
    }
    query = query.range(from, to)

    const { data, count, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const contacts = (data ?? []).map((r) => ({
      email: r.email,
      name: r.name,
      phone: r.phone,
      source: r.provider,
      date: r.joined_at,
      product: 'Secure Parent Collective',
      instagram: null,
    }))

    return NextResponse.json({ contacts, total: count ?? 0, page, pageSize: PAGE_SIZE })
  }

  // Transaction-based groups (low-ticket, mid-ticket, high-ticket)
  if (!['low-ticket', 'mid-ticket', 'high-ticket'].includes(groupId)) {
    return NextResponse.json({ error: 'Unknown group' }, { status: 400 })
  }

  // Mid-ticket: exact match on offer_title + cost=470 (no bundles)
  if (groupId === 'mid-ticket') {
    return handleMidTicket(svc, search, from, to, page)
  }

  const productMap = groupId === 'low-ticket' ? LOW_TICKET_PRODUCTS : HIGH_TICKET_PRODUCTS

  // Build ILIKE filter for the product or all products in the group
  const patterns: string[] = []
  if (product && productMap[product]) {
    patterns.push(...productMap[product])
  } else {
    for (const pats of Object.values(productMap)) {
      patterns.push(...pats)
    }
  }

  const orClauses = patterns.map((p) => `offer_title.ilike.%${p}%`).join(',')

  // Fetch ALL matching transactions (no date filter, paginated past 1000-row limit)
  let allTx: Awaited<ReturnType<typeof fetchAllMatching>>
  try {
    allTx = await fetchAllMatching(svc, orClauses, search)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // Deduplicate by email, keep latest transaction per person (already ordered by date desc)
  const byEmail = new Map<string, {
    email: string
    name: string | null
    phone: string | null
    source: string | null
    date: string
    product: string
  }>()

  for (const tx of allTx) {
    if (!tx.buyer_email) continue
    const key = tx.buyer_email.toLowerCase()

    // Determine which product this matches
    let matchedProduct = ''
    const titleLower = (tx.offer_title || '').toLowerCase()
    for (const [pName, pats] of Object.entries(productMap)) {
      if (pats.some((p) => titleLower.includes(p))) {
        matchedProduct = pName
        break
      }
    }
    if (!matchedProduct) continue

    // If filtering by product, skip non-matching
    if (product && matchedProduct !== product) continue

    if (!byEmail.has(key)) {
      byEmail.set(key, {
        email: tx.buyer_email,
        name: tx.buyer_name,
        phone: tx.buyer_phone,
        source: tx.source,
        date: tx.date,
        product: matchedProduct,
      })
    }
  }

  const all = Array.from(byEmail.values())
  const total = all.length
  const contacts = all.slice(from, to + 1)

  return NextResponse.json({ contacts, total, page, pageSize: PAGE_SIZE })
}

/** Mid Ticket: offer_title in ('Raising Secure Children', 'Bundle: Secure Parent Collective + Raising Secure Children (Yearly)') AND cost=470 */
async function handleMidTicket(
  svc: ReturnType<typeof getServiceClient>,
  search: string,
  from: number,
  to: number,
  page: number,
) {
  const all: {
    buyer_email: string
    buyer_name: string | null
    buyer_phone: string | null
    date: string
    source: string | null
    offer_title: string | null
  }[] = []
  let offset = 0
  while (true) {
    let query = svc
      .from('transactions')
      .select('buyer_email, buyer_name, buyer_phone, date, source, offer_title')
      .or('status.eq.completed,status.is.null')
      .eq('cost', 470)
      .in('offer_title', ['Raising Secure Children', 'Bundle: Secure Parent Collective + Raising Secure Children (Yearly)'])
      .order('date', { ascending: false })
      .range(offset, offset + FETCH_PAGE - 1)

    if (search) {
      query = query.or(`buyer_email.ilike.%${search}%,buyer_name.ilike.%${search}%`)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < FETCH_PAGE) break
    offset += FETCH_PAGE
  }

  // Deduplicate by email (keep most recent)
  const byEmail = new Map<string, {
    email: string
    name: string | null
    phone: string | null
    source: string | null
    date: string
    product: string
  }>()

  for (const tx of all) {
    if (!tx.buyer_email) continue
    const key = tx.buyer_email.toLowerCase()
    if (!byEmail.has(key)) {
      byEmail.set(key, {
        email: tx.buyer_email,
        name: tx.buyer_name,
        phone: tx.buyer_phone,
        source: tx.source,
        date: tx.date,
        product: tx.offer_title ?? 'Raising Secure Children',
      })
    }
  }

  const deduped = Array.from(byEmail.values())
  const total = deduped.length
  const contacts = deduped.slice(from, to + 1)

  return NextResponse.json({ contacts, total, page, pageSize: PAGE_SIZE })
}
