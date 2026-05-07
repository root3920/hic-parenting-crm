import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface ContactPayload {
  ghl_id: string | null
  full_name: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  owner: string | null
}

function buildUpsertData(p: ContactPayload) {
  return {
    ghl_id: p.ghl_id,
    full_name: p.full_name,
    first_name: p.first_name || null,
    last_name: p.last_name || null,
    email: p.email,
    phone: p.phone,
    owner: p.owner,
    status: 'New',
    updated_at: new Date().toISOString(),
  }
}

async function upsertContact(payload: ContactPayload) {
  const { data, error } = await supabase
    .from('contacts')
    .upsert(buildUpsertData(payload), {
      onConflict: 'ghl_id',
      ignoreDuplicates: false,
    })
    .select()
    .single()

  return { data, error }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  const first_name = searchParams.get('first_name') || ''
  const last_name = searchParams.get('last_name') || ''
  const email = searchParams.get('email') || null
  const phone = searchParams.get('phone') || null
  const ghl_id = searchParams.get('ID') || searchParams.get('id') || null
  const owner = searchParams.get('owner') || null

  const full_name = `${first_name} ${last_name}`.trim() || 'Unknown'

  console.log('Contact webhook GET:', { ghl_id, full_name, email, phone, owner })

  if (!ghl_id && !email) {
    return NextResponse.json({ error: 'Missing id or email' }, { status: 400 })
  }

  const { data, error } = await upsertContact({ ghl_id, full_name, first_name, last_name, email, phone, owner })

  if (error) {
    console.error('Contact upsert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log('Contact saved:', data)
  return NextResponse.json({ success: true, contact: data })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    console.log('Contact webhook POST:', body)

    const first_name = body.first_name || body.firstName || ''
    const last_name = body.last_name || body.lastName || ''
    const email = body.email || null
    const phone = body.phone || null
    const ghl_id = body.ID || body.id || null
    const owner = body.owner || null

    const full_name = body.full_name || `${first_name} ${last_name}`.trim() || 'Unknown'

    if (!ghl_id && !email) {
      return NextResponse.json({ error: 'Missing id or email' }, { status: 400 })
    }

    const { data, error } = await upsertContact({ ghl_id, full_name, first_name, last_name, email, phone, owner })

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
