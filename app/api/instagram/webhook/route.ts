import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * GET /api/instagram/webhook
 *
 * Meta's verification handshake. When configuring the webhook in the Meta
 * developer portal, Meta sends a GET with hub.mode, hub.verify_token, and
 * hub.challenge. We verify the token matches our secret and echo back the
 * challenge.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.IG_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge ?? '', { status: 200 })
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
}

/**
 * POST /api/instagram/webhook
 *
 * Receives incoming Instagram messages via Meta's webhook.
 *
 * 1. Verify X-Hub-Signature-256 against IG_APP_SECRET
 * 2. Parse messaging entries
 * 3. Upsert conversation, insert inbound message
 * 4. Trigger draft generation
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  // ── 1) Verify Meta signature ────────────────────────────────────────────
  const signature = req.headers.get('x-hub-signature-256')
  const appSecret = process.env.IG_APP_SECRET

  if (appSecret && signature) {
    const expectedSig = 'sha256=' + crypto
      .createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex')

    if (signature !== expectedSig) {
      console.error('[IG Webhook] Invalid signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
    }
  } else if (appSecret && !signature) {
    console.error('[IG Webhook] Missing signature header')
    return NextResponse.json({ error: 'Missing signature' }, { status: 403 })
  }
  // If IG_APP_SECRET is not set (dev/testing), skip verification

  // ── 2) Parse payload ────────────────────────────────────────────────────
  let payload: InstagramWebhookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Instagram/Messenger webhook always has object + entry[]
  if (payload.object !== 'instagram' && payload.object !== 'page') {
    // Acknowledge but ignore non-instagram objects
    return NextResponse.json({ received: true })
  }

  const supabase = getServiceClient()
  const results: string[] = []

  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      // Only process actual messages (not read receipts, reactions, etc.)
      if (!event.message?.text) continue

      const senderId = event.sender?.id
      if (!senderId) continue

      const messageText = event.message.text
      const igMessageId = event.message.mid
      const timestamp = event.timestamp
        ? new Date(event.timestamp).toISOString()
        : new Date().toISOString()

      // ── 3) Upsert conversation ────────────────────────────────────────
      const { data: conversation, error: convErr } = await supabase
        .from('instagram_conversations')
        .upsert(
          {
            ig_user_id: senderId,
            ig_username: event.sender.username || senderId,
            last_message_at: timestamp,
          },
          { onConflict: 'ig_user_id' },
        )
        .select('id')
        .single()

      if (convErr || !conversation) {
        results.push(`Error upserting conversation for ${senderId}: ${convErr?.message}`)
        continue
      }

      // Update last_message_at (upsert may not update on conflict for all fields)
      await supabase
        .from('instagram_conversations')
        .update({ last_message_at: timestamp })
        .eq('id', conversation.id)

      // ── 4) Insert inbound message (dedup by ig_message_id) ────────────
      if (igMessageId) {
        const { data: existing } = await supabase
          .from('instagram_messages')
          .select('id')
          .eq('ig_message_id', igMessageId)
          .maybeSingle()

        if (existing) {
          results.push(`Skipped duplicate message ${igMessageId}`)
          continue
        }
      }

      const { data: message, error: msgErr } = await supabase
        .from('instagram_messages')
        .insert({
          conversation_id: conversation.id,
          direction: 'inbound',
          message_text: messageText,
          sent_at: timestamp,
          ig_message_id: igMessageId || null,
        })
        .select('id')
        .single()

      if (msgErr || !message) {
        results.push(`Error inserting message: ${msgErr?.message}`)
        continue
      }

      // ── 5) Trigger draft generation ───────────────────────────────────
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
        await fetch(`${baseUrl}/api/instagram/generate-draft`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: conversation.id,
            trigger_message_id: message.id,
          }),
        })
      } catch (err) {
        results.push(`Draft generation trigger failed: ${err}`)
      }

      results.push(`Processed message from ${senderId}`)
    }
  }

  // Always return 200 to Meta to prevent retries
  return NextResponse.json({ received: true, results })
}

// ── Types for Meta's webhook payload ──────────────────────────────────────

interface InstagramWebhookPayload {
  object: string
  entry?: Array<{
    id: string
    time: number
    messaging?: Array<{
      sender: { id: string; username?: string }
      recipient: { id: string }
      timestamp?: number
      message?: {
        mid: string
        text?: string
      }
    }>
  }>
}
