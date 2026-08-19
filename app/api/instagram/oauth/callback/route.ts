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
 * GET /api/instagram/oauth/callback
 *
 * Handles the redirect from Meta's OAuth dialog.
 * Exchanges the authorization code for an access token, fetches the
 * connected Instagram Business Account profile, and stores everything.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  // Handle user denying permission
  if (error) {
    const settingsUrl = new URL('/settings/instagram', req.url)
    settingsUrl.searchParams.set('error', error)
    return NextResponse.redirect(settingsUrl.toString())
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/settings/instagram?error=no_code', req.url).toString(),
    )
  }

  // Validate state against cookie
  const storedState = req.cookies.get('ig_oauth_state')?.value
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL('/settings/instagram?error=invalid_state', req.url).toString(),
    )
  }

  // Verify admin
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url).toString())
  }

  const appId = process.env.INSTAGRAM_APP_ID
  const appSecret = process.env.INSTAGRAM_APP_SECRET
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI

  if (!appId || !appSecret || !redirectUri) {
    return NextResponse.redirect(
      new URL('/settings/instagram?error=missing_config', req.url).toString(),
    )
  }

  try {
    // ── 1) Exchange code for short-lived token ────────────────────────────
    // Instagram Login flow uses api.instagram.com (POST with form body)
    const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      }).toString(),
    })
    const tokenData = await tokenRes.json()

    if (tokenData.error_type || tokenData.error_message || !tokenData.access_token) {
      console.error('[IG OAuth] Token exchange error:', tokenData)
      return NextResponse.redirect(
        new URL('/settings/instagram?error=token_exchange_failed', req.url).toString(),
      )
    }

    const shortLivedToken = tokenData.access_token

    // ── 2) Exchange for long-lived token ──────────────────────────────────
    // Instagram Login uses graph.instagram.com for long-lived exchange
    const longLivedUrl = new URL('https://graph.instagram.com/access_token')
    longLivedUrl.searchParams.set('grant_type', 'ig_exchange_token')
    longLivedUrl.searchParams.set('client_secret', appSecret)
    longLivedUrl.searchParams.set('access_token', shortLivedToken)

    const longLivedRes = await fetch(longLivedUrl.toString())
    const longLivedData = await longLivedRes.json()

    const accessToken = longLivedData.access_token || shortLivedToken
    const tokenType = longLivedData.access_token ? 'long_lived' : 'short_lived'

    // ── 3) Get Instagram profile directly ─────────────────────────────────
    // With Instagram Login, /me returns the IG account directly (no FB Pages lookup)
    const meRes = await fetch(
      `https://graph.instagram.com/v21.0/me?fields=user_id,username,name,profile_picture_url&access_token=${accessToken}`,
    )
    const meData = await meRes.json()

    const igUserId = meData.user_id || meData.id || null
    const igUsername = meData.username || igUserId
    const igProfilePic = meData.profile_picture_url || null
    const igName = meData.name || null

    if (!igUserId) {
      console.error('[IG OAuth] No user_id in /me response:', meData)
      return NextResponse.redirect(
        new URL('/settings/instagram?error=no_ig_account', req.url).toString(),
      )
    }

    // ── 4) Store in database ──────────────────────────────────────────────
    const svc = getServiceClient()

    const { error: upsertErr } = await svc
      .from('instagram_connected_accounts')
      .upsert(
        {
          ig_user_id: igUserId,
          ig_username: igUsername!,
          ig_profile_pic_url: igProfilePic,
          ig_name: igName,
          access_token: accessToken,
          token_type: tokenType,
          connected_by: user.id,
          connected_at: new Date().toISOString(),
        },
        { onConflict: 'ig_user_id' },
      )

    if (upsertErr) {
      console.error('[IG OAuth] Upsert error:', upsertErr)
      return NextResponse.redirect(
        new URL('/settings/instagram?error=db_error', req.url).toString(),
      )
    }

    // Success — redirect to settings with success flag
    const successUrl = new URL('/settings/instagram', req.url)
    successUrl.searchParams.set('connected', 'true')
    const response = NextResponse.redirect(successUrl.toString())
    // Clear the state cookie
    response.cookies.delete('ig_oauth_state')
    return response
  } catch (err) {
    console.error('[IG OAuth] Unexpected error:', err)
    return NextResponse.redirect(
      new URL('/settings/instagram?error=unexpected', req.url).toString(),
    )
  }
}
