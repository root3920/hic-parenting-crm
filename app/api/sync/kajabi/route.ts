import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getKajabiToken, kajabiGetAll } from '@/lib/kajabi'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function runSync() {
  const token = await getKajabiToken()
  const results = { failed: 0, refunded: 0, updated: 0, errors: [] as string[] }

  const since = new Date()
  since.setDate(since.getDate() - 2)
  const sinceISO = since.toISOString()

  console.log('Fetching Kajabi transactions since', sinceISO)

  const transactions = await kajabiGetAll('/transactions', token, {
    'filter[created_at_gteq]': sinceISO,
    sort: '-created_at',
  })

  console.log(`Found ${transactions.length} Kajabi transactions`)

  for (const tx of transactions) {
    const attrs = tx.attributes
    const status: string = attrs.status

    if (!['failed', 'refunded', 'partially_refunded'].includes(status)) continue

    const mappedStatus =
      status === 'refunded' || status === 'partially_refunded' ? 'refunded' : 'failed'

    const offerTitle =
      attrs.offer_title || attrs.description || attrs.product_name || 'Kajabi Purchase'

    const { data: existing, error: lookupError } = await supabase
      .from('transactions')
      .select('id, status')
      .eq('transaction_id', String(tx.id))
      .eq('source', 'Kajabi')
      .maybeSingle()

    if (lookupError) {
      results.errors.push(`Lookup error for ${tx.id}: ${lookupError.message}`)
      continue
    }

    if (existing) {
      if (existing.status !== mappedStatus) {
        const { error } = await supabase
          .from('transactions')
          .update({ status: mappedStatus })
          .eq('id', existing.id)
        if (error) {
          results.errors.push(`Update error for ${tx.id}: ${error.message}`)
        } else {
          results.updated++
          console.log(`Updated ${tx.id}: ${existing.status} → ${mappedStatus}`)
        }
      }
    } else {
      const { error } = await supabase.from('transactions').insert({
        date:
          attrs.created_at?.split('T')[0] ?? new Date().toISOString().split('T')[0],
        offer_title: offerTitle,
        cost: Math.abs(
          parseFloat(attrs.amount ?? attrs.total_amount ?? '0')
        ),
        buyer_name: attrs.customer_name ?? attrs.name ?? null,
        buyer_email: attrs.customer_email ?? attrs.email ?? null,
        currency: attrs.currency ?? 'USD',
        transaction_id: String(tx.id),
        source: 'Kajabi',
        status: mappedStatus,
      })

      if (error) {
        console.error('Insert error:', error.message)
        results.errors.push(error.message)
      } else {
        if (mappedStatus === 'failed') results.failed++
        if (mappedStatus === 'refunded') results.refunded++
      }
    }
  }

  console.log('Sync complete:', results)
  return results
}

// POST — manual trigger (from sales page button or external call)
export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-sync-secret')
    if (process.env.SYNC_SECRET && secret !== process.env.SYNC_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const results = await runSync()
    return NextResponse.json({
      success: true,
      synced_at: new Date().toISOString(),
      ...results,
    })
  } catch (err: any) {
    console.error('Kajabi sync error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET — called by Vercel cron (x-vercel-cron: 1) or manual status check
export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'

  if (isCron) {
    try {
      const results = await runSync()
      return NextResponse.json({
        success: true,
        synced_at: new Date().toISOString(),
        ...results,
      })
    } catch (err: any) {
      console.error('Kajabi cron sync error:', err)
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
  }

  return NextResponse.json({
    status: 'Kajabi sync endpoint active',
    usage: 'POST to /api/sync/kajabi to trigger sync manually',
    schedule: 'Runs daily at 6:00 AM UTC via Vercel cron',
  })
}
