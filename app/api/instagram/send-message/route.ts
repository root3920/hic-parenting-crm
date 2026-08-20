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
 * POST /api/instagram/send-message
 *
 * Sends a message via the Instagram Messaging API and records it.
 *
 * Body: {
 *   conversation_id: string   — our DB conversation id
 *   message_text: string      — the text to send
 *   review_queue_id?: string  — if coming from the review queue, update its status too
 *   review_action?: 'approved' | 'edited_and_approved'
 * }
 *
 * Flow:
 * 1. Look up the recipient's IG-scoped user ID from instagram_conversations
 * 2. Look up our connected account's IG Business Account ID + Page access token
 * 3. POST to https://graph.facebook.com/v21.0/{ig-business-account-id}/messages
 * 4. On success: insert outbound message, update review queue if applicable
 * 5. On failure: return the IG API error so the reviewer can see it and retry
 */
export async function POST(req: NextRequest) {
  // Auth check
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await userSupabase
    .from('profiles')
    .select('role, full_name, setter_name')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'setter'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { conversation_id, message_text, review_queue_id, review_action } = body as {
    conversation_id?: string
    message_text?: string
    review_queue_id?: string
    review_action?: string
  }

  if (!conversation_id || !message_text) {
    return NextResponse.json(
      { error: 'conversation_id and message_text are required' },
      { status: 400 },
    )
  }

  const svc = getServiceClient()
  const reviewerName = profile.setter_name || profile.full_name || user.email || 'Unknown'
  const now = new Date().toISOString()

  // ── 1) Look up recipient ────────────────────────────────────────────────
  const { data: conversation, error: convErr } = await svc
    .from('instagram_conversations')
    .select('id, ig_user_id, ig_username')
    .eq('id', conversation_id)
    .single()

  if (convErr || !conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  // ── 2) Look up connected account (Page access token + IG Business ID) ──
  const { data: connectedAccount, error: accErr } = await svc
    .from('instagram_connected_accounts')
    .select('ig_user_id, access_token')
    .order('connected_at', { ascending: false })
    .limit(1)
    .single()

  if (accErr || !connectedAccount) {
    return NextResponse.json(
      { error: 'No Instagram account connected. Go to Settings → Instagram to connect.' },
      { status: 400 },
    )
  }

  const igBusinessAccountId = connectedAccount.ig_user_id
  const pageAccessToken = connectedAccount.access_token

  // ── 3) Send via Instagram Messaging API ─────────────────────────────────
  const sendUrl = `https://graph.facebook.com/v21.0/${igBusinessAccountId}/messages`

  let igMessageId: string | null = null

  try {
    const sendRes = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pageAccessToken}`,
      },
      body: JSON.stringify({
        recipient: { id: conversation.ig_user_id },
        message: { text: message_text },
      }),
    })

    const sendData = await sendRes.json()

    if (!sendRes.ok || sendData.error) {
      const errMsg = sendData.error?.message || sendData.error?.error_user_msg || JSON.stringify(sendData.error)
      console.error('[IG Send] API error:', sendData)
      return NextResponse.json(
        {
          error: `Instagram API error: ${errMsg}`,
          ig_error: sendData.error,
        },
        { status: 502 },
      )
    }

    igMessageId = sendData.message_id || null
  } catch (err) {
    console.error('[IG Send] Network error:', err)
    return NextResponse.json(
      { error: `Failed to reach Instagram API: ${err}` },
      { status: 502 },
    )
  }

  // ── 4) Record outbound message ──────────────────────────────────────────
  const { error: msgErr } = await svc.from('instagram_messages').insert({
    conversation_id,
    direction: 'outbound',
    message_text,
    sent_at: now,
    ig_message_id: igMessageId,
  })

  if (msgErr) {
    // Message was sent but DB insert failed — log but don't fail the response
    console.error('[IG Send] DB insert error (message was sent):', msgErr)
  }

  // Update conversation last_message_at
  await svc
    .from('instagram_conversations')
    .update({ last_message_at: now })
    .eq('id', conversation_id)

  // ── 5) Update review queue if applicable ────────────────────────────────
  if (review_queue_id) {
    const reviewStatus = review_action === 'edited_and_approved'
      ? 'edited_and_approved'
      : 'approved'

    await svc
      .from('instagram_review_queue')
      .update({
        status: reviewStatus,
        final_response: review_action === 'edited_and_approved' ? message_text : null,
        reviewed_by: reviewerName,
        reviewed_at: now,
      })
      .eq('id', review_queue_id)
  }

  return NextResponse.json({
    ok: true,
    ig_message_id: igMessageId,
    sent_to: conversation.ig_username,
  })
}
