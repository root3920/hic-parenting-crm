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
    // ── 1) Exchange code for user access token ────────────────────────────
    // Facebook Login flow uses graph.facebook.com
    const tokenUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token')
    tokenUrl.searchParams.set('client_id', appId)
    tokenUrl.searchParams.set('client_secret', appSecret)
    tokenUrl.searchParams.set('redirect_uri', redirectUri)
    tokenUrl.searchParams.set('code', code)

    const tokenRes = await fetch(tokenUrl.toString())
    const tokenData = await tokenRes.json()

    if (tokenData.error || !tokenData.access_token) {
      console.error('[IG OAuth] Token exchange error:', tokenData)
      return NextResponse.redirect(
        new URL('/settings/instagram?error=token_exchange_failed', req.url).toString(),
      )
    }

    const userAccessToken = tokenData.access_token

    // ── 2) Get Facebook Pages the user manages ────────────────────────────
    // Each Page has its own access_token — we need the Page token for messaging
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${userAccessToken}`,
    )
    const pagesData = await pagesRes.json()

    if (!pagesData.data?.length) {
      console.error('[IG OAuth] No Facebook Pages found:', pagesData)
      return NextResponse.redirect(
        new URL('/settings/instagram?error=no_ig_account', req.url).toString(),
      )
    }

    // ── 3) Find the Page linked to an Instagram Business Account ──────────
    let igUserId: string | null = null
    let igUsername: string | null = null
    let igProfilePic: string | null = null
    let igName: string | null = null
    let pageAccessToken: string | null = null
    let fbPageId: string | null = null

    for (const page of pagesData.data) {
      const igRes = await fetch(
        `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`,
      )
      const igData = await igRes.json()

      if (igData.instagram_business_account?.id) {
        igUserId = igData.instagram_business_account.id
        pageAccessToken = page.access_token
        fbPageId = page.id

        // Fetch IG profile details using the Page token
        const profileRes = await fetch(
          `https://graph.facebook.com/v21.0/${igUserId}?fields=username,name,profile_picture_url&access_token=${page.access_token}`,
        )
        const profileData = await profileRes.json()

        igUsername = profileData.username || igUserId
        igProfilePic = profileData.profile_picture_url || null
        igName = profileData.name || null
        break
      }
    }

    if (!igUserId || !pageAccessToken || !fbPageId) {
      console.error('[IG OAuth] No Instagram Business Account linked to any Page')
      return NextResponse.redirect(
        new URL('/settings/instagram?error=no_ig_account', req.url).toString(),
      )
    }

    // Page tokens obtained via a long-lived user token are themselves
    // long-lived (non-expiring). Exchange the short-lived user token first.
    let tokenType = 'page_token'

    const llUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token')
    llUrl.searchParams.set('grant_type', 'fb_exchange_token')
    llUrl.searchParams.set('client_id', appId)
    llUrl.searchParams.set('client_secret', appSecret)
    llUrl.searchParams.set('fb_exchange_token', userAccessToken)

    const llRes = await fetch(llUrl.toString())
    const llData = await llRes.json()

    console.log('[IG OAuth] Long-lived exchange result:', {
      success: !!llData.access_token,
      error: llData.error || null,
      expires_in: llData.expires_in || null,
    })

    if (llData.access_token) {
      // Re-fetch Pages with the long-lived user token → page tokens will be non-expiring
      const llPagesRes = await fetch(
        `https://graph.facebook.com/v21.0/me/accounts?access_token=${llData.access_token}`,
      )
      const llPagesData = await llPagesRes.json()

      console.log('[IG OAuth] Re-fetched pages with LL token:', {
        count: llPagesData.data?.length ?? 0,
        error: llPagesData.error || null,
      })

      for (const page of llPagesData.data ?? []) {
        const igCheck = await fetch(
          `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`,
        )
        const igCheckData = await igCheck.json()

        if (igCheckData.instagram_business_account?.id === igUserId) {
          pageAccessToken = page.access_token
          fbPageId = page.id
          tokenType = 'long_lived_page_token'
          console.log('[IG OAuth] Got long-lived page token for IG account', igUserId, 'Page ID:', page.id)
          break
        }
      }
    } else {
      console.warn('[IG OAuth] Long-lived exchange failed, storing short-lived page token. Error:', llData.error)
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
          fb_page_id: fbPageId,
          access_token: pageAccessToken,
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
