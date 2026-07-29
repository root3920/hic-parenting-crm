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
    console.log('[Hotmart Club Sync] Starting sync...')
    const members = await getAllClubMembers()
    results.total = members.length
    console.log(`[Hotmart Club Sync] Fetched ${members.length} members from API`)

    if (!members || members.length === 0) {
      console.log('[Hotmart Club Sync] No members returned from Hotmart Club API')
      return NextResponse.json({ synced: 0, total: 0, message: 'No members returned from Hotmart Club API' })
    }

    const now = new Date().toISOString()

    for (const m of members) {
      try {
        const userId = String(m.user_id)
        const email = m.email?.toLowerCase()
        if (!email) {
          console.log('[Hotmart Club Sync] Skipping member with no email, user_id:', userId)
          continue
        }

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
          console.error(`[Hotmart Club Sync] Upsert error for ${email}:`, error.message)
          results.errors.push(`${email}: ${error.message}`)
        } else {
          results.synced++
        }
      } catch (err: any) {
        console.error('[Hotmart Club Sync] Member error:', err.message)
        results.errors.push(`Member error: ${err.message}`)
      }
    }
  } catch (err: any) {
    console.error('[Hotmart Club Sync] Fatal error:', err.message)
    return NextResponse.json({ error: err.message, ...results }, { status: 500 })
  }

  console.log('[Hotmart Club Sync] Complete:', JSON.stringify(results))
  return NextResponse.json(results)
}
