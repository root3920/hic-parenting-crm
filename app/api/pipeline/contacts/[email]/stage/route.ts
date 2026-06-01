import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ email: string }> }
) {
  const { email } = await params
  const decodedEmail = decodeURIComponent(email).toLowerCase()
  const body = await request.json()
  const { stage } = body

  if (!stage || stage < 1 || stage > 5) {
    return NextResponse.json({ error: 'Stage must be 1-5' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('value_ladder_contacts')
    .upsert(
      {
        buyer_email: decodedEmail,
        current_stage: stage,
        manual_override: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'buyer_email' }
    )
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
