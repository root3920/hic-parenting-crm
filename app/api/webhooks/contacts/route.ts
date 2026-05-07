import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const body = await request.json()
    console.log('Contact webhook received:', body)

    const {
      id: ghl_id,
      full_name,
      firstName,
      lastName,
      email,
      phone,
    } = body

    if (!ghl_id && !email) {
      return NextResponse.json({ error: 'Missing id or email' }, { status: 400 })
    }

    // Build full_name from firstName + lastName if full_name not provided
    const name = full_name || [firstName, lastName].filter(Boolean).join(' ') || 'Unknown'

    const { data, error } = await supabase
      .from('contacts')
      .upsert(
        {
          ghl_id: ghl_id || null,
          full_name: name,
          email: email || null,
          phone: phone || null,
          status: 'New',
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'ghl_id',
          ignoreDuplicates: false,
        }
      )
      .select()
      .single()

    if (error) {
      console.error('Contact upsert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, contact: data })
  } catch (err) {
    console.error('Contact webhook error:', err)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'Contact webhook active' })
}
