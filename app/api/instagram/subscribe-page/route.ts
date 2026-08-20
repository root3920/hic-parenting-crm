import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * POST /api/instagram/subscribe-page
 *
 * Subscribes our Facebook Page to send webhook events to our app.
 * This is the Page-level subscription that Meta requires IN ADDITION
 * to the App-level webhook configuration.
 *
 * Uses the stored Page access token from instagram_connected_accounts.
 */
export async function POST() {
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

  const { data: account, error: accErr } = await svc
    .from('instagram_connected_accounts')
    .select('ig_user_id, fb_page_id, access_token')
    .order('connected_at', { ascending: false })
    .limit(1)
    .single()

  if (accErr || !account) {
    return NextResponse.json({ error: 'No Instagram account connected' }, { status: 400 })
  }

  if (!account.fb_page_id) {
    return NextResponse.json(
      { error: 'No Facebook Page ID stored. Disconnect and reconnect your Instagram account.' },
      { status: 400 },
    )
  }

  const pageId = account.fb_page_id
  const pageToken = account.access_token

  // Step 1: Subscribe the page
  const subscribeUrl = `https://graph.facebook.com/v21.0/${pageId}/subscribed_apps`
  console.log('[IG Subscribe] Subscribing page', pageId, 'to webhook events...')

  let subscribeResult: Record<string, unknown>
  try {
    const res = await fetch(subscribeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscribed_fields: 'messages',
        access_token: pageToken,
      }),
    })
    subscribeResult = await res.json()
    console.log('[IG Subscribe] Subscribe response:', JSON.stringify(subscribeResult))
  } catch (err) {
    return NextResponse.json(
      { error: `Network error calling subscribe: ${err}` },
      { status: 502 },
    )
  }

  // Step 2: Verify by listing subscriptions
  let verifyResult: Record<string, unknown> | null = null
  try {
    const verifyRes = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}/subscribed_apps?access_token=${pageToken}`,
    )
    verifyResult = await verifyRes.json()
    console.log('[IG Subscribe] Verify response:', JSON.stringify(verifyResult))
  } catch (err) {
    console.error('[IG Subscribe] Verify call failed:', err)
  }

  return NextResponse.json({
    page_id: pageId,
    ig_business_account_id: account.ig_user_id,
    subscribe_response: subscribeResult,
    verify_response: verifyResult,
  })
}

/**
 * GET /api/instagram/subscribe-page
 *
 * Check current page subscription status.
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

  const { data: account, error: accErr } = await svc
    .from('instagram_connected_accounts')
    .select('ig_user_id, fb_page_id, access_token')
    .order('connected_at', { ascending: false })
    .limit(1)
    .single()

  if (accErr || !account) {
    return NextResponse.json({ error: 'No Instagram account connected' }, { status: 400 })
  }

  if (!account.fb_page_id) {
    return NextResponse.json({ error: 'No Facebook Page ID stored' }, { status: 400 })
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${account.fb_page_id}/subscribed_apps?access_token=${account.access_token}`,
    )
    const data = await res.json()
    return NextResponse.json({
      page_id: account.fb_page_id,
      ig_business_account_id: account.ig_user_id,
      subscriptions: data,
    })
  } catch (err) {
    return NextResponse.json({ error: `Failed: ${err}` }, { status: 502 })
  }
}
