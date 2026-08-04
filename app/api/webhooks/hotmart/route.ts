import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const ok = () => NextResponse.json({ received: true }, { status: 200 })

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let body: any
  let email: string | undefined

  try {
    body = await req.json()

    // ── Unconditional raw log — captures ALL incoming requests ───────────
    // Logged BEFORE auth so rejected/unrecognized payloads are never lost.
    try {
      await supabase.from('hotmart_webhook_logs').insert({
        event: body?.event || 'unknown',
        email: body?.data?.buyer?.email || null,
        payload: body,
        status: 'received',
      })
    } catch {
      // Never let logging break the webhook
    }

    // ── Auth — accept hottok from header OR body ─────────────────────────
    const token = req.headers.get('x-hotmart-hottok') || body?.hottok
    if (!token || token !== process.env.HOTMART_WEBHOOK_TOKEN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const event = body.event as string | undefined
    const buyer = body.data?.buyer
    const purchase = body.data?.purchase
    const product = body.data?.product
    const subscription = body.data?.subscription // singular, not array

    email = buyer?.email
    const name = buyer?.name
    const phone = buyer?.checkout_phone
    const transactionId = purchase?.transaction
    const priceValue = purchase?.price?.value ?? 0
    const currency = purchase?.price?.currency_value ?? 'USD'
    const paymentType = purchase?.payment?.type
    const offerCode = purchase?.offer?.code

    // Subscription fields (singular object)
    const planName = subscription?.plan?.name // 'Monthly' or 'Annual'
    const plan = planName?.toLowerCase() === 'annual' ? 'annual' : 'monthly'

    // Convert approved_date from ms timestamp to Date
    const approvedDateMs = purchase?.approved_date
    const approvedDate = approvedDateMs ? new Date(approvedDateMs) : null

    const now = new Date()

    // Detect new vs renewal: approved_date within 24h = new purchase
    const isNewPurchase = approvedDate
      ? (now.getTime() - approvedDate.getTime()) < 24 * 60 * 60 * 1000
      : true // default to new if no approved_date

    // Build offer_title based on plan
    const getOfferTitle = (isTrial: boolean): string => {
      if (isTrial) return 'Secure Parent Collective (Trial)'
      if (plan === 'annual') return 'Secure Parent Collective (Annual)'
      return 'Secure Parent Collective (Monthly)'
    }

    // ── Event handlers ────────────────────────────────────────────────────
    switch (event) {
      case 'PURCHASE_APPROVED': {
        if (!email) break

        const dateStr = approvedDate
          ? approvedDate.toISOString().slice(0, 10)
          : now.toISOString().slice(0, 10)

        if (priceValue === 0) {
          // ── FREE TRIAL ──────────────────────────────────────────────
          const joinedAt = approvedDate ?? now
          const trialEnd = new Date(joinedAt)
          trialEnd.setDate(trialEnd.getDate() + 30)

          await supabase.from('spc_members').upsert(
            {
              email,
              name: name || 'Unknown',
              phone: phone ?? null,
              plan: 'monthly',
              amount: 0,
              status: 'trial',
              provider: 'Hotmart',
              joined_at: joinedAt.toISOString(),
              trial_days: 30,
              trial_end_date: trialEnd.toISOString().slice(0, 10),
              next_payment_date: trialEnd.toISOString().slice(0, 10),
            },
            { onConflict: 'email' }
          )

          await supabase.from('transactions').insert({
            date: dateStr,
            offer_title: getOfferTitle(true),
            cost: 0,
            buyer_name: name,
            buyer_email: email,
            buyer_phone: phone,
            currency,
            transaction_id: transactionId,
            source: 'Hotmart',
            payment_source: paymentType,
            status: 'completed',
          })
        } else if (isNewPurchase && priceValue > 0) {
          // ── NEW PAID MEMBER ─────────────────────────────────────────
          const nextPayment = new Date(now)
          if (plan === 'annual') nextPayment.setFullYear(nextPayment.getFullYear() + 1)
          else nextPayment.setDate(nextPayment.getDate() + 30)

          // Check if converting from trial
          const { data: existing } = await supabase
            .from('spc_members')
            .select('id, status')
            .eq('email', email)
            .maybeSingle()

          const convertedFromTrial = existing?.status === 'trial'

          await supabase.from('spc_members').upsert(
            {
              email,
              name: name || 'Unknown',
              phone: phone ?? null,
              plan,
              amount: priceValue,
              status: 'active',
              provider: 'Hotmart',
              joined_at: existing ? undefined : now.toISOString(),
              next_payment_date: nextPayment.toISOString().slice(0, 10),
              ...(convertedFromTrial
                ? { converted_from_trial: true, converted_at: now.toISOString().slice(0, 10) }
                : {}),
            },
            { onConflict: 'email' }
          )

          await supabase.from('transactions').insert({
            date: dateStr,
            offer_title: getOfferTitle(false),
            cost: priceValue,
            buyer_name: name,
            buyer_email: email,
            buyer_phone: phone,
            currency,
            transaction_id: transactionId,
            source: 'Hotmart',
            payment_source: paymentType,
            status: 'completed',
          })
        } else if (!isNewPurchase && priceValue > 0) {
          // ── RENEWAL PAYMENT ─────────────────────────────────────────
          const nextPayment = new Date(now)
          nextPayment.setDate(nextPayment.getDate() + 30)

          await supabase
            .from('spc_members')
            .update({
              next_payment_date: nextPayment.toISOString().slice(0, 10),
              status: 'active',
            })
            .eq('email', email)

          await supabase.from('transactions').insert({
            date: dateStr,
            offer_title: getOfferTitle(false),
            cost: priceValue,
            buyer_name: name,
            buyer_email: email,
            buyer_phone: phone,
            currency,
            transaction_id: transactionId,
            source: 'Hotmart',
            payment_source: paymentType,
            status: 'completed',
          })
        }
        break
      }

      case 'PURCHASE_CANCELED':
      case 'SUBSCRIPTION_CANCELLATION': {
        if (!email) break

        // Get current member state before updating
        const { data: member } = await supabase
          .from('spc_members')
          .select('status, amount')
          .eq('email', email)
          .maybeSingle()

        await supabase
          .from('spc_members')
          .update({ status: 'cancelled' })
          .eq('email', email)

        await supabase.from('spc_cancellations').insert({
          name: name || 'Unknown',
          email,
          cancelled_at: now.toISOString(),
          paid_cancel: (member?.amount ?? 0) > 0,
          trial_cancel: member?.status === 'trial',
          provider: 'Hotmart',
          cancel_type: 'requested',
        })
        break
      }

      case 'PURCHASE_REFUNDED': {
        if (!email) break

        await supabase
          .from('spc_members')
          .update({ status: 'cancelled' })
          .eq('email', email)

        await supabase.from('spc_cancellations').insert({
          name: name || 'Unknown',
          email,
          cancelled_at: now.toISOString(),
          paid_cancel: true,
          trial_cancel: false,
          provider: 'Hotmart',
          cancel_type: 'refund',
        })
        break
      }

      case 'PURCHASE_DELAYED': {
        if (!email) break

        await supabase.from('hotmart_payment_failures').insert({
          email,
          name: name || null,
          transaction_id: transactionId,
          amount: priceValue,
        })
        // Do NOT change spc_members status
        break
      }

      case 'CART_ABANDONMENT':
      case 'PURCHASE_OUT_OF_SHOPPING_CART': {
        if (!email) break

        await supabase.from('hotmart_cart_abandoned').insert({
          email,
          name: name || null,
          phone: phone || null,
          country: buyer?.address?.country || null,
          product: product?.name || null,
          offer_code: offerCode || null,
          recovered: false,
        })
        break
      }

      case 'SWITCH_PLAN': {
        if (!email) break

        await supabase
          .from('spc_members')
          .update({
            plan,
            amount: priceValue,
          })
          .eq('email', email)
        break
      }

      default:
        console.log(`[Hotmart Webhook] Unhandled event: ${event}`)
    }

    // ── Log processed result ────────────────────────────────────────────
    await supabase.from('hotmart_webhook_logs').insert({
      event: event || 'unknown',
      email: email || null,
      payload: body,
      status: 'processed',
    })

    return ok()
  } catch (err: any) {
    console.error('[Hotmart Webhook] Error:', err?.message, err?.stack)

    // Log error
    try {
      await supabase.from('hotmart_webhook_logs').insert({
        event: body?.event || 'unknown',
        email: email || body?.data?.buyer?.email || null,
        payload: body || null,
        status: 'error',
        error_message: err?.message || 'Unknown error',
      })
    } catch {
      // Ignore log errors
    }

    // Always return 200 — Hotmart retries on non-200
    return ok()
  }
}
