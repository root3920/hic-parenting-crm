import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  computeHealthScore,
  computeHealthColor,
  isAdvocate,
  isCoachingOpportunity,
  ENGAGEMENT_SCORES,
} from '@/lib/spc-satisfaction'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      email,
      csat,
      value_score,
      engagement,
      top_value,
      outcome,
      barrier,
      support_score,
      feedback,
      nps,
      testimonial_opportunity,
      recovery_permission,
      next_support,
    } = body

    if (!email || csat == null || value_score == null || !engagement || support_score == null || nps == null) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const engagement_score = ENGAGEMENT_SCORES[engagement] ?? 1
    const health_score = computeHealthScore(csat, value_score, engagement_score, support_score, nps)
    const health_color = computeHealthColor({
      healthScore: health_score,
      csat,
      value: value_score,
      engagement: engagement_score,
      support: support_score,
      nps,
      barrier,
      engagementRaw: engagement,
    })
    const advocate = isAdvocate(nps, csat, value_score)
    const coaching = isCoachingOpportunity(barrier, next_support)
    const csm_followup_required = health_color !== 'green'

    // Look up member info
    let memberName: string | null = null
    let membershipStatus: string | null = null
    const { data: member } = await supabase
      .from('spc_members')
      .select('name, status')
      .ilike('email', email)
      .maybeSingle()

    if (member) {
      memberName = member.name
      membershipStatus = member.status
    }

    const { data, error } = await supabase
      .from('spc_satisfaction_responses')
      .insert({
        email: email.toLowerCase().trim(),
        name: memberName,
        membership_status: membershipStatus,
        csat,
        value_score,
        engagement,
        engagement_score,
        top_value: top_value || null,
        outcome: outcome ?? [],
        barrier: barrier || null,
        support_score,
        feedback: feedback || null,
        nps,
        testimonial_opportunity: testimonial_opportunity || null,
        recovery_permission: recovery_permission || null,
        next_support: next_support || null,
        health_score,
        health_color,
        is_advocate: advocate,
        is_coaching_opportunity: coaching,
        csm_followup_required,
        followup_status: csm_followup_required ? 'pending' : 'not_needed',
      })
      .select()
      .single()

    if (error) {
      console.error('Satisfaction insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (health_color === 'red') {
      console.log('[SPC SATISFACTION] RED ALERT', email, { health_score, csat, value_score, nps, engagement_score, support_score })
    }

    return NextResponse.json({ success: true, health_color, health_score, id: data?.id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Satisfaction error:', message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const email = req.nextUrl.searchParams.get('email')

    let query = supabase
      .from('spc_satisfaction_responses')
      .select('*')
      .order('survey_date', { ascending: false })

    if (email) {
      query = query.ilike('email', email)
    }

    const { data, error } = await query

    if (error) {
      console.error('Satisfaction fetch error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Satisfaction error:', message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
