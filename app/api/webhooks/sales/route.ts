import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    console.log('SUPABASE_URL exists:', !!process.env.NEXT_PUBLIC_SUPABASE_URL)
    console.log('SERVICE_ROLE_KEY exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)

    const secret = req.headers.get('x-webhook-secret')
    if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    console.log('Received body:', JSON.stringify(body))

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Handle refund events
    if (body.event_type === 'refund' || body.status === 'refunded') {
      const { transaction_id, buyer_email } = body

      if (!transaction_id && !buyer_email) {
        return NextResponse.json(
          { error: 'Refund requires transaction_id or buyer_email' },
          { status: 400 }
        )
      }

      let query = supabase
        .from('transactions')
        .update({ status: 'refunded' })

      if (transaction_id) {
        query = query.eq('transaction_id', transaction_id)
      } else {
        query = query.eq('buyer_email', buyer_email)
      }

      const { error } = await query

      if (error) {
        console.error('Supabase refund error:', JSON.stringify(error))
        return NextResponse.json({ error: error.message, details: error }, { status: 500 })
      }

      return NextResponse.json({ success: true, action: 'refunded' }, { status: 200 })
    }

    // Handle new sale
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
        source,
        status: 'completed',
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase insert error:', JSON.stringify(error))
      return NextResponse.json({ error: error.message, details: error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Transaction recorded',
      id: data.id
    }, { status: 200 })

  } catch (err: any) {
    console.error('Webhook catch error:', err?.message, err?.stack)
    return NextResponse.json({
      error: 'Internal server error',
      details: err?.message
    }, { status: 500 })
  }
}
