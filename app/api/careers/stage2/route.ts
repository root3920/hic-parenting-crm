import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

/* ─── Scoring logic ──────────────────────────────────────────── */

const SECTION2_SCORES: Record<string, Record<string, number>> = {
  q9:  { B: 5, A: 3, D: 2, C: 0 },
  q10: { C: 5, B: 2, D: 1, A: 0 },
  q11: { B: 5, D: 2, A: 1, C: 0 },
  q12: { C: 5, B: 2, A: 1, D: 0 },
}

function letterFromOption(questionKey: string, optionText: string): string {
  const optionMaps: Record<string, string[]> = {
    q9:  ['A', 'B', 'C', 'D'],
    q10: ['A', 'B', 'C', 'D'],
    q11: ['A', 'B', 'C', 'D'],
    q12: ['A', 'B', 'C', 'D'],
  }
  const options: Record<string, string[]> = {
    q9: [
      'Update the information and continue working without mentioning it.',
      'Update the information, notify the person involved, and explain what happened.',
      'Wait to see if the missing information causes a problem.',
      'Ask another team member to fix it.',
    ],
    q10: [
      'Give her a detailed parenting recommendation.',
      'Tell her that you cannot help and end the conversation.',
      'Validate how she feels, avoid giving clinical advice, and ask questions to understand what support she is looking for.',
      'Immediately send the booking link.',
    ],
    q11: [
      'Send the booking link because booking calls is the main goal.',
      'Ask additional questions and only guide her toward a call if the program may genuinely fit her needs.',
      'Stop responding.',
      'Tell her directly that she cannot join.',
    ],
    q12: [
      'Assume the leads are not qualified enough.',
      'Increase the number of messages without reviewing anything else.',
      'Review your conversations, follow-up rate, response time, objections, and ask for feedback.',
      'Wait until the end of the month to determine whether there is a real problem.',
    ],
  }

  const idx = options[questionKey]?.indexOf(optionText)
  if (idx !== undefined && idx >= 0) return optionMaps[questionKey][idx]
  // If exact text not found, try matching by first letter/prefix
  if (optionText.length === 1 && ['A', 'B', 'C', 'D'].includes(optionText.toUpperCase())) {
    return optionText.toUpperCase()
  }
  return optionText
}

function calculateScores(body: Record<string, unknown>) {
  // Section 1: Q1-Q8 (max 40)
  const q1 = Number(body.q1) || 0
  const q2 = Number(body.q2) || 0
  const q3 = Number(body.q3) || 0
  const q4 = Number(body.q4) || 0
  const q5 = Number(body.q5) || 0
  const q6Raw = Number(body.q6) || 0
  const q7 = Number(body.q7) || 0
  const q8 = Number(body.q8) || 0

  // Q6 inverse scoring
  const q6Inverse = 6 - q6Raw

  const section1_score = q1 + q2 + q3 + q4 + q5 + q6Inverse + q7 + q8

  // Section 2: Q9-Q12 (max 20)
  let section2_score = 0
  for (const qKey of ['q9', 'q10', 'q11', 'q12'] as const) {
    const answer = String(body[qKey] || '')
    const letter = letterFromOption(qKey, answer)
    section2_score += SECTION2_SCORES[qKey][letter] ?? 0
  }

  const total_auto_score = section1_score + section2_score

  // Auto-detect alerts
  const alerts: string[] = []
  if (q1 <= 2) alerts.push('Baja tolerancia al seguimiento')
  if (q2 <= 2) alerts.push('Resistencia a métricas')
  if (q3 <= 2) alerts.push('Tendencia a cambiar procesos sin autorización')
  if (q4 <= 2) alerts.push('Dificultad para aceptar feedback')
  if (q5 <= 2) alerts.push('Riesgo de ocultar errores')
  if (q6Raw >= 4) alerts.push('Baja tolerancia a tareas repetitivas')
  if (q7 <= 2) alerts.push('Dificultad para manejar volumen')

  // Q11 = A check
  const q11Letter = letterFromOption('q11', String(body.q11 || ''))
  if (q11Letter === 'A') alerts.push('Orientación excesiva a agendar sin calificar')

  // Q10 = A check
  const q10Letter = letterFromOption('q10', String(body.q10 || ''))
  if (q10Letter === 'A') alerts.push('Confusión entre empatía y asesoría clínica')

  // Q13 ranking check
  const ranking = body.q13_ranking as string[] | undefined
  if (ranking && ranking.length >= 2) {
    const commItem = 'Earning commissions or bonuses.'
    if (ranking[0] === commItem || ranking[1] === commItem) {
      alerts.push('Motivación principalmente económica')
    }
  }

  return {
    section1_score,
    section2_score,
    total_auto_score,
    score_label: 'Pending human review',
    alerts,
  }
}

/* ─── POST — public submission ───────────────────────────────── */

export async function POST(request: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const body = await request.json()

  // Validate required fields
  if (!body.email || !body.q1 || !body.q2 || !body.q3 || !body.q4 || !body.q5 || !body.q6 || !body.q7 || !body.q8) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (!body.q9 || !body.q10 || !body.q11 || !body.q12) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (!body.q15) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const scores = calculateScores(body)

  const insertData = {
    email: body.email,
    q1: Number(body.q1),
    q2: Number(body.q2),
    q3: Number(body.q3),
    q4: Number(body.q4),
    q5: Number(body.q5),
    q6: Number(body.q6),
    q7: Number(body.q7),
    q8: Number(body.q8),
    q9: String(body.q9),
    q10: String(body.q10),
    q11: String(body.q11),
    q12: String(body.q12),
    q13_ranking: body.q13_ranking || [],
    q14: body.q14 || null,
    q15: String(body.q15),
    ...scores,
  }

  const { error } = await supabase.from('dm_setter_stage2').insert(insertData)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}

/* ─── GET — admin only ───────────────────────────────────────── */

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data, error } = await serviceClient
    .from('dm_setter_stage2')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json(data)
}
