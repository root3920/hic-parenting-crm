import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

/**
 * GET /api/instagram/oauth/connect
 *
 * Initiates Meta's OAuth flow for Instagram Business accounts.
 * Redirects the user to Meta's authorization dialog.
 */
export async function GET(req: NextRequest) {
  // Verify admin
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const { data: profile } = await userSupabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const appId = process.env.INSTAGRAM_APP_ID
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI

  if (!appId || !redirectUri) {
    return NextResponse.json(
      { error: 'INSTAGRAM_APP_ID and INSTAGRAM_REDIRECT_URI must be configured' },
      { status: 500 },
    )
  }

  // Generate a state parameter to prevent CSRF
  const state = crypto.randomBytes(16).toString('hex')

  // Facebook Login flow (API setup with Facebook Login configuration)
  const authUrl = new URL('https://www.facebook.com/v21.0/dialog/oauth')
  authUrl.searchParams.set('client_id', appId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('scope', 'instagram_basic,instagram_manage_messages,pages_show_list,pages_manage_metadata,business_management')
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('state', state)

  const response = NextResponse.redirect(authUrl.toString())
  response.cookies.set('ig_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  })

  return response
}
