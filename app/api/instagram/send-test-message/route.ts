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
 * POST /api/instagram/send-test-message
 *
 * Minimal standalone endpoint for App Review demo.
 * Sends a message directly via the Instagram Messaging API without requiring
 * a conversation to exist in our database.
 *
 * Body: {
 *   recipient_id: string  — Instagram-scoped user ID of the recipient
 *   message_text: string  — the text to send
 * }
 */
export async function POST(req: NextRequest) {
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await userSupabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'setter'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { recipient_id, message_text } = body as {
    recipient_id?: string
    message_text?: string
  }

  if (!recipient_id || !message_text) {
    return NextResponse.json(
      { error: 'recipient_id and message_text are required' },
      { status: 400 },
    )
  }

  const svc = getServiceClient()

  // Get connected account
  const { data: account, error: accErr } = await svc
    .from('instagram_connected_accounts')
    .select('ig_user_id, access_token')
    .order('connected_at', { ascending: false })
    .limit(1)
    .single()

  if (accErr || !account) {
    return NextResponse.json(
      { error: 'No Instagram account connected. Go to Settings → Instagram to connect.' },
      { status: 400 },
    )
  }

  const igBusinessAccountId = account.ig_user_id
  const pageAccessToken = account.access_token
  const sendUrl = `https://graph.facebook.com/v21.0/${igBusinessAccountId}/messages`

  try {
    const sendRes = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pageAccessToken}`,
      },
      body: JSON.stringify({
        recipient: { id: recipient_id },
        message: { text: message_text },
      }),
    })

    const sendData = await sendRes.json()

    console.log('[IG Send Test] HTTP status:', sendRes.status)
    console.log('[IG Send Test] Full response:', JSON.stringify(sendData, null, 2))

    // Always return the full raw response for debugging
    return NextResponse.json({
      ok: sendRes.ok && !sendData.error,
      http_status: sendRes.status,
      request: {
        url: sendUrl,
        recipient_id,
        ig_business_account_id: igBusinessAccountId,
      },
      raw_response: sendData,
    }, { status: sendRes.ok && !sendData.error ? 200 : 502 })
  } catch (err) {
    console.error('[IG Send Test] Network error:', err)
    return NextResponse.json(
      { error: `Failed to reach Instagram API: ${err}` },
      { status: 502 },
    )
  }
}
