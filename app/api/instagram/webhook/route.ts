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

  const verifyToken = process.env.IG_WEBHOOK_VERIFY_TOKEN || process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN
  if (mode === 'subscribe' && token === verifyToken) {
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
  // ── 0) Log raw request immediately ──────────────────────────────────────
  const rawBody = await req.text()
  console.log('[IG Webhook] ── POST received ──')
  console.log('[IG Webhook] Content-Type:', req.headers.get('content-type'))
  console.log('[IG Webhook] Body length:', rawBody.length)
  console.log('[IG Webhook] Raw body:', rawBody.slice(0, 2000))

  // ── 1) Verify Meta signature ────────────────────────────────────────────
  const signature = req.headers.get('x-hub-signature-256')
  const appSecret = process.env.IG_APP_SECRET || process.env.INSTAGRAM_APP_SECRET

  console.log('[IG Webhook] Signature header present:', !!signature)
  console.log('[IG Webhook] App secret configured:', !!appSecret)

  if (appSecret && signature) {
    const expectedSig = 'sha256=' + crypto
      .createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex')

    if (signature !== expectedSig) {
      console.error('[IG Webhook] ❌ Signature MISMATCH')
      console.error('[IG Webhook]   Got:      ', signature)
      console.error('[IG Webhook]   Expected: ', expectedSig)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
    }
    console.log('[IG Webhook] ✓ Signature verified OK')
  } else if (appSecret && !signature) {
    console.error('[IG Webhook] ❌ Missing signature header — rejecting')
    return NextResponse.json({ error: 'Missing signature' }, { status: 403 })
  } else {
    console.log('[IG Webhook] ⚠ No app secret configured — skipping signature check')
  }

  // ── 2) Parse payload ────────────────────────────────────────────────────
  let payload: InstagramWebhookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch (e) {
    console.error('[IG Webhook] ❌ JSON parse failed:', e)
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  console.log('[IG Webhook] Parsed object:', payload.object)
  console.log('[IG Webhook] Entry count:', payload.entry?.length ?? 0)

  // Instagram/Messenger webhook always has object + entry[]
  if (payload.object !== 'instagram' && payload.object !== 'page') {
    console.log('[IG Webhook] Ignoring non-instagram object:', payload.object)
    return NextResponse.json({ received: true })
  }

  const supabase = getServiceClient()
  const results: string[] = []

  for (const entry of payload.entry ?? []) {
    console.log('[IG Webhook] Entry ID:', entry.id, '| messaging count:', entry.messaging?.length ?? 0)
    // Log full entry structure to see what keys Meta is actually sending
    console.log('[IG Webhook] Entry keys:', Object.keys(entry))
    if (!entry.messaging?.length) {
      console.log('[IG Webhook] Full entry (no messaging):', JSON.stringify(entry).slice(0, 1000))
    }

    for (const event of entry.messaging ?? []) {
      console.log('[IG Webhook] Event keys:', Object.keys(event))
      console.log('[IG Webhook] Event sender:', JSON.stringify(event.sender))
      console.log('[IG Webhook] Event message:', JSON.stringify(event.message))

      // Only process actual messages (not read receipts, reactions, etc.)
      if (!event.message?.text) {
        console.log('[IG Webhook] Skipping event — no message.text')
        continue
      }

      const senderId = event.sender?.id
      if (!senderId) {
        console.log('[IG Webhook] Skipping event — no sender.id')
        continue
      }

      const messageText = event.message.text
      const igMessageId = event.message.mid
      const timestamp = event.timestamp
        ? new Date(event.timestamp).toISOString()
        : new Date().toISOString()

      console.log('[IG Webhook] Processing message:', { senderId, messageText: messageText.slice(0, 80), igMessageId })

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
        console.error('[IG Webhook] DB upsert conversation error:', convErr)
        results.push(`Error upserting conversation for ${senderId}: ${convErr?.message}`)
        continue
      }
      console.log('[IG Webhook] Upserted conversation:', conversation.id)

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
  console.log('[IG Webhook] ── Done ──', results)
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
