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
 * Sends a reply to an Instagram DM conversation.
 *
 * Strategy:
 *   1. Try ManyChat API first (/fb/sending/sendContent, no tag — works within 24h)
 *   2. If ManyChat fails with 24h window error (code 3011), fall back to
 *      Instagram Graph API with HUMAN_AGENT tag (7-day window).
 *      Uses ManyChat's getInfo to resolve the real IG-scoped user ID,
 *      then sends via our stored Page access token.
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
  let sentVia: 'manychat' | 'graph_api' = 'manychat'

  // ── 2a) Try ManyChat first (works within 24h window) ───────────────────
  console.log('[Send Reply] Attempting ManyChat send to subscriber:', subscriberId)

  const mcPayload = {
    subscriber_id: Number(subscriberId),
    data: {
      version: 'v2',
      content: {
        messages: [{ type: 'text', text: message_text }],
      },
    },
  }

  let sendSuccess = false

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
    console.log('[Send Reply] ManyChat response:', JSON.stringify(mcData))

    if (mcRes.ok && mcData.status === 'success') {
      sendSuccess = true
    } else if (mcData.code === 3011) {
      // 24h window expired — fall back to Graph API with HUMAN_AGENT
      console.log('[Send Reply] 24h window expired, falling back to Graph API with HUMAN_AGENT')
      sentVia = 'graph_api'
    } else {
      // Other ManyChat error — report it
      return NextResponse.json({
        error: `ManyChat API error: ${mcData.message || JSON.stringify(mcData)}`,
        manychat_response: mcData,
      }, { status: 502 })
    }
  } catch (err) {
    console.error('[Send Reply] ManyChat network error:', err)
    return NextResponse.json(
      { error: `Failed to reach ManyChat API: ${err}` },
      { status: 502 },
    )
  }

  // ── 2b) Graph API fallback with HUMAN_AGENT tag ────────────────────────
  if (!sendSuccess && sentVia === 'graph_api') {
    // Get the real IG-scoped user ID from ManyChat subscriber info
    let igScopedId: string | null = null
    try {
      const infoRes = await fetch(
        `https://api.manychat.com/fb/subscriber/getInfo?subscriber_id=${subscriberId}`,
        { headers: { Authorization: `Bearer ${manychatToken}` } },
      )
      const infoData = await infoRes.json()
      igScopedId = infoData.data?.ig_id ? String(infoData.data.ig_id) : null
      console.log('[Send Reply] Resolved IG-scoped ID:', igScopedId)
    } catch (err) {
      console.error('[Send Reply] Failed to get subscriber info:', err)
    }

    if (!igScopedId) {
      return NextResponse.json({
        error: '24h window expired and could not resolve Instagram user ID for Graph API fallback',
      }, { status: 502 })
    }

    // Get our connected account's Page token + IG Business Account ID
    const { data: account } = await svc
      .from('instagram_connected_accounts')
      .select('ig_user_id, access_token')
      .order('connected_at', { ascending: false })
      .limit(1)
      .single()

    if (!account) {
      return NextResponse.json({
        error: '24h window expired and no Instagram account connected for Graph API fallback',
      }, { status: 502 })
    }

    const sendUrl = `https://graph.facebook.com/v21.0/${account.ig_user_id}/messages`
    console.log('[Send Reply] Sending via Graph API with HUMAN_AGENT tag to:', igScopedId)

    try {
      const graphRes = await fetch(sendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${account.access_token}`,
        },
        body: JSON.stringify({
          recipient: { id: igScopedId },
          message: { text: message_text },
          messaging_type: 'MESSAGE_TAG',
          tag: 'HUMAN_AGENT',
        }),
      })

      const graphData = await graphRes.json()
      console.log('[Send Reply] Graph API response:', JSON.stringify(graphData))

      if (graphRes.ok && !graphData.error) {
        sendSuccess = true
      } else {
        return NextResponse.json({
          error: `Graph API error: ${graphData.error?.message || JSON.stringify(graphData)}`,
          graph_response: graphData,
        }, { status: 502 })
      }
    } catch (err) {
      console.error('[Send Reply] Graph API network error:', err)
      return NextResponse.json(
        { error: `Failed to reach Graph API: ${err}` },
        { status: 502 },
      )
    }
  }

  // ── 3) Record outbound message ─────────────────────────────────────────
  if (sendSuccess) {
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
  }

  // ── 4) Update review queue ─────────────────────────────────────────────
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
    sent_via: sentVia,
    sent_to: conversation.ig_username,
  })
}
