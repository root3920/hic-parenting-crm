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
 * Detect if last_input_text is actually a Meta CDN attachment URL,
 * and classify the attachment type from the URL pattern.
 */
const ATTACHMENT_PATTERNS = [
  'lookaside.fbsbx.com',
  'scontent.cdninstagram.com',
  'scontent-',
  'video.cdninstagram.com',
  'cdn.fbsbx.com',
] as const

function classifyAttachment(text: string): { isAttachment: boolean; type: 'image' | 'audio' | 'video' | 'file'; url: string } | null {
  const trimmed = text.trim()

  // Must look like a URL and match a known Meta CDN host
  if (!trimmed.startsWith('https://')) return null
  if (!ATTACHMENT_PATTERNS.some((p) => trimmed.includes(p))) return null

  // Classify by URL path/extension patterns
  const lower = trimmed.toLowerCase()
  if (lower.includes('/audioclip') || lower.match(/\.(mp3|m4a|aac|ogg|opus|wav)/)) {
    return { isAttachment: true, type: 'audio', url: trimmed }
  }
  if (lower.match(/\.(mp4|mov|webm|avi)/) || lower.includes('/video')) {
    return { isAttachment: true, type: 'video', url: trimmed }
  }
  if (lower.match(/\.(jpg|jpeg|png|gif|webp|heic)/) || lower.includes('/ig_messaging_cdn/')) {
    return { isAttachment: true, type: 'image', url: trimmed }
  }

  // Unknown attachment type from Meta CDN
  return { isAttachment: true, type: 'file', url: trimmed }
}

const ATTACHMENT_LABELS: Record<string, string> = {
  image: '📷 Imagen enviada',
  audio: '🎤 Audio enviado',
  video: '🎥 Video enviado',
  file: '📎 Archivo enviado',
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
  const rawInput = String(body.last_input_text || '').trim()
  const rawTimestamp = body.timestamp

  if (!subscriberId) {
    return NextResponse.json({ error: 'subscriber_id is required' }, { status: 400 })
  }
  if (!rawInput) {
    return NextResponse.json({ error: 'last_input_text is required' }, { status: 400 })
  }

  // Detect if input is an attachment URL vs real text
  const attachment = classifyAttachment(rawInput)
  const messageType = attachment ? attachment.type : 'text'
  const attachmentUrl = attachment ? attachment.url : null
  const messageText = attachment ? ATTACHMENT_LABELS[attachment.type] : rawInput

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
  console.log('[ManyChat Webhook] message_type:', messageType)
  console.log('[ManyChat Webhook] message:', messageText.slice(0, 80))
  if (attachmentUrl) console.log('[ManyChat Webhook] attachment_url:', attachmentUrl.slice(0, 100))
  console.log('[ManyChat Webhook] sentAt:', sentAt)

  // ── Dedup key for messages ──────────────────────────────────────────────
  const dedupKey = `mc_${subscriberId}_${sentAt}_${rawInput.slice(0, 100)}`

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

  // ── Insert message (dedup by ig_message_id — UNIQUE index at DB level) ──
  console.log('[ManyChat Webhook] Step 2: Inserting message, dedupKey:', dedupKey.slice(0, 60))

  const { data: insertedMsg, error: msgErr } = await supabase
    .from('instagram_messages')
    .insert({
      conversation_id: conversation.id,
      direction: 'inbound',
      message_text: messageText,
      message_type: messageType,
      attachment_url: attachmentUrl,
      sent_at: sentAt,
      ig_message_id: dedupKey,
    })
    .select('id')
    .single()

  if (msgErr) {
    // code 23505 = unique_violation → duplicate message, safe to ignore
    if (msgErr.code === '23505') {
      console.log('[ManyChat Webhook] Duplicate message (DB constraint), skipping')
      return NextResponse.json({ ok: true, action: 'duplicate_skipped' })
    }
    console.error('[ManyChat Webhook] ❌ Message insert FAILED')
    console.error('[ManyChat Webhook] Error code:', msgErr.code)
    console.error('[ManyChat Webhook] Error message:', msgErr.message)
    console.error('[ManyChat Webhook] Error details:', msgErr.details)
    console.error('[ManyChat Webhook] Full error:', JSON.stringify(msgErr, null, 2))
    return NextResponse.json({
      error: 'DB error on message insert',
      details: msgErr.message,
      code: msgErr.code,
    }, { status: 500 })
  }

  if (!insertedMsg) {
    console.error('[ManyChat Webhook] ❌ Message insert returned no data')
    return NextResponse.json({ error: 'DB error: no data returned' }, { status: 500 })
  }

  console.log('[ManyChat Webhook] ✓ Message inserted, id:', insertedMsg.id)

  // ── Review queue: one pending entry per conversation ────────────────────
  // If a 'pending' entry already exists for this conversation, update it
  // (new trigger message, regenerate draft). Only create a new entry if
  // there's no pending one (i.e. previous was approved/rejected/edited).
  console.log('[ManyChat Webhook] Step 3: Checking for existing pending review queue entry')

  const { data: existingPending } = await supabase
    .from('instagram_review_queue')
    .select('id')
    .eq('conversation_id', conversation.id)
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle()

  let reviewQueueId: string | null = null
  let reviewAction: string

  if (existingPending) {
    // Update existing pending entry with the latest trigger message
    console.log('[ManyChat Webhook] Step 3: Updating existing pending entry:', existingPending.id)

    const { error: updateQueueErr } = await supabase
      .from('instagram_review_queue')
      .update({
        trigger_message_id: insertedMsg.id,
        draft_response: '(Regenerating draft…)',
        ai_reasoning: 'Updated — new message received while previous review still pending.',
      })
      .eq('id', existingPending.id)

    if (updateQueueErr) {
      console.error('[ManyChat Webhook] ⚠ Review queue update failed:', updateQueueErr.message, updateQueueErr.code)
    } else {
      console.log('[ManyChat Webhook] ✓ Review queue entry updated')
    }

    reviewQueueId = existingPending.id
    reviewAction = 'updated_existing'
  } else {
    // No pending entry — create a new one
    console.log('[ManyChat Webhook] Step 3: Creating new review queue entry')

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
      console.error('[ManyChat Webhook] Error code:', queueErr?.code)
      console.error('[ManyChat Webhook] Error message:', queueErr?.message)
      console.error('[ManyChat Webhook] Error details:', queueErr?.details)
      console.error('[ManyChat Webhook] Error hint:', queueErr?.hint)
      console.error('[ManyChat Webhook] Full error:', JSON.stringify(queueErr, null, 2))
    } else {
      console.log('[ManyChat Webhook] ✓ Review queue entry created, id:', queueEntry.id)
      reviewQueueId = queueEntry.id
    }

    reviewAction = 'created_new'
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
    review_queue_id: reviewQueueId,
    review_queue_action: reviewAction,
  })
}
