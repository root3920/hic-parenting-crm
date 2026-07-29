import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getAllHotmartSubscribers } from '@/lib/hotmart'

export async function POST(req: NextRequest) {
  // Verify cron authorization
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const authHeader = req.headers.get('authorization')
  const isValidBearer = authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!isVercelCron && !isValidBearer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const results = {
    expired_trials: 0,
    expired_payment_failures: 0,
    hotmart_synced: 0,
    hotmart_created: 0,
    hotmart_updated: 0,
    errors: [] as string[],
  }

  // ── a) TRIAL → EXPIRED (trial_end_date has passed) ─────────────────────
  try {
    const { data: expiredTrials } = await supabase
      .from('spc_members')
      .select('id, name, email')
      .eq('status', 'trial')
      .lt('trial_end_date', todayStr)

    for (const m of expiredTrials ?? []) {
      await supabase
        .from('spc_members')
        .update({ status: 'expired' })
        .eq('id', m.id)

      await supabase.from('spc_cancellations').insert({
        name: m.name || 'Unknown',
        email: m.email,
        cancelled_at: now.toISOString(),
        trial_cancel: true,
        paid_cancel: false,
        cancel_type: 'trial_expired',
        provider: 'Hotmart',
      })

      results.expired_trials++
    }
  } catch (err: any) {
    results.errors.push(`Trial expiry: ${err.message}`)
  }

  // ── b) ACTIVE → EXPIRED (unresolved payment failures > 7 days) ─────────
  try {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: failures } = await supabase
      .from('hotmart_payment_failures')
      .select('email, name')
      .eq('resolved', false)
      .lt('failed_at', sevenDaysAgo)

    // Deduplicate by email
    const uniqueEmails = Array.from(new Set((failures ?? []).map((f) => f.email)))

    for (const failEmail of uniqueEmails) {
      const failRecord = (failures ?? []).find((f) => f.email === failEmail)

      // Only expire if currently active
      const { data: member } = await supabase
        .from('spc_members')
        .select('id, status, name')
        .eq('email', failEmail)
        .eq('status', 'active')
        .maybeSingle()

      if (!member) continue

      await supabase
        .from('spc_members')
        .update({ status: 'expired' })
        .eq('id', member.id)

      await supabase.from('spc_cancellations').insert({
        name: member.name || failRecord?.name || 'Unknown',
        email: failEmail,
        cancelled_at: now.toISOString(),
        paid_cancel: true,
        trial_cancel: false,
        cancel_type: 'payment_failed',
        provider: 'Hotmart',
      })

      results.expired_payment_failures++
    }
  } catch (err: any) {
    results.errors.push(`Payment failure expiry: ${err.message}`)
  }

  // ── c) Hotmart API sync ────────────────────────────────────────────────
  try {
    const subscribers = await getAllHotmartSubscribers()

    for (const sub of subscribers) {
      try {
        const email = sub.subscriber?.email?.toLowerCase()
        if (!email) continue

        const name = sub.subscriber?.name || 'Unknown'
        const priceValue = sub.price?.value ?? 0
        const planName = sub.plan?.name
        const plan = planName?.toLowerCase() === 'annual' ? 'annual' : 'monthly'

        const approvedDate = sub.accession_date
          ? new Date(sub.accession_date).toISOString().slice(0, 10)
          : todayStr

        const trialEndDate = sub.end_accession_date
          ? new Date(sub.end_accession_date).toISOString().slice(0, 10)
          : null

        const nextChargeDate = sub.date_next_charge
          ? new Date(sub.date_next_charge).toISOString().slice(0, 10)
          : trialEndDate

        let status: 'trial' | 'active' | 'cancelled' | 'expired'
        if (sub.status === 'CANCELLED' || sub.status === 'CANCELLED_BY_CUSTOMER' || sub.status === 'CANCELLED_BY_SELLER' || sub.status === 'CANCELLED_BY_ADMIN') {
          status = 'cancelled'
        } else if (sub.status === 'PAST_DUE' || sub.status === 'OVERDUE') {
          status = 'expired'
        } else if (priceValue === 0 || sub.trial) {
          status = 'trial'
        } else {
          status = 'active'
        }

        const { data: existing } = await supabase
          .from('spc_members')
          .select('id, status')
          .eq('email', email)
          .maybeSingle()

        const memberData: Record<string, unknown> = {
          email,
          name,
          plan,
          amount: priceValue,
          status,
          provider: 'Hotmart',
          trial_days: 30,
          trial_end_date: trialEndDate,
          next_payment_date: nextChargeDate,
        }

        if (!existing) {
          memberData.joined_at = approvedDate
          const { error } = await supabase.from('spc_members').insert(memberData)
          if (error) {
            if (error.code === '23505') {
              await supabase.from('spc_members').update(memberData).eq('email', email)
              results.hotmart_updated++
            } else {
              results.errors.push(`Sync insert ${email}: ${error.message}`)
              continue
            }
          } else {
            results.hotmart_created++
          }
        } else {
          if (existing.status === 'active' && status === 'trial') {
            memberData.status = 'active'
          }
          if (existing.status === 'trial' && status === 'active') {
            memberData.converted_from_trial = true
            memberData.converted_at = todayStr
          }
          const { error } = await supabase
            .from('spc_members')
            .update(memberData)
            .eq('id', existing.id)
          if (error) {
            results.errors.push(`Sync update ${email}: ${error.message}`)
            continue
          }
          results.hotmart_updated++
        }

        results.hotmart_synced++
      } catch (subErr: any) {
        results.errors.push(`Sync subscriber: ${subErr.message}`)
      }
    }
  } catch (err: any) {
    results.errors.push(`Hotmart sync: ${err.message}`)
  }

  console.log('[SPC Process Status]', JSON.stringify(results))

  return NextResponse.json({
    success: true,
    processed_at: now.toISOString(),
    ...results,
  })
}
