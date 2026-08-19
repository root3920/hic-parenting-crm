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
 * POST /api/instagram/test-seed
 *
 * Creates a test conversation with sample messages and a pending review-queue
 * entry for demo/screencast purposes.
 *
 * Body: {
 *   ig_username: string,
 *   ig_profile_pic_url?: string,
 *   messages: Array<{ direction: 'inbound' | 'outbound', text: string }>
 * }
 *
 * The last inbound message becomes the trigger for a review-queue entry.
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
  const { ig_username, ig_profile_pic_url, messages } = body as {
    ig_username?: string
    ig_profile_pic_url?: string
    messages?: Array<{ direction: string; text: string }>
  }

  if (!ig_username || !messages?.length) {
    return NextResponse.json(
      { error: 'ig_username and at least one message are required' },
      { status: 400 },
    )
  }

  const svc = getServiceClient()
  const now = new Date()
  const testUserId = `test_${ig_username}_${Date.now()}`

  // 1) Create conversation
  const { data: conversation, error: convErr } = await svc
    .from('instagram_conversations')
    .insert({
      ig_user_id: testUserId,
      ig_username,
      ig_profile_pic_url: ig_profile_pic_url || null,
      status: 'active',
      last_message_at: now.toISOString(),
    })
    .select('id')
    .single()

  if (convErr || !conversation) {
    return NextResponse.json({ error: convErr?.message || 'Failed to create conversation' }, { status: 500 })
  }

  // 2) Insert messages with staggered timestamps
  let lastInboundId: string | null = null
  const insertedMessages: Array<{ id: string; direction: string; text: string }> = []

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const sentAt = new Date(now.getTime() - (messages.length - i) * 60000).toISOString()

    const { data: inserted, error: msgErr } = await svc
      .from('instagram_messages')
      .insert({
        conversation_id: conversation.id,
        direction: msg.direction,
        message_text: msg.text,
        sent_at: sentAt,
      })
      .select('id')
      .single()

    if (msgErr || !inserted) {
      return NextResponse.json({ error: msgErr?.message || 'Failed to insert message' }, { status: 500 })
    }

    insertedMessages.push({ id: inserted.id, direction: msg.direction, text: msg.text })

    if (msg.direction === 'inbound') {
      lastInboundId = inserted.id
    }
  }

  // 3) Create a review-queue entry with a sample draft
  if (lastInboundId) {
    const { error: queueErr } = await svc
      .from('instagram_review_queue')
      .insert({
        conversation_id: conversation.id,
        trigger_message_id: lastInboundId,
        draft_response: 'I totally hear you — that sounds really exhausting 💛\n\nA lot of parents I work with describe exactly that kind of cycle. Has this been going on for a while, or is it more recent?',
        ai_assessment: 'gathering_info',
        ai_reasoning: 'Prospect expressed frustration with a parenting challenge. Need more info on duration/severity before assessing qualification.',
        status: 'pending',
      })

    if (queueErr) {
      return NextResponse.json({ error: queueErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({
    ok: true,
    conversation_id: conversation.id,
    messages_inserted: insertedMessages.length,
    review_queue_created: !!lastInboundId,
  })
}
