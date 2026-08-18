import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { STAGE_LABELS, STAGE_COLORS, type PipelineTier } from '@/lib/pipeline-tiers'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const PAGE = 1000

/**
 * GET /api/contacts/pipeline
 *
 * Returns contacts grouped by pipeline stage for Kanban display.
 * Reads from value_ladder_contacts (precomputed by /recompute).
 *
 * Query params:
 *   search  – filter by name/email (ilike)
 *   setter  – filter by setter_assigned (exact match, or "__unassigned__" for null)
 */
export async function GET(req: NextRequest) {
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = getServiceClient()
  const search = (req.nextUrl.searchParams.get('search') || '').toLowerCase().trim()
  const setter = (req.nextUrl.searchParams.get('setter') || '').trim()

  // Fetch all value_ladder_contacts (paginated)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: any[] = []
  let offset = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let query = svc
      .from('value_ladder_contacts')
      .select('buyer_email, buyer_name, current_stage, manual_override, updated_at, setter_assigned, lead_status')
      .order('updated_at', { ascending: false })
      .range(offset, offset + PAGE - 1)

    if (search) {
      query = query.or(`buyer_email.ilike.%${search}%,buyer_name.ilike.%${search}%`)
    }

    if (setter === '__unassigned__') {
      query = query.is('setter_assigned', null)
    } else if (setter) {
      query = query.eq('setter_assigned', setter)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
  }

  // Group by stage
  const stages: Record<number, {
    stage: number
    label: string
    color: string
    count: number
    contacts: { email: string; name: string | null; manual_override: boolean; updated_at: string; setter_assigned: string | null; lead_status: string | null }[]
  }> = {}

  for (let s = 1; s <= 6; s++) {
    stages[s] = {
      stage: s,
      label: STAGE_LABELS[s as PipelineTier],
      color: STAGE_COLORS[s as PipelineTier],
      count: 0,
      contacts: [],
    }
  }

  for (const row of all) {
    const stage = row.current_stage as number
    if (stage >= 1 && stage <= 6) {
      stages[stage].count++
      stages[stage].contacts.push({
        email: row.buyer_email,
        name: row.buyer_name,
        manual_override: row.manual_override || false,
        updated_at: row.updated_at,
        setter_assigned: row.setter_assigned ?? null,
        lead_status: row.lead_status ?? null,
      })
    }
  }

  return NextResponse.json({
    stages: [stages[1], stages[2], stages[3], stages[4], stages[5], stages[6]],
    total: all.length,
  })
}
