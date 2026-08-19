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
    const tokenUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token')
    tokenUrl.searchParams.set('client_id', appId)
    tokenUrl.searchParams.set('client_secret', appSecret)
    tokenUrl.searchParams.set('redirect_uri', redirectUri)
    tokenUrl.searchParams.set('code', code)

    const tokenRes = await fetch(tokenUrl.toString())
    const tokenData = await tokenRes.json()

    if (tokenData.error) {
      console.error('[IG OAuth] Token exchange error:', tokenData.error)
      return NextResponse.redirect(
        new URL(`/settings/instagram?error=token_exchange_failed`, req.url).toString(),
      )
    }

    const shortLivedToken = tokenData.access_token

    // ── 2) Exchange for long-lived token ──────────────────────────────────
    const longLivedUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token')
    longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token')
    longLivedUrl.searchParams.set('client_id', appId)
    longLivedUrl.searchParams.set('client_secret', appSecret)
    longLivedUrl.searchParams.set('fb_exchange_token', shortLivedToken)

    const longLivedRes = await fetch(longLivedUrl.toString())
    const longLivedData = await longLivedRes.json()

    const accessToken = longLivedData.access_token || shortLivedToken
    const tokenType = longLivedData.access_token ? 'long_lived' : 'short_lived'

    // ── 3) Get the user's Instagram Business Account(s) ───────────────────
    // First get the Facebook Pages the user manages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${accessToken}`,
    )
    const pagesData = await pagesRes.json()

    let igUserId: string | null = null
    let igUsername: string | null = null
    let igProfilePic: string | null = null
    let igName: string | null = null

    // For each page, check if it has a connected Instagram Business Account
    for (const page of pagesData.data ?? []) {
      const igRes = await fetch(
        `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${accessToken}`,
      )
      const igData = await igRes.json()

      if (igData.instagram_business_account?.id) {
        igUserId = igData.instagram_business_account.id

        // Get IG profile details
        const profileRes = await fetch(
          `https://graph.facebook.com/v21.0/${igUserId}?fields=username,name,profile_picture_url&access_token=${accessToken}`,
        )
        const profileData = await profileRes.json()

        igUsername = profileData.username || igUserId
        igProfilePic = profileData.profile_picture_url || null
        igName = profileData.name || null
        break
      }
    }

    // If no Instagram Business Account found via pages, try the direct
    // Instagram API (for accounts connected via instagram_business_basic)
    if (!igUserId) {
      const meRes = await fetch(
        `https://graph.instagram.com/v21.0/me?fields=user_id,username,name,profile_picture_url&access_token=${accessToken}`,
      )
      const meData = await meRes.json()

      if (meData.user_id || meData.id) {
        igUserId = meData.user_id || meData.id
        igUsername = meData.username || igUserId
        igProfilePic = meData.profile_picture_url || null
        igName = meData.name || null
      }
    }

    if (!igUserId) {
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
