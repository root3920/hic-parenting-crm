import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    // Step 1: Find all emails with a $0 SPC trial transaction
    const { data: trialTx, error: trialErr } = await supabase
      .from('transactions')
      .select('buyer_email, date')
      .eq('status', 'completed')
      .eq('cost', 0)
      .ilike('offer_title', '%Secure Parent%')
      .order('date', { ascending: true })

    if (trialErr) {
      return NextResponse.json({ error: `Trial query failed: ${trialErr.message}` }, { status: 500 })
    }

    // Build map: lowercase email → earliest trial date
    const trialDateByEmail: Record<string, string> = {}
    for (const tx of trialTx ?? []) {
      const email = (tx.buyer_email ?? '').toLowerCase().trim()
      if (!email) continue
      if (!trialDateByEmail[email] || tx.date < trialDateByEmail[email]) {
        trialDateByEmail[email] = tx.date
      }
    }

    const trialEmails = Object.keys(trialDateByEmail)

    // Step 2: Find all paid SPC transactions for those trial emails
    const { data: paidTx, error: paidErr } = await supabase
      .from('transactions')
      .select('buyer_email, date, cost')
      .eq('status', 'completed')
      .gt('cost', 0)
      .ilike('offer_title', '%Secure Parent%')
      .order('date', { ascending: true })

    if (paidErr) {
      return NextResponse.json({ error: `Paid query failed: ${paidErr.message}` }, { status: 500 })
    }

    // Build map: lowercase email → earliest paid date after trial
    const paidDateByEmail: Record<string, { date: string; cost: number }> = {}
    for (const tx of paidTx ?? []) {
      const email = (tx.buyer_email ?? '').toLowerCase().trim()
      if (!email) continue
      const trialDate = trialDateByEmail[email]
      if (!trialDate) continue // not a trial email
      if (tx.date <= trialDate) continue // paid before or same day as trial
      if (!paidDateByEmail[email] || tx.date < paidDateByEmail[email].date) {
        paidDateByEmail[email] = { date: tx.date, cost: parseFloat(String(tx.cost)) || 0 }
      }
    }

    // Step 3: These are confirmed conversions — trial email + paid after trial
    const confirmedEmails = Object.keys(paidDateByEmail)

    // Step 4: Update spc_members
    let updatedInDb = 0
    let alreadyMarked = 0
    let notInMembers = 0
    const errors: string[] = []
    const sampleConverted: string[] = []

    for (const email of confirmedEmails) {
      const paid = paidDateByEmail[email]

      // Find member by email (case-insensitive)
      const { data: member } = await supabase
        .from('spc_members')
        .select('id, converted_from_trial')
        .ilike('email', email)
        .maybeSingle()

      if (!member) {
        notInMembers++
        continue
      }

      if (member.converted_from_trial === true) {
        alreadyMarked++
        continue
      }

      const { error } = await supabase
        .from('spc_members')
        .update({ converted_from_trial: true, converted_at: paid.date })
        .eq('id', member.id)

      if (error) {
        errors.push(`${email}: ${error.message}`)
      } else {
        updatedInDb++
        if (sampleConverted.length < 10) {
          sampleConverted.push(`${email} (trial: ${trialDateByEmail[email]}, paid: ${paid.date}, $${paid.cost})`)
        }
      }
    }

    return NextResponse.json({
      trial_emails_found: trialEmails.length,
      confirmed_conversions: confirmedEmails.length,
      updated_in_db: updatedInDb,
      already_marked: alreadyMarked,
      not_in_members: notInMembers,
      sample_converted: sampleConverted,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
