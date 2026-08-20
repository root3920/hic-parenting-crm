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
 * GET /api/instagram/fetch-conversations
 *
 * Fetches real conversations from the Instagram Graph API and returns them
 * for the admin to review/import. Does NOT automatically insert into DB.
 *
 * Uses the connected account's Page access token + IG Business Account ID.
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

  const svc = getServiceClient()

  // Get connected account
  const { data: account, error: accErr } = await svc
    .from('instagram_connected_accounts')
    .select('ig_user_id, fb_page_id, access_token')
    .order('connected_at', { ascending: false })
    .limit(1)
    .single()

  if (accErr || !account) {
    return NextResponse.json(
      { error: 'No Instagram account connected' },
      { status: 400 },
    )
  }

  if (!account.fb_page_id) {
    return NextResponse.json(
      { error: 'Facebook Page ID not stored. Please disconnect and reconnect your Instagram account.' },
      { status: 400 },
    )
  }

  const igBusinessId = account.ig_user_id
  const fbPageId = account.fb_page_id
  const pageToken = account.access_token

  try {
    // Step 1: Fetch conversations with lightweight fields only (no nested messages)
    const convUrl = `https://graph.facebook.com/v21.0/${fbPageId}/conversations?platform=instagram&fields=participants,updated_time&limit=5&access_token=${pageToken}`

    console.log('[IG Fetch Conversations] Calling:', convUrl.replace(pageToken, '<REDACTED>'))

    const convRes = await fetch(convUrl)
    const convData = await convRes.json()

    if (convData.error) {
      console.error('[IG Fetch Conversations] Graph API error:', JSON.stringify(convData.error, null, 2))
      return NextResponse.json(
        {
          error: `Graph API: ${convData.error.message}`,
          ig_error: convData.error,
          ig_error_code: convData.error.code,
          ig_error_subcode: convData.error.error_subcode,
          ig_error_type: convData.error.type,
        },
        { status: 502 },
      )
    }

    // Get IDs already imported to flag them
    const { data: existingConvs } = await svc
      .from('instagram_conversations')
      .select('ig_user_id')

    const importedIds = new Set((existingConvs ?? []).map((c) => c.ig_user_id))

    // Step 2: Transform conversation list (no message fetching — that's on-demand)
    const conversations = (convData.data ?? []).map((conv: ConvResponse) => {
      const otherParticipant = (conv.participants?.data ?? []).find(
        (p: Participant) => p.id !== igBusinessId,
      )

      return {
        ig_conversation_id: conv.id,
        participant_id: otherParticipant?.id || null,
        participant_name: otherParticipant?.name || otherParticipant?.username || null,
        updated_time: conv.updated_time,
        already_imported: otherParticipant ? importedIds.has(otherParticipant.id) : false,
        messages: [] as Array<{ id: string; text: string; from_id: string; from_name: string | null; is_from_us: boolean; created_time: string }>,
      }
    })

    return NextResponse.json({ conversations, ig_business_id: igBusinessId })
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch conversations: ${err}` },
      { status: 500 },
    )
  }
}

/**
 * POST /api/instagram/fetch-conversations
 *
 * Imports a specific real conversation into our DB.
 * Fetches messages on-demand from the Graph API at import time.
 *
 * Body: {
 *   ig_conversation_id: string — the Graph API conversation ID
 *   participant_id: string     — the IG-scoped user ID of the sender
 *   participant_name: string   — display name/username
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

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const body = await req.json()
  const { ig_conversation_id, participant_id, participant_name } = body as {
    ig_conversation_id?: string
    participant_id?: string
    participant_name?: string
  }

  if (!participant_id || !ig_conversation_id) {
    return NextResponse.json(
      { error: 'ig_conversation_id and participant_id are required' },
      { status: 400 },
    )
  }

  const svc = getServiceClient()
  const now = new Date().toISOString()

  // Get connected account for API calls
  const { data: account } = await svc
    .from('instagram_connected_accounts')
    .select('ig_user_id, access_token')
    .order('connected_at', { ascending: false })
    .limit(1)
    .single()

  if (!account) {
    return NextResponse.json({ error: 'No Instagram account connected' }, { status: 400 })
  }

  // Fetch messages for this conversation from Graph API
  let messages: Array<{ text: string; is_from_us: boolean; created_time: string; id?: string }> = []
  try {
    const msgRes = await fetch(
      `https://graph.facebook.com/v21.0/${ig_conversation_id}?fields=messages.limit(10){message,from,created_time,id}&access_token=${account.access_token}`,
    )
    const msgData = await msgRes.json()

    if (msgData.error) {
      console.error('[IG Import] Message fetch error:', msgData.error)
      return NextResponse.json(
        { error: `Failed to fetch messages: ${msgData.error.message}` },
        { status: 502 },
      )
    }

    messages = (msgData.messages?.data ?? []).map((m: MsgResponse) => ({
      text: m.message,
      is_from_us: m.from?.id === account.ig_user_id,
      created_time: m.created_time,
      id: m.id,
    }))
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch messages: ${err}` },
      { status: 500 },
    )
  }

  if (!messages.length) {
    return NextResponse.json({ error: 'No messages found in this conversation' }, { status: 400 })
  }

  // Upsert conversation
  const { data: conversation, error: convErr } = await svc
    .from('instagram_conversations')
    .upsert(
      {
        ig_user_id: participant_id,
        ig_username: participant_name || participant_id,
        status: 'active',
        last_message_at: now,
      },
      { onConflict: 'ig_user_id' },
    )
    .select('id')
    .single()

  if (convErr || !conversation) {
    return NextResponse.json(
      { error: convErr?.message || 'Failed to create conversation' },
      { status: 500 },
    )
  }

  // Insert messages (skip duplicates by ig_message_id)
  let inserted = 0
  let lastInboundId: string | null = null

  for (const msg of messages) {
    // Check for duplicate
    if (msg.id) {
      const { data: existing } = await svc
        .from('instagram_messages')
        .select('id')
        .eq('ig_message_id', msg.id)
        .maybeSingle()

      if (existing) continue
    }

    const { data: insertedMsg, error: msgErr } = await svc
      .from('instagram_messages')
      .insert({
        conversation_id: conversation.id,
        direction: msg.is_from_us ? 'outbound' : 'inbound',
        message_text: msg.text,
        sent_at: msg.created_time || now,
        ig_message_id: msg.id || null,
      })
      .select('id')
      .single()

    if (!msgErr && insertedMsg) {
      inserted++
      if (!msg.is_from_us) {
        lastInboundId = insertedMsg.id
      }
    }
  }

  // Create a pending review-queue entry for the last inbound message
  let reviewCreated = false
  if (lastInboundId) {
    const { error: queueErr } = await svc
      .from('instagram_review_queue')
      .insert({
        conversation_id: conversation.id,
        trigger_message_id: lastInboundId,
        draft_response: '(Draft not generated — imported conversation. Write your reply manually.)',
        ai_assessment: 'gathering_info',
        ai_reasoning: 'Conversation imported from real IG messages. Manual review needed.',
        status: 'pending',
      })
    reviewCreated = !queueErr
  }

  return NextResponse.json({
    ok: true,
    conversation_id: conversation.id,
    messages_inserted: inserted,
    review_queue_created: reviewCreated,
  })
}

// ── Types for Graph API responses ─────────────────────────────────────────

interface Participant {
  id: string
  name?: string
  username?: string
}

interface MsgResponse {
  id: string
  message: string
  from?: { id: string; name?: string; username?: string }
  created_time: string
}

interface ConvResponse {
  id: string
  updated_time: string
  participants?: { data: Participant[] }
  messages?: { data: MsgResponse[] }
}
