import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { full_name, email, checked_items } = body

    if (!full_name || !email || !checked_items) {
      return NextResponse.json(
        { error: 'full_name, email, and checked_items are required' },
        { status: 400 }
      )
    }

    // Match to upcoming call by email
    let call_id: string | null = null
    const { data: call } = await supabase
      .from('calls')
      .select('id')
      .eq('email', email)
      .gt('start_date', new Date().toISOString())
      .order('start_date', { ascending: true })
      .limit(1)
      .single()

    if (call) {
      call_id = call.id
    }

    const { error } = await supabase.from('checklist_submissions').insert({
      full_name,
      email,
      checked_items,
      call_id,
    })

    if (error) {
      console.error('Checklist insert error:', error)
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
    }

    return NextResponse.json({ success: true, call_id })
  } catch (err) {
    console.error('Checklist submit error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
