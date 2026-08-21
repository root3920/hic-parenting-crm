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
 * POST /api/instagram/send-reply
 *
 * Sends a reply to an Instagram DM conversation via ManyChat's API.
 * Called by the review-queue PATCH handler when approving/editing a draft.
 *
 * Body: {
 *   conversation_id: string
 *   message_text: string
 *   review_queue_id?: string
 *   review_action?: 'approved' | 'edited_and_approved'
 * }
 *
 * ManyChat API endpoint:
 *   POST https://api.manychat.com/fb/subscriber/sendContent
 *   Header: Authorization: Bearer {MANYCHAT_API_TOKEN}
 *   Body: { subscriber_id, data: { version: "v2", content: { messages: [{ type: "text", text: "..." }] } } }
 */
export async function POST(req: NextRequest) {
  // Auth
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

  const manychatToken = process.env.MANYCHAT_API_TOKEN
  if (!manychatToken) {
    return NextResponse.json(
      { error: 'MANYCHAT_API_TOKEN not configured' },
      { status: 500 },
    )
  }

  const svc = getServiceClient()
  const reviewerName = profile.setter_name || profile.full_name || user.email || 'Unknown'
  const now = new Date().toISOString()

  // 1) Look up conversation to get the ManyChat subscriber_id (stored as ig_user_id)
  const { data: conversation, error: convErr } = await svc
    .from('instagram_conversations')
    .select('id, ig_user_id, ig_username')
    .eq('id', conversation_id)
    .single()

  if (convErr || !conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  const subscriberId = conversation.ig_user_id

  // 2) Send via ManyChat API
  console.log('[Send Reply] Sending to ManyChat subscriber:', subscriberId)

  let manychatSuccess = false
  let manychatResponse: Record<string, unknown> = {}

  try {
    const mcRes = await fetch('https://api.manychat.com/fb/sending/sendContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${manychatToken}`,
      },
      body: JSON.stringify({
        subscriber_id: Number(subscriberId),
        data: {
          version: 'v2',
          content: {
            messages: [
              { type: 'text', text: message_text },
            ],
          },
        },
      }),
    })

    manychatResponse = await mcRes.json()
    console.log('[Send Reply] ManyChat response:', JSON.stringify(manychatResponse))

    if (mcRes.ok && manychatResponse.status === 'success') {
      manychatSuccess = true
    } else {
      console.error('[Send Reply] ManyChat API error:', JSON.stringify(manychatResponse))
      return NextResponse.json(
        {
          error: `ManyChat API error: ${(manychatResponse as Record<string, unknown>).message || JSON.stringify(manychatResponse)}`,
          manychat_response: manychatResponse,
        },
        { status: 502 },
      )
    }
  } catch (err) {
    console.error('[Send Reply] ManyChat network error:', err)
    return NextResponse.json(
      { error: `Failed to reach ManyChat API: ${err}` },
      { status: 502 },
    )
  }

  // 3) Record outbound message in DB
  if (manychatSuccess) {
    const { error: msgErr } = await svc.from('instagram_messages').insert({
      conversation_id,
      direction: 'outbound',
      message_text,
      sent_at: now,
      ig_message_id: `mc_out_${conversation_id}_${now}`,
    })

    if (msgErr) {
      console.error('[Send Reply] DB insert error (message was sent):', msgErr)
    }

    // Update conversation last_message_at
    await svc
      .from('instagram_conversations')
      .update({ last_message_at: now })
      .eq('id', conversation_id)
  }

  // 4) Update review queue if applicable
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
    sent_to: conversation.ig_username,
    subscriber_id: subscriberId,
    manychat_response: manychatResponse,
  })
}
