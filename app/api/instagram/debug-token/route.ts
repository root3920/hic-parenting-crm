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
 * GET /api/instagram/debug-token
 *
 * Admin-only. Calls Meta's debug_token endpoint to inspect the stored
 * Page access token — shows granted scopes, expiry, validity.
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

  const appId = process.env.INSTAGRAM_APP_ID
  const appSecret = process.env.INSTAGRAM_APP_SECRET

  if (!appId || !appSecret) {
    return NextResponse.json({ error: 'INSTAGRAM_APP_ID/SECRET not configured' }, { status: 500 })
  }

  const svc = getServiceClient()

  const { data: account, error: accErr } = await svc
    .from('instagram_connected_accounts')
    .select('ig_user_id, ig_username, access_token, token_type, connected_at')
    .order('connected_at', { ascending: false })
    .limit(1)
    .single()

  if (accErr || !account) {
    return NextResponse.json({ error: 'No connected account found' }, { status: 400 })
  }

  // Call Meta's debug_token endpoint
  const debugUrl = `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(account.access_token)}&access_token=${appId}|${appSecret}`

  try {
    const debugRes = await fetch(debugUrl)
    const debugData = await debugRes.json()

    return NextResponse.json({
      account: {
        ig_user_id: account.ig_user_id,
        ig_username: account.ig_username,
        token_type_stored: account.token_type,
        connected_at: account.connected_at,
      },
      token_debug: debugData.data || debugData,
      raw_error: debugData.error || null,
    })
  } catch (err) {
    return NextResponse.json({ error: `Debug call failed: ${err}` }, { status: 500 })
  }
}
