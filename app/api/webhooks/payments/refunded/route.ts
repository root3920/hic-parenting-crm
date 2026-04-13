import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    console.log('=== REFUND WEBHOOK ===')
    console.log(JSON.stringify(body, null, 2))
    console.log('======================')

    const contactEmail = body?.contact?.email ||
                         body?.email ||
                         body?.customer?.email || null
    const amount = body?.amount ||
                   body?.refund?.amount ||
                   body?.order?.amount || 0
    const productName = body?.product?.name ||
                        body?.order?.name ||
                        body?.offer_title || null
    const transactionId = body?.transaction?.id ||
                          body?.order?.id ||
                          body?.id || null
    const refundDate = new Date().toISOString().split('T')[0]

    if (contactEmail && productName) {
      const { data: existing } = await supabase
        .from('transactions')
        .select('id')
        .eq('buyer_email', contactEmail.toLowerCase())
        .ilike('offer_title', `%${productName.substring(0, 30)}%`)
        .eq('status', 'completed')
        .lte('date', refundDate)
        .order('date', { ascending: false })
        .limit(1)
        .single()

      if (existing) {
        await supabase
          .from('transactions')
          .update({ status: 'refunded' })
          .eq('id', existing.id)

        console.log(`Marked transaction ${existing.id} as refunded`)
      } else {
        await supabase.from('transactions').insert({
          date: refundDate,
          offer_title: productName,
          cost: parseFloat(amount) || 0,
          buyer_email: contactEmail,
          currency: 'USD',
          transaction_id: transactionId,
          source: 'GoHighLevel',
          status: 'refunded',
        })
      }
    }

    return NextResponse.json({
      success: true,
      received: true,
      body_keys: Object.keys(body),
      body_received: body,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Refund webhook error:', err)
    return NextResponse.json({ error: message }, { status: 200 })
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'Refund webhook active',
    url: 'POST https://dashboard.hicparenting.com/api/webhooks/payments/refunded',
  })
}
