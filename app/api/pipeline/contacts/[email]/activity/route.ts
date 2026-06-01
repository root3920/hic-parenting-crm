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

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (body.setter_assigned !== undefined) updates.setter_assigned = body.setter_assigned
  if (body.last_contacted_at !== undefined) updates.last_contacted_at = body.last_contacted_at
  if (body.product_proposed !== undefined) updates.product_proposed = body.product_proposed
  if (body.notes !== undefined) updates.notes = body.notes

  const { data, error } = await supabase
    .from('value_ladder_contacts')
    .upsert(
      {
        buyer_email: decodedEmail,
        ...updates,
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
