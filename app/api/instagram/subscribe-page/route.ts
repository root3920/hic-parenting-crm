import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

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

/**
 * PUT /api/instagram/subscribe-page
 *
 * Force resubscribe: DELETE → wait 5s → POST → GET verify.
 * Works around a known Meta platform issue where subscriptions appear
 * successful but silently fail to register in the event-dispatch system.
 */
export async function PUT(req: NextRequest) {
  void req // unused but required by Next.js route signature

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
      { error: 'No Facebook Page ID stored. Disconnect and reconnect.' },
      { status: 400 },
    )
  }

  const pageId = account.fb_page_id
  const pageToken = account.access_token
  const baseUrl = `https://graph.facebook.com/v21.0/${pageId}/subscribed_apps`

  const steps: Array<{ step: string; response: unknown }> = []

  // Step 1: DELETE — unsubscribe
  console.log('[IG ForceResub] Step 1: DELETE unsubscribe for page', pageId)
  try {
    const delRes = await fetch(`${baseUrl}?access_token=${pageToken}`, { method: 'DELETE' })
    const delData = await delRes.json()
    console.log('[IG ForceResub] DELETE response:', JSON.stringify(delData))
    steps.push({ step: '1_delete_unsubscribe', response: delData })
  } catch (err) {
    steps.push({ step: '1_delete_unsubscribe', response: { error: String(err) } })
  }

  // Step 2: Wait 5 seconds
  console.log('[IG ForceResub] Step 2: Waiting 5 seconds...')
  await new Promise((resolve) => setTimeout(resolve, 5000))
  steps.push({ step: '2_wait_5s', response: { waited: true } })

  // Step 3: POST — resubscribe
  console.log('[IG ForceResub] Step 3: POST resubscribe')
  try {
    const subRes = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscribed_fields: 'messages',
        access_token: pageToken,
      }),
    })
    const subData = await subRes.json()
    console.log('[IG ForceResub] POST response:', JSON.stringify(subData))
    steps.push({ step: '3_post_resubscribe', response: subData })
  } catch (err) {
    steps.push({ step: '3_post_resubscribe', response: { error: String(err) } })
  }

  // Step 4: GET — verify
  console.log('[IG ForceResub] Step 4: GET verify')
  try {
    const verRes = await fetch(`${baseUrl}?access_token=${pageToken}`)
    const verData = await verRes.json()
    console.log('[IG ForceResub] GET verify response:', JSON.stringify(verData))
    steps.push({ step: '4_get_verify', response: verData })
  } catch (err) {
    steps.push({ step: '4_get_verify', response: { error: String(err) } })
  }

  return NextResponse.json({
    page_id: pageId,
    ig_business_account_id: account.ig_user_id,
    steps,
  })
}
