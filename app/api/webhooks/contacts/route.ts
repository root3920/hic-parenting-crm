import { createClient } from '@supabase/supabase-js'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    // Log ALL params received from GHL
    const allParams: Record<string, string> = {}
    searchParams.forEach((value, key) => {
      allParams[key] = value
    })
    console.log('=== CONTACTS WEBHOOK GET ===')
    console.log('All params:', JSON.stringify(allParams))
    console.log('Full URL:', request.url)

    const first_name = searchParams.get('first_name') || ''
    const last_name = searchParams.get('last_name') || ''
    const email = searchParams.get('email') || null
    const phone = searchParams.get('phone') || null
    const ghl_id = searchParams.get('ID') || searchParams.get('id') || null
    const owner = searchParams.get('owner') || null

    const full_name = `${first_name} ${last_name}`.trim() || 'Unknown'

    console.log('Parsed:', { ghl_id, full_name, email, phone, owner })

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error('Missing NEXT_PUBLIC_SUPABASE_URL')
      return Response.json({ error: 'Missing Supabase URL' }, { status: 500 })
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing SUPABASE_SERVICE_ROLE_KEY')
      return Response.json({ error: 'Missing service role key' }, { status: 500 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await supabase
      .from('contacts')
      .upsert({
        ghl_id: ghl_id,
        full_name: full_name,
        first_name: first_name,
        last_name: last_name,
        email: email,
        phone: phone,
        owner: owner,
        status: 'New',
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'ghl_id',
        ignoreDuplicates: false,
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', JSON.stringify(error))
      return Response.json({ error: error.message, details: error }, { status: 500 })
    }

    console.log('Contact saved successfully:', data?.id)
    return Response.json({ success: true, id: data?.id })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const stack = err instanceof Error ? err.stack : undefined
    console.error('Webhook crash:', message, stack)
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    console.log('=== CONTACTS WEBHOOK POST ===')
    console.log('Body:', JSON.stringify(body))

    const first_name = body.first_name || ''
    const last_name = body.last_name || ''
    const email = body.email || null
    const phone = body.phone || null
    const ghl_id = body.ID || body.id || body.ghl_id || null
    const owner = body.owner || null
    const full_name = `${first_name} ${last_name}`.trim() || body.full_name || 'Unknown'

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await supabase
      .from('contacts')
      .upsert({
        ghl_id, full_name, first_name, last_name,
        email, phone, owner,
        status: 'New',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'ghl_id' })
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ success: true, id: data?.id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('POST crash:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
