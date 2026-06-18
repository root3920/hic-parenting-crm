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
  const productMap =
    groupId === 'low-ticket' ? LOW_TICKET_PRODUCTS :
    groupId === 'mid-ticket' ? MID_TICKET_PRODUCTS :
    groupId === 'high-ticket' ? HIGH_TICKET_PRODUCTS : null

  if (!productMap) {
    return NextResponse.json({ error: 'Unknown group' }, { status: 400 })
  }

  // Build ILIKE filter for the product or all products in the group
  const patterns: string[] = []
  if (product && productMap[product]) {
    patterns.push(...productMap[product])
  } else {
    for (const pats of Object.values(productMap)) {
      patterns.push(...pats)
    }
  }

  // Fetch matching transactions
  const orClauses = patterns.map((p) => `offer_title.ilike.%${p}%`).join(',')
  let query = svc
    .from('transactions')
    .select('buyer_email, buyer_name, buyer_phone, offer_title, date', { count: 'exact' })
    .or('status.eq.completed,status.is.null')
    .or(orClauses)
    .order('date', { ascending: false })

  if (search) {
    query = query.or(`buyer_email.ilike.%${search}%,buyer_name.ilike.%${search}%`)
  }

  // Deduplicate by email — fetch all matching then paginate in memory
  // (transactions can have multiple rows per person)
  const { data: allTx, error } = await query.range(0, 4999)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Deduplicate by email, keep latest transaction per person
  const byEmail = new Map<string, {
    email: string
    name: string | null
    phone: string | null
    source: string | null
    date: string
    product: string
  }>()

  for (const tx of allTx ?? []) {
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
        source: null,
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
