import { createClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-webhook-secret')
    if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()

    const {
      date, offer_tittle, cost, buyer_fullname,
      buyer_email, buyer_phone, currency,
      transaction_id, source
    } = body

    if (!date || !offer_tittle || cost === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: date, offer_tittle, cost' },
        { status: 400 }
      )
    }

    const supabase = createClient()

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        date,
        offer_title: offer_tittle,
        cost: parseFloat(cost) || 0,
        buyer_name: buyer_fullname,
        buyer_email,
        buyer_phone,
        currency: currency || 'USD',
        transaction_id,
        source
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Transaction recorded',
      id: data.id
    }, { status: 200 })

  } catch (err) {
    console.error('Webhook error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
