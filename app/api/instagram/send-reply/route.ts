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
 * Sends a reply to an Instagram DM conversation via ManyChat API.
 * Endpoint: POST https://api.manychat.com/fb/sending/sendContent
 * (ManyChat uses /fb/ for all channels including Instagram)
 */
export async function POST(req: NextRequest) {
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
    return NextResponse.json({ error: 'MANYCHAT_API_TOKEN not configured' }, { status: 500 })
  }

  const svc = getServiceClient()
  const reviewerName = profile.setter_name || profile.full_name || user.email || 'Unknown'
  const now = new Date().toISOString()

  // 1) Look up conversation
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
  const mcPayload = {
    subscriber_id: Number(subscriberId),
    data: {
      version: 'v2',
      content: {
        messages: [{ type: 'text', text: message_text }],
      },
    },
  }

  console.log('[Send Reply] Sending via ManyChat to subscriber:', subscriberId)
  console.log('[Send Reply] Payload:', JSON.stringify(mcPayload))

  try {
    const mcRes = await fetch('https://api.manychat.com/fb/sending/sendContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${manychatToken}`,
      },
      body: JSON.stringify(mcPayload),
    })

    const mcData = await mcRes.json()
    console.log('[Send Reply] ManyChat HTTP:', mcRes.status)
    console.log('[Send Reply] ManyChat response:', JSON.stringify(mcData, null, 2))

    if (!mcRes.ok || mcData.status !== 'success') {
      const errorMsg = mcData.code === 3011
        ? `ManyChat: la ventana de 24h expiró para este subscriber. Necesitas que el usuario envíe un nuevo mensaje primero.`
        : `ManyChat API error: ${mcData.message || JSON.stringify(mcData)}`

      return NextResponse.json({
        error: errorMsg,
        manychat_response: mcData,
        manychat_http_status: mcRes.status,
      }, { status: 502 })
    }

    console.log('[Send Reply] ✓ Sent via ManyChat')
  } catch (err) {
    console.error('[Send Reply] ManyChat network error:', err)
    return NextResponse.json(
      { error: `Failed to reach ManyChat API: ${err}` },
      { status: 502 },
    )
  }

  // 3) Record outbound message
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

  await svc
    .from('instagram_conversations')
    .update({ last_message_at: now })
    .eq('id', conversation_id)

  // 4) Update review queue
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
    sent_via: 'manychat',
    sent_to: conversation.ig_username,
  })
}
