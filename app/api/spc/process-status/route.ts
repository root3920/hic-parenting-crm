import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

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
  const results = { expired_trials: 0, expired_payment_failures: 0, errors: [] as string[] }

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

  console.log('[SPC Process Status]', JSON.stringify(results))

  return NextResponse.json({
    success: true,
    processed_at: now.toISOString(),
    ...results,
  })
}
