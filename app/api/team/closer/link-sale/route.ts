import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()

  // Verify authenticated user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { call_id, transaction_id, linked_by } = body

  if (!call_id || !transaction_id || !linked_by) {
    return NextResponse.json({ error: 'call_id, transaction_id, and linked_by are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('call_sale_matches')
    .insert({
      call_id,
      transaction_id,
      matched_by: 'manual',
      linked_by,
      linked_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'This call is already linked to this transaction' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const matchId = searchParams.get('id')

  if (!matchId) {
    return NextResponse.json({ error: 'Match id is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('call_sale_matches')
    .delete()
    .eq('id', matchId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
