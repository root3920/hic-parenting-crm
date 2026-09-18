/**
 * One-time cleanup: removes duplicate rows from setter_daily_queue.
 *
 * For each (contact_email, setter_name) group with multiple active rows,
 * keeps the row with the most "progressed" status (or most recent if tied)
 * and deletes the rest.
 *
 * Usage: npx tsx scripts/cleanup-duplicate-queue-rows.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const STATUS_RANK: Record<string, number> = {
  not_contacted: 1,
  contacted: 2,
  following_up: 3,
  call_proposed: 4,
  call_scheduled: 5,
}

async function main() {
  console.log('Fetching all active queue items...')

  const { data: allItems, error } = await svc
    .from('setter_daily_queue')
    .select('id, contact_email, setter_name, status, assigned_date, status_updated_at')
    .in('status', ['not_contacted', 'contacted', 'following_up', 'call_proposed', 'call_scheduled'])
    .order('assigned_date', { ascending: false })

  if (error) {
    console.error('Failed to fetch:', error.message)
    process.exit(1)
  }

  if (!allItems || allItems.length === 0) {
    console.log('No items found.')
    return
  }

  console.log(`Total active rows: ${allItems.length}`)

  // Group by contact_email + setter_name
  const groups: Record<string, typeof allItems> = {}
  for (const item of allItems) {
    const key = `${item.contact_email}|${item.setter_name}`
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
  }

  const duplicateGroups = Object.entries(groups).filter(([, items]) => items.length > 1)
  console.log(`Groups with duplicates: ${duplicateGroups.length}`)

  if (duplicateGroups.length === 0) {
    console.log('No duplicates to clean up!')
    return
  }

  const idsToDelete: string[] = []

  for (const [, items] of duplicateGroups) {
    // Sort by status rank (desc), then assigned_date (desc)
    items.sort((a, b) => {
      const rankDiff = (STATUS_RANK[b.status] ?? 0) - (STATUS_RANK[a.status] ?? 0)
      if (rankDiff !== 0) return rankDiff
      return b.assigned_date.localeCompare(a.assigned_date)
    })

    // Keep the first (best), delete the rest
    const toDelete = items.slice(1)
    for (const item of toDelete) {
      idsToDelete.push(item.id)
    }
  }

  console.log(`Rows to delete: ${idsToDelete.length}`)
  console.log(`Rows to keep: ${allItems.length - idsToDelete.length}`)

  // Delete in batches of 100
  const BATCH = 100
  let deleted = 0
  for (let i = 0; i < idsToDelete.length; i += BATCH) {
    const batch = idsToDelete.slice(i, i + BATCH)
    const { error: delErr } = await svc
      .from('setter_daily_queue')
      .delete()
      .in('id', batch)

    if (delErr) {
      console.error(`Delete batch failed at offset ${i}:`, delErr.message)
    } else {
      deleted += batch.length
      console.log(`  Deleted ${deleted}/${idsToDelete.length}...`)
    }
  }

  console.log(`\nDone! Removed ${deleted} duplicate rows.`)
}

main().catch(console.error)
