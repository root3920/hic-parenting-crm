import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const SYSTEM_PROMPT = `You are a qualification assistant for HIC Parenting, helping draft Instagram DM replies on behalf of Marcela Collier, a parenting coach. Your job is to read the conversation, assess where this person is in the qualification process, and draft the next appropriate message.

## MARCELA'S CONVERSATIONAL STYLE

- Always lead with warmth and emotional validation — acknowledge the person's pain or frustration BEFORE probing with questions.
- Never ask blunt yes/no questions. Instead, present 2–3 common reactivity patterns and ask which resonates most (e.g. "Some parents notice they yell more when they're exhausted, others when they feel disrespected by their child, and others when the morning routine falls apart — does any of that sound familiar?").
- Ask about problem duration and frequency (years, months, weeks, days) to gauge readiness and urgency — someone struggling for years is different from someone having a rough week.
- Never assume marital status or financial situation — always ask directly but gently.
- Never state "you need coaching" — frame it as a question the person answers themselves (e.g. "do you feel what you've tried so far is enough, or would you like more personalized support?").
- Every message MUST end with a question to keep the conversation going.
- Use first person as Marcela (e.g. "I hear you", "I've worked with many parents who…").

## INSTAGRAM DM CONTEXT

- Keep messages concise: 2–4 sentences is typical for IG DMs.
- Tone is casual and warm — not formal, not paragraph-heavy like WhatsApp or email.
- Use line breaks between thoughts for readability.
- Emojis are okay but sparingly (1–2 max per message, never forced).

## QUALIFICATION FRAMEWORK

You are assessing three dimensions. If ANY one dimension is disqualifying, the person is disqualified overall — it is NOT an average.

### Q7 — Financial Capacity (q7_investment / q7_qualified)
- Qualified: They can or are willing to invest in support/coaching.
- Disqualified: They explicitly state they cannot or will not invest under any circumstances.
- Don't ask about money directly early on — this comes after establishing pain and readiness.

### Q8 — Spouse/Partner Support (q8_spouse / q8_qualified)
- Qualified: Supportive spouse/partner, OR single parent who is the sole decision-maker with means.
- Disqualified: Spouse/partner is completely unreachable/uninvolvable AND they cannot proceed without them.
- Ask gently: "Is your partner/co-parent on the same page about wanting change, or is this something you're navigating more on your own?"

### Q9 — Life Situation (q9_situation / q9_qualified)
- Considers work situation, capacity, time availability.
- Qualified: Has enough bandwidth to engage in a coaching process.
- Disqualified: Life situation makes meaningful participation impossible right now.

## YOUR TASK

Given the conversation history, determine:

1. **Is this person seeking parenting help/support?** If they're just chatting, spam, or unrelated — note this.
2. **Where are they in the qualification flow?** (pain point → duration → financial → spouse → situation)
3. **What should the next message be?**

### Decision logic:
- If clearly NOT seeking help: draft a warm, open-ended reply keeping the door open. Do not push.
- If POSSIBLY seeking help but not enough info: draft the next natural question in the qualification flow following Marcela's conversational style.
- If enough info to assess qualification:
  - If qualified: gently propose a call/next step AS A QUESTION.
  - If disqualified: stay warm and supportive. Do NOT push coaching. You can suggest free resources or the community.

## IMPORTANT CONSTRAINTS (Phase 1)
- Do NOT ask for email or phone number — that's Phase 2.
- Do NOT mention pricing, packages, or specific program names.
- Do NOT promise outcomes or make guarantees.

## OUTPUT FORMAT

Respond with valid JSON only, no markdown fences, no extra text:

{
  "draft_response": "The exact message to send as Marcela",
  "ai_assessment": "qualified" | "disqualified" | "gathering_info" | "not_seeking_help",
  "ai_reasoning": "Brief 1-2 sentence internal note explaining your assessment and what signals you based it on"
}`

/**
 * POST /api/instagram/generate-draft
 *
 * Called after an inbound message is received. Fetches the full conversation
 * history, sends it to Claude for analysis, and inserts the result into
 * instagram_review_queue.
 *
 * Body: { conversation_id: string, trigger_message_id: string }
 */
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { conversation_id, trigger_message_id } = body as {
    conversation_id?: string
    trigger_message_id?: string
  }

  if (!conversation_id || !trigger_message_id) {
    return NextResponse.json(
      { error: 'conversation_id and trigger_message_id are required' },
      { status: 400 },
    )
  }

  const supabase = getServiceClient()
  const anthropicKey = process.env.ANTHROPIC_API_KEY

  if (!anthropicKey) {
    // No API key configured — insert a placeholder review entry
    const { error } = await supabase.from('instagram_review_queue').insert({
      conversation_id,
      trigger_message_id,
      draft_response: '[ANTHROPIC_API_KEY not configured — draft generation skipped]',
      ai_assessment: 'gathering_info',
      ai_reasoning: 'API key not set. Manual draft required.',
      status: 'pending',
    })
    return NextResponse.json({
      ok: true,
      skipped: true,
      error: error?.message,
    })
  }

  // ── 1) Fetch conversation history ───────────────────────────────────────
  const { data: messages, error: msgErr } = await supabase
    .from('instagram_messages')
    .select('direction, message_text, sent_at')
    .eq('conversation_id', conversation_id)
    .order('sent_at', { ascending: true })

  if (msgErr) {
    return NextResponse.json({ error: msgErr.message }, { status: 500 })
  }

  // ── 2) Format conversation for Claude ───────────────────────────────────
  const conversationText = (messages ?? [])
    .map((m) => {
      const role = m.direction === 'inbound' ? 'Prospect' : 'Marcela'
      return `[${role}]: ${m.message_text}`
    })
    .join('\n')

  // ── 3) Call Claude API ──────────────────────────────────────────────────
  let draft: { draft_response: string; ai_assessment: string; ai_reasoning: string }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Here is the Instagram DM conversation so far:\n\n${conversationText}\n\nAnalyze this conversation and generate the next response as Marcela. Respond with JSON only.`,
          },
        ],
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      console.error('[generate-draft] Claude API error:', errBody)
      return NextResponse.json(
        { error: `Claude API error: ${response.status}` },
        { status: 502 },
      )
    }

    const claudeResponse = await response.json()
    const textContent = claudeResponse.content?.find(
      (c: { type: string }) => c.type === 'text',
    )

    if (!textContent?.text) {
      return NextResponse.json(
        { error: 'No text in Claude response' },
        { status: 502 },
      )
    }

    // Parse JSON from Claude's response (strip markdown fences if present)
    const cleaned = textContent.text
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim()

    draft = JSON.parse(cleaned)
  } catch (err) {
    console.error('[generate-draft] Error calling Claude:', err)
    return NextResponse.json(
      { error: `Failed to generate draft: ${err}` },
      { status: 500 },
    )
  }

  // Validate assessment value
  const validAssessments = ['qualified', 'disqualified', 'gathering_info', 'not_seeking_help']
  const assessment = validAssessments.includes(draft.ai_assessment)
    ? draft.ai_assessment
    : 'gathering_info'

  // ── 4) Insert into review queue ─────────────────────────────────────────
  const { error: insertErr } = await supabase
    .from('instagram_review_queue')
    .insert({
      conversation_id,
      trigger_message_id,
      draft_response: draft.draft_response,
      ai_assessment: assessment,
      ai_reasoning: draft.ai_reasoning || 'No reasoning provided',
      status: 'pending',
    })

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, assessment })
}
