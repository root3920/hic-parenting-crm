import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getCanonicalProduct } from '@/lib/products'

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
      transaction_id, source, payment_source
    } = body

    if (!date || !offer_tittle || cost === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: date, offer_tittle, cost' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('transactions')
      .upsert({
        date,
        offer_title: offer_tittle,
        cost: parseFloat(cost) || 0,
        buyer_name: buyer_fullname,
        buyer_email,
        buyer_phone,
        currency: currency || 'USD',
        transaction_id,
        source,
        payment_source,
        status: 'completed',
      }, { onConflict: 'transaction_id', ignoreDuplicates: true })
      .select()
      .single()

    if (error) {
      console.error('Supabase upsert error:', JSON.stringify(error))
      return NextResponse.json({ error: error.message, details: error }, { status: 500 })
    }

    // Duplicate skipped — return 200 so Zapier doesn't retry
    if (!data) {
      return NextResponse.json({ success: true, message: 'Duplicate transaction ignored' }, { status: 200 })
    }

    // Auto-create PWU student on new sale if not already enrolled
    const canonical = getCanonicalProduct(offer_tittle)
    if (canonical.startsWith('Parenting With Understanding') && buyer_email) {
      const { data: existing } = await supabase
        .from('pwu_students')
        .select('id')
        .eq('email', buyer_email)
        .maybeSingle()

      if (!existing) {
        const nameParts = (buyer_fullname ?? '').trim().split(/\s+/)
        const first_name = nameParts[0] || 'Unknown'
        const last_name = nameParts.slice(1).join(' ') || null
        await supabase.from('pwu_students').insert({
          first_name,
          last_name,
          email: buyer_email,
          phone: buyer_phone ?? null,
          cohort: '1:1',
          type: 'individual',
          status: 'active',
        })
      }
    }

    // ── Auto-sync SPC member on new sale ──────────────────────────────────────
    if (canonical === 'Secure Parent Collective' && buyer_email) {
      const costNum = parseFloat(cost) || 0
      const spcProvider = source === 'Kajabi' ? 'Kajabi' : 'Stripe'

      if (costNum === 0) {
        // Free-trial transaction → ensure member exists with trial status
        const { data: existing } = await supabase
          .from('spc_members')
          .select('id, status')
          .eq('email', buyer_email)
          .maybeSingle()

        if (!existing) {
          await supabase.from('spc_members').insert({
            name: buyer_fullname || 'Unknown',
            email: buyer_email,
            phone: buyer_phone ?? null,
            status: 'trial',
            plan: 'monthly',
            amount: 0,
            provider: spcProvider,
            joined_at: date,
          })
        } else if (existing.status !== 'cancelled') {
          await supabase.from('spc_members').update({ status: 'trial' }).eq('id', existing.id)
        }
      } else {
        // Paid transaction → activate only if not in cancellations
        const { data: inCancellations } = await supabase
          .from('spc_cancellations')
          .select('id')
          .eq('email', buyer_email)
          .maybeSingle()

        if (!inCancellations) {
          const { data: existing } = await supabase
            .from('spc_members')
            .select('id, status')
            .eq('email', buyer_email)
            .maybeSingle()

          if (!existing) {
            await supabase.from('spc_members').insert({
              name: buyer_fullname || 'Unknown',
              email: buyer_email,
              phone: buyer_phone ?? null,
              status: 'active',
              plan: costNum >= 400 ? 'annual' : 'monthly',
              amount: costNum,
              provider: spcProvider,
              joined_at: date,
            })
          } else if (existing.status === 'trial') {
            await supabase.from('spc_members').update({ status: 'active' }).eq('id', existing.id)
          }
        }
      }
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
