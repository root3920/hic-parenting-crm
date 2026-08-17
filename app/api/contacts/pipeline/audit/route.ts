import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { classifyOfferTitle } from '@/lib/pipeline-tiers'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * GET /api/contacts/pipeline/audit
 *
 * Pulls every distinct offer_title from the transactions table, classifies each
 * using the pipeline-tiers mapping, and returns:
 *   - classified: { title, tier, exampleCost, count }[]
 *   - unclassified: { title, exampleCost, count }[]   (titles that matched NO pattern)
 *   - excluded: { title, count }[]                      (internal/test)
 *
 * Admin-only. Read-only — does not write anything.
 */
export async function GET() {
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

  // Fetch all distinct offer_title + a representative cost and count
  // Paginate past the 1000-row limit
  const titleMap = new Map<string, { cost: number; count: number }>()
  let offset = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await svc
      .from('transactions')
      .select('offer_title, cost')
      .or('status.eq.completed,status.is.null')
      .range(offset, offset + PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    for (const row of data) {
      const title = row.offer_title ?? '(null)'
      const existing = titleMap.get(title)
      if (existing) {
        existing.count++
      } else {
        titleMap.set(title, { cost: Number(row.cost) || 0, count: 1 })
      }
    }
    if (data.length < PAGE) break
    offset += PAGE
  }

  const classified: { title: string; tier: string; exampleCost: number; count: number }[] = []
  const unclassified: { title: string; exampleCost: number; count: number }[] = []
  const excluded: { title: string; count: number }[] = []

  for (const [title, info] of Array.from(titleMap.entries())) {
    const tier = classifyOfferTitle(title)
    if (tier === 'exclude') {
      excluded.push({ title, count: info.count })
    } else if (tier) {
      classified.push({ title, tier, exampleCost: info.cost, count: info.count })
    } else {
      unclassified.push({ title, exampleCost: info.cost, count: info.count })
    }
  }

  // Sort for readability
  classified.sort((a, b) => a.tier.localeCompare(b.tier) || a.title.localeCompare(b.title))
  unclassified.sort((a, b) => b.count - a.count)

  return NextResponse.json({
    summary: {
      total_distinct_titles: titleMap.size,
      classified: classified.length,
      unclassified: unclassified.length,
      excluded: excluded.length,
    },
    classified,
    unclassified,
    excluded,
  })
}
