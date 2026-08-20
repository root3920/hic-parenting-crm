import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(`[ManyChat Webhook] Missing Supabase env vars — URL: ${!!url}, KEY: ${!!key}`)
  }
  return createClient(url, key)
}

/**
 * POST /api/webhooks/manychat
 *
 * Receives Instagram DM messages forwarded by ManyChat's "External Request"
 * block in the Default Reply flow.
 *
 * Expected JSON body:
 * {
 *   subscriber_id: string     — ManyChat's unique subscriber ID (used as ig_user_id)
 *   first_name?: string
 *   last_name?: string
 *   username?: string         — Instagram username (without @)
 *   ig_username?: string      — alternate field name for the same
 *   last_input_text: string   — the message text
 *   timestamp?: string|number — ISO string or unix ms; defaults to now()
 * }
 *
 * Auth: validates x-manychat-secret header against MANYCHAT_WEBHOOK_SECRET env var.
 * Responds 200 immediately — no heavy processing inline.
 */
export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const secret = process.env.MANYCHAT_WEBHOOK_SECRET
  const headerSecret = req.headers.get('x-manychat-secret')

  if (!secret || headerSecret !== secret) {
    console.error('[ManyChat Webhook] Auth failed — header:', headerSecret ? 'present but wrong' : 'missing')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Parse body ──────────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const subscriberId = String(body.subscriber_id || '').trim()
  const firstName = String(body.first_name || '').trim()
  const lastName = String(body.last_name || '').trim()
  const username = String(body.username || body.ig_username || '').trim()
  const messageText = String(body.last_input_text || '').trim()
  const rawTimestamp = body.timestamp

  if (!subscriberId) {
    return NextResponse.json({ error: 'subscriber_id is required' }, { status: 400 })
  }
  if (!messageText) {
    return NextResponse.json({ error: 'last_input_text is required' }, { status: 400 })
  }

  // Resolve timestamp
  let sentAt: string
  if (!rawTimestamp) {
    sentAt = new Date().toISOString()
  } else if (typeof rawTimestamp === 'number') {
    // Unix seconds or milliseconds
    sentAt = new Date(rawTimestamp > 1e12 ? rawTimestamp : rawTimestamp * 1000).toISOString()
  } else {
    sentAt = new Date(String(rawTimestamp)).toISOString()
  }

  const displayName = [firstName, lastName].filter(Boolean).join(' ') || username || subscriberId
  const igUsername = username || subscriberId

  console.log('[ManyChat Webhook] ── Processing ──')
  console.log('[ManyChat Webhook] subscriber_id:', subscriberId)
  console.log('[ManyChat Webhook] username:', igUsername)
  console.log('[ManyChat Webhook] message:', messageText.slice(0, 80))
  console.log('[ManyChat Webhook] sentAt:', sentAt)

  // ── Dedup key for messages ──────────────────────────────────────────────
  const dedupKey = `mc_${subscriberId}_${sentAt}_${messageText.slice(0, 100)}`

  let supabase: ReturnType<typeof getServiceClient>
  try {
    supabase = getServiceClient()
  } catch (err) {
    console.error('[ManyChat Webhook] Supabase client init FAILED:', err)
    return NextResponse.json({ error: 'Server config error' }, { status: 500 })
  }

  // ── Upsert conversation ─────────────────────────────────────────────────
  console.log('[ManyChat Webhook] Step 1: Upserting conversation for ig_user_id:', subscriberId)

  const { data: conversation, error: convErr } = await supabase
    .from('instagram_conversations')
    .upsert(
      {
        ig_user_id: subscriberId,
        ig_username: igUsername,
        name: displayName !== igUsername ? displayName : null,
        status: 'active',
        last_message_at: sentAt,
      },
      { onConflict: 'ig_user_id' },
    )
    .select('id')
    .single()

  if (convErr || !conversation) {
    console.error('[ManyChat Webhook] ❌ Conversation upsert FAILED')
    console.error('[ManyChat Webhook] Error code:', convErr?.code)
    console.error('[ManyChat Webhook] Error message:', convErr?.message)
    console.error('[ManyChat Webhook] Error details:', convErr?.details)
    console.error('[ManyChat Webhook] Error hint:', convErr?.hint)
    console.error('[ManyChat Webhook] Full error:', JSON.stringify(convErr, null, 2))
    return NextResponse.json({
      error: 'DB error on conversation upsert',
      details: convErr?.message,
      code: convErr?.code,
    }, { status: 500 })
  }

  console.log('[ManyChat Webhook] ✓ Conversation upserted, id:', conversation.id)

  // Update last_message_at (upsert may not update on conflict for all columns)
  const { error: updateErr } = await supabase
    .from('instagram_conversations')
    .update({ last_message_at: sentAt, ig_username: igUsername })
    .eq('id', conversation.id)

  if (updateErr) {
    console.error('[ManyChat Webhook] ⚠ Update last_message_at failed:', updateErr.message)
  }

  // ── Insert message (dedup by ig_message_id) ─────────────────────────────
  console.log('[ManyChat Webhook] Step 2: Checking dedup for:', dedupKey.slice(0, 60))

  const { data: existingMsg, error: dedupErr } = await supabase
    .from('instagram_messages')
    .select('id')
    .eq('ig_message_id', dedupKey)
    .maybeSingle()

  if (dedupErr) {
    console.error('[ManyChat Webhook] ⚠ Dedup check error:', dedupErr.message)
  }

  if (existingMsg) {
    console.log('[ManyChat Webhook] Duplicate detected, skipping')
    return NextResponse.json({ ok: true, action: 'duplicate_skipped' })
  }

  console.log('[ManyChat Webhook] Step 3: Inserting message')

  const { data: insertedMsg, error: msgErr } = await supabase
    .from('instagram_messages')
    .insert({
      conversation_id: conversation.id,
      direction: 'inbound',
      message_text: messageText,
      sent_at: sentAt,
      ig_message_id: dedupKey,
    })
    .select('id')
    .single()

  if (msgErr || !insertedMsg) {
    console.error('[ManyChat Webhook] ❌ Message insert FAILED')
    console.error('[ManyChat Webhook] Error code:', msgErr?.code)
    console.error('[ManyChat Webhook] Error message:', msgErr?.message)
    console.error('[ManyChat Webhook] Error details:', msgErr?.details)
    console.error('[ManyChat Webhook] Full error:', JSON.stringify(msgErr, null, 2))
    return NextResponse.json({
      error: 'DB error on message insert',
      details: msgErr?.message,
      code: msgErr?.code,
    }, { status: 500 })
  }

  console.log('[ManyChat Webhook] ✓ Message inserted, id:', insertedMsg.id)

  // ── Create review queue entry ───────────────────────────────────────────
  // This makes the conversation visible in the /instagram-dm review UI.
  console.log('[ManyChat Webhook] Step 4: Creating review queue entry')
  console.log('[ManyChat Webhook] Step 4 payload:', JSON.stringify({
    conversation_id: conversation.id,
    trigger_message_id: insertedMsg.id,
    draft_response: '(Generating draft…)',
    ai_assessment: 'gathering_info',
    ai_reasoning: 'New inbound message from ManyChat — pending AI draft.',
    status: 'pending',
  }))

  const { data: queueEntry, error: queueErr } = await supabase
    .from('instagram_review_queue')
    .insert({
      conversation_id: conversation.id,
      trigger_message_id: insertedMsg.id,
      draft_response: '(Generating draft…)',
      ai_assessment: 'gathering_info',
      ai_reasoning: 'New inbound message from ManyChat — pending AI draft.',
      status: 'pending',
    })
    .select('id')
    .single()

  if (queueErr || !queueEntry) {
    console.error('[ManyChat Webhook] ❌ Review queue insert FAILED')
    console.error('[ManyChat Webhook] Step 4 error code:', queueErr?.code)
    console.error('[ManyChat Webhook] Step 4 error message:', queueErr?.message)
    console.error('[ManyChat Webhook] Step 4 error details:', queueErr?.details)
    console.error('[ManyChat Webhook] Step 4 error hint:', queueErr?.hint)
    console.error('[ManyChat Webhook] Step 4 full error:', JSON.stringify(queueErr, null, 2))
  } else {
    console.log('[ManyChat Webhook] ✓ Review queue entry created, id:', queueEntry.id)
  }

  // ── Trigger async draft generation (non-blocking) ───────────────────────
  // Fire-and-forget: don't await, so we respond to ManyChat within 2s.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dashboard.hicparenting.com'
  fetch(`${baseUrl}/api/instagram/generate-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversation_id: conversation.id,
      trigger_message_id: insertedMsg.id,
    }),
  }).catch((err) => {
    console.error('[ManyChat Webhook] ⚠ Draft generation trigger failed:', err)
  })

  console.log(`[ManyChat Webhook] ✓ Done: ${igUsername} → "${messageText.slice(0, 50)}"`)

  return NextResponse.json({
    ok: true,
    action: 'created',
    conversation_id: conversation.id,
    message_id: insertedMsg.id,
    review_queue_id: queueEntry?.id ?? null,
    review_queue_error: queueErr ? { code: queueErr.code, message: queueErr.message } : null,
  })
}
