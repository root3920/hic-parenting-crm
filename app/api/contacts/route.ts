import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))
  const search = searchParams.get('search') || ''
  const status = searchParams.get('status') || ''
  const tag = searchParams.get('tag') || ''
  const dateFilter = searchParams.get('date') || ''

  const from = (page - 1) * limit
  const to = page * limit - 1

  let query = supabase
    .from('contacts')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
  }

  if (status && status !== 'All') {
    query = query.eq('status', status)
  }

  if (tag && tag !== 'All') {
    if (tag === 'No tags') {
      query = query.or('tags.is.null,tags.eq.{}')
    } else {
      query = query.contains('tags', [tag])
    }
  }

  if (dateFilter && dateFilter !== 'all') {
    const now = new Date()
    let since: Date
    if (dateFilter === 'today') {
      since = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    } else if (dateFilter === '7d') {
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    } else {
      since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    }
    query = query.gte('created_at', since.toISOString())
  }

  query = query.range(from, to)

  const { data, count, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const total = count ?? 0
  const totalPages = Math.ceil(total / limit)

  return NextResponse.json({
    data: data ?? [],
    total,
    page,
    limit,
    totalPages,
  })
}
