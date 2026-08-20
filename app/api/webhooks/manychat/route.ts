import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

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

  // ── Dedup key for messages ──────────────────────────────────────────────
  // ManyChat doesn't provide a unique message ID, so we use a composite:
  // subscriber_id + timestamp + first 100 chars of text → hashed into ig_message_id
  const dedupKey = `mc_${subscriberId}_${sentAt}_${messageText.slice(0, 100)}`

  // ── Upsert conversation ─────────────────────────────────────────────────
  const { data: conversation, error: convErr } = await supabase
    .from('instagram_conversations')
    .upsert(
      {
        ig_user_id: subscriberId,
        ig_username: igUsername,
        name: displayName !== igUsername ? displayName : null,
        last_message_at: sentAt,
      },
      { onConflict: 'ig_user_id' },
    )
    .select('id')
    .single()

  if (convErr || !conversation) {
    console.error('[ManyChat Webhook] Conversation upsert error:', convErr)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  // Update last_message_at (upsert may not update on conflict for all columns)
  await supabase
    .from('instagram_conversations')
    .update({ last_message_at: sentAt, ig_username: igUsername })
    .eq('id', conversation.id)

  // ── Insert message (dedup by ig_message_id) ─────────────────────────────
  const { data: existingMsg } = await supabase
    .from('instagram_messages')
    .select('id')
    .eq('ig_message_id', dedupKey)
    .maybeSingle()

  if (existingMsg) {
    // Duplicate — already processed
    return NextResponse.json({ ok: true, action: 'duplicate_skipped' })
  }

  const { error: msgErr } = await supabase
    .from('instagram_messages')
    .insert({
      conversation_id: conversation.id,
      direction: 'inbound',
      message_text: messageText,
      sent_at: sentAt,
      ig_message_id: dedupKey,
    })

  if (msgErr) {
    console.error('[ManyChat Webhook] Message insert error:', msgErr)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  // ── Best-effort contact match ───────────────────────────────────────────
  // Currently value_ladder_contacts doesn't have an ig_username field.
  // When it does, uncomment this block:
  // if (igUsername) {
  //   const { data: contact } = await supabase
  //     .from('value_ladder_contacts')
  //     .select('id')
  //     .eq('ig_username', igUsername)
  //     .maybeSingle()
  //   if (contact) { /* link conversation to contact */ }
  // }

  console.log(`[ManyChat Webhook] Processed: ${igUsername} → "${messageText.slice(0, 50)}"`)

  return NextResponse.json({
    ok: true,
    action: 'created',
    conversation_id: conversation.id,
  })
}
