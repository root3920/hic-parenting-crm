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
 * GET /api/instagram/review-queue
 *
 * Returns pending review-queue items with conversation context.
 * Query params:
 *   status (optional): filter by status, defaults to 'pending'
 */
export async function GET(req: NextRequest) {
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

  const svc = getServiceClient()
  const { searchParams } = new URL(req.url)
  const statusFilter = searchParams.get('status') || 'pending'

  // Fetch review queue items
  const { data: items, error: itemsErr } = await svc
    .from('instagram_review_queue')
    .select(`
      id,
      conversation_id,
      trigger_message_id,
      draft_response,
      ai_assessment,
      ai_reasoning,
      status,
      final_response,
      reviewed_by,
      reviewed_at,
      created_at
    `)
    .eq('status', statusFilter)
    .order('created_at', { ascending: false })

  if (itemsErr) {
    return NextResponse.json({ error: itemsErr.message }, { status: 500 })
  }

  if (!items?.length) {
    return NextResponse.json({ items: [], total: 0 })
  }

  // Enrich with conversation data and trigger message
  const conversationIds = Array.from(new Set(items.map((i) => i.conversation_id)))
  const triggerIds = items.map((i) => i.trigger_message_id)

  const [{ data: conversations }, { data: triggerMessages }, { data: allMessages }] =
    await Promise.all([
      svc
        .from('instagram_conversations')
        .select('id, ig_user_id, ig_username, name, status, ig_profile_pic_url')
        .in('id', conversationIds),
      svc
        .from('instagram_messages')
        .select('id, message_text, sent_at')
        .in('id', triggerIds),
      svc
        .from('instagram_messages')
        .select('id, conversation_id, direction, message_text, message_type, attachment_url, sent_at')
        .in('conversation_id', conversationIds)
        .order('sent_at', { ascending: true }),
    ])

  const convMap = new Map(
    (conversations ?? []).map((c) => [c.id, c]),
  )
  const triggerMap = new Map(
    (triggerMessages ?? []).map((m) => [m.id, m]),
  )
  const messagesByConv = new Map<string, typeof allMessages>()
  for (const msg of allMessages ?? []) {
    const list = messagesByConv.get(msg.conversation_id) ?? []
    list.push(msg)
    messagesByConv.set(msg.conversation_id, list)
  }

  const enriched = items.map((item) => ({
    ...item,
    conversation: convMap.get(item.conversation_id) ?? null,
    trigger_message: triggerMap.get(item.trigger_message_id) ?? null,
    messages: messagesByConv.get(item.conversation_id) ?? [],
  }))

  return NextResponse.json({ items: enriched, total: enriched.length })
}

/**
 * PATCH /api/instagram/review-queue
 *
 * Approve, edit & approve, or reject a review-queue item.
 *
 * Body: {
 *   id: string,
 *   action: 'approve' | 'edit_and_approve' | 'reject',
 *   final_response?: string (required for edit_and_approve)
 * }
 */
export async function PATCH(req: NextRequest) {
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
  const { id, action, final_response } = body as {
    id?: string
    action?: 'approve' | 'edit_and_approve' | 'reject'
    final_response?: string
  }

  if (!id || !action) {
    return NextResponse.json({ error: 'id and action are required' }, { status: 400 })
  }

  if (action === 'edit_and_approve' && !final_response) {
    return NextResponse.json(
      { error: 'final_response is required for edit_and_approve' },
      { status: 400 },
    )
  }

  const svc = getServiceClient()
  const reviewerName = profile.setter_name || profile.full_name || user.email || 'Unknown'

  // Fetch the review item
  const { data: item, error: fetchErr } = await svc
    .from('instagram_review_queue')
    .select('id, conversation_id, draft_response, status')
    .eq('id', id)
    .single()

  if (fetchErr || !item) {
    return NextResponse.json({ error: 'Review item not found' }, { status: 404 })
  }

  if (item.status !== 'pending') {
    return NextResponse.json({ error: 'Item already reviewed' }, { status: 400 })
  }

  const now = new Date().toISOString()

  if (action === 'reject') {
    const { error } = await svc
      .from('instagram_review_queue')
      .update({
        status: 'rejected',
        reviewed_by: reviewerName,
        reviewed_at: now,
      })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, status: 'rejected' })
  }

  // approve or edit_and_approve — send via Instagram Messaging API
  const messageToSend =
    action === 'edit_and_approve' ? final_response! : item.draft_response
  const reviewAction =
    action === 'edit_and_approve' ? 'edited_and_approved' : 'approved'

  // Send reply via ManyChat API (handles sending, DB recording, queue update)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
  const sendRes = await fetch(`${baseUrl}/api/instagram/send-reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: req.headers.get('cookie') || '',
    },
    body: JSON.stringify({
      conversation_id: item.conversation_id,
      message_text: messageToSend,
      review_queue_id: id,
      review_action: reviewAction,
    }),
  })

  const sendData = await sendRes.json()

  if (!sendRes.ok || sendData.error) {
    return NextResponse.json(
      { error: sendData.error || 'Failed to send message via Instagram' },
      { status: sendRes.status },
    )
  }

  return NextResponse.json({
    ok: true,
    status: reviewAction,
    sent: messageToSend,
    ig_message_id: sendData.ig_message_id,
  })
}
