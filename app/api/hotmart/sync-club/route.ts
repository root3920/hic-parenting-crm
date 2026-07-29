import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getAllClubMembers } from '@/lib/hotmart'

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const results = { synced: 0, total: 0, errors: [] as string[] }

  try {
    const members = await getAllClubMembers()
    results.total = members.length

    const now = new Date().toISOString()

    for (const m of members) {
      try {
        const userId = String(m.user_id)
        const email = m.email?.toLowerCase()
        if (!email) continue

        const { error } = await supabase.from('hotmart_club_members').upsert(
          {
            user_id: userId,
            email,
            name: m.name || null,
            status: m.status || null,
            engagement: m.engagement || null,
            role: m.role || null,
            type: m.type || null,
            access_count: m.access_count ?? 0,
            last_access_date: m.last_access_date ? new Date(m.last_access_date).toISOString() : null,
            first_access_date: m.first_access_date ? new Date(m.first_access_date).toISOString() : null,
            purchase_date: m.purchase_date ? new Date(m.purchase_date).toISOString() : null,
            progress_completed: m.progress?.completed ?? 0,
            progress_percentage: m.progress?.completed_percentage ?? 0,
            progress_total: m.progress?.total ?? 0,
            synced_at: now,
          },
          { onConflict: 'user_id' }
        )

        if (error) {
          results.errors.push(`${email}: ${error.message}`)
        } else {
          results.synced++
        }
      } catch (err: any) {
        results.errors.push(`Member error: ${err.message}`)
      }
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message, ...results }, { status: 500 })
  }

  console.log('[Hotmart Club Sync]', JSON.stringify(results))
  return NextResponse.json(results)
}
