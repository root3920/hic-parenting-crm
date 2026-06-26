import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  const { member_email, transaction_id } = await request.json()
  if (!member_email || !transaction_id) {
    return NextResponse.json({ error: 'member_email and transaction_id are required' }, { status: 400 })
  }

  // Check for duplicate
  const { data: existing } = await supabaseAdmin
    .from('spc_member_transactions')
    .select('id')
    .eq('member_email', member_email.toLowerCase())
    .eq('transaction_id', transaction_id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Transaction already linked' }, { status: 409 })
  }

  const { data, error } = await supabaseAdmin
    .from('spc_member_transactions')
    .insert({
      member_email: member_email.toLowerCase(),
      transaction_id,
      linked_manually: true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(request: Request) {
  const { member_email, transaction_id } = await request.json()
  if (!member_email || !transaction_id) {
    return NextResponse.json({ error: 'member_email and transaction_id are required' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('spc_member_transactions')
    .delete()
    .eq('member_email', member_email.toLowerCase())
    .eq('transaction_id', transaction_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const email = searchParams.get('email')

  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('spc_member_transactions')
    .select('*')
    .eq('member_email', email.toLowerCase())

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
