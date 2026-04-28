import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { error } = await supabase
      .from('survey_responses')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Survey delete error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Survey delete error:', message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const { data, error } = await supabase
      .from('survey_responses')
      .insert({
        name: body.name,
        email: body.email,
        phone: body.phone || null,
        country: body.country || null,
        preferred_language: body.preferred_language || null,
        q4_source: body.q4_source || null,
        q5_children_struggle: body.q5_children_struggle || null,
        q6_why_now: body.q6_why_now || null,
        q7_investment: body.q7_investment || null,
        q7_qualified: body.q7_qualified ?? null,
        q8_spouse: body.q8_spouse || null,
        q8_qualified: body.q8_qualified ?? null,
        q9_situation: body.q9_situation || null,
        q9_qualified: body.q9_qualified ?? null,
        is_qualified: body.is_qualified,
        disqualifying_count: body.disqualifying_count ?? 0,
        setter: body.setter || null,
        utm_source: body.utm_source || null,
        utm_medium: body.utm_medium || null,
        utm_campaign: body.utm_campaign || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Survey insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: data?.id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Survey error:', message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
