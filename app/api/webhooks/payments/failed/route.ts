import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    console.log('=== FAILED PAYMENT WEBHOOK ===')
    console.log(JSON.stringify(body, null, 2))
    console.log('==============================')

    const contactName = body?.contact?.name ||
                        body?.full_name ||
                        body?.customer?.name || null
    const contactEmail = body?.contact?.email ||
                         body?.email ||
                         body?.customer?.email || null
    const contactPhone = body?.contact?.phone ||
                         body?.phone || null
    const amount = body?.amount ||
                   body?.order?.amount ||
                   body?.payment?.amount || 0
    const productName = body?.product?.name ||
                        body?.order?.name ||
                        body?.funnel?.name ||
                        body?.offer_title || null
    const transactionId = body?.transaction?.id ||
                          body?.order?.id ||
                          body?.id || null

    const { error } = await supabase
      .from('transactions')
      .insert({
        date: new Date().toISOString().split('T')[0],
        offer_title: productName,
        cost: parseFloat(amount) || 0,
        buyer_name: contactName,
        buyer_email: contactEmail,
        buyer_phone: contactPhone,
        currency: 'USD',
        transaction_id: transactionId,
        source: 'GoHighLevel',
        status: 'failed',
      })

    if (error) {
      console.error('DB insert error:', error)
    }

    return NextResponse.json({
      success: true,
      received: true,
      body_keys: Object.keys(body),
      body_received: body,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Failed payment webhook error:', err)
    return NextResponse.json({ error: message }, { status: 200 })
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'Failed payment webhook active',
    url: 'POST https://dashboard.hicparenting.com/api/webhooks/payments/failed',
  })
}
