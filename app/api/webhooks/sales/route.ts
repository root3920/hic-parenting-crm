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
        return NextResponse.json({ success: false, error: error.message }, { status: 200 })
      }

      return NextResponse.json({ success: true, action: 'refunded' }, { status: 200 })
    }

    // Handle new sale
    const {
      date, offer_tittle, cost, buyer_fullname,
      buyer_email, buyer_phone, currency,
      transaction_id: raw_transaction_id, source, payment_source
    } = body

    if (!date || !offer_tittle || cost === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: date, offer_tittle, cost' },
        { status: 400 }
      )
    }

    // ALWAYS insert a new transaction — never update past ones.
    // Same buyer_email can have multiple products / multiple transactions.
    // If transaction_id is missing OR collides, generate a unique fallback so the row is never dropped.
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    let transaction_id = raw_transaction_id || `fallback-${buyer_email}-${uniqueSuffix}`

    let { error } = await supabase
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
        payment_source,
        status: 'completed',
      })

    // If the unique constraint hits (same transaction_id arriving twice),
    // retry once with a guaranteed-unique id so the new transaction is still recorded.
    if (error?.code === '23505') {
      console.log('transaction_id collision, retrying with unique fallback. Original:', transaction_id)
      transaction_id = `dup-${transaction_id}-${uniqueSuffix}`
      const retry = await supabase
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
          payment_source,
          status: 'completed',
        })
      error = retry.error
    }

    if (error) {
      console.error('Supabase insert error:', JSON.stringify(error))
      return NextResponse.json({ success: false, error: error.message }, { status: 200 })
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
          const plan: 'annual' | 'monthly' = costNum >= 400 ? 'annual' : 'monthly'
          const txDate = new Date(date + 'T12:00:00')
          if (plan === 'annual') txDate.setFullYear(txDate.getFullYear() + 1)
          else txDate.setMonth(txDate.getMonth() + 1)
          const nextPaymentDate = txDate.toISOString().slice(0, 10)

          const { data: existing } = await supabase
            .from('spc_members')
            .select('id, status, plan')
            .eq('email', buyer_email)
            .maybeSingle()

          if (!existing) {
            // Check if this new member had a prior trial
            const { data: priorTrial } = await supabase
              .from('transactions')
              .select('id')
              .ilike('buyer_email', buyer_email)
              .eq('status', 'completed')
              .ilike('offer_title', '%Secure Parent%')
              .eq('cost', 0)
              .lt('date', date)
              .limit(1)

            const hadTrial = priorTrial && priorTrial.length > 0
            await supabase.from('spc_members').insert({
              name: buyer_fullname || 'Unknown',
              email: buyer_email,
              phone: buyer_phone ?? null,
              status: 'active',
              plan,
              amount: costNum,
              provider: spcProvider,
              joined_at: date,
              next_payment_date: nextPaymentDate,
              ...(hadTrial ? { converted_from_trial: true, converted_at: date } : {}),
            })
            if (hadTrial) console.log(`[SPC Webhook] New member from trial conversion: ${buyer_email}`)
          } else {
            // Update next_payment_date for any existing member
            const memberPlan = existing.plan ?? plan
            const npd = new Date(date + 'T12:00:00')
            if (memberPlan === 'annual') npd.setFullYear(npd.getFullYear() + 1)
            else npd.setMonth(npd.getMonth() + 1)

            const updateFields: Record<string, unknown> = {
              next_payment_date: npd.toISOString().slice(0, 10),
            }

            if (existing.status === 'trial' || existing.status === 'expired') {
              updateFields.status = 'active'

              // Check if this is a trial → paid conversion
              const { data: trialTx } = await supabase
                .from('transactions')
                .select('id')
                .ilike('buyer_email', buyer_email)
                .eq('status', 'completed')
                .ilike('offer_title', '%Secure Parent%')
                .eq('cost', 0)
                .lt('date', date)
                .limit(1)

              if (trialTx && trialTx.length > 0) {
                updateFields.converted_from_trial = true
                updateFields.converted_at = date
                console.log(`[SPC Webhook] Trial conversion confirmed for ${buyer_email}`)
              } else {
                console.log(`[SPC Webhook] Direct paid signup for ${buyer_email}`)
              }
            }

            await supabase.from('spc_members').update(updateFields).eq('id', existing.id)
          }
        }
      }
    }

    return NextResponse.json({ success: true }, { status: 200 })

  } catch (err: any) {
    console.error('Webhook catch error:', err?.message, err?.stack)
    return NextResponse.json({ success: false, error: err?.message ?? 'Internal server error' }, { status: 200 })
  }
}
