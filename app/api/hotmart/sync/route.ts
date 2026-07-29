import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getAllHotmartSubscribers, type HotmartSubscriber } from '@/lib/hotmart'

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const results = { synced: 0, created: 0, updated: 0, errors: [] as string[] }

  try {
    const subscribers = await getAllHotmartSubscribers()

    for (const sub of subscribers) {
      try {
        const email = sub.subscriber?.email?.toLowerCase()
        if (!email) continue

        const name = sub.subscriber?.name || 'Unknown'
        const priceValue = sub.price?.value ?? 0
        const currency = sub.price?.currency_code ?? 'USD'
        const transactionId = sub.transaction
        const planName = sub.plan?.name
        const plan = planName?.toLowerCase() === 'annual' ? 'annual' : 'monthly'

        // Convert timestamps from ms
        const approvedDate = sub.accession_date
          ? new Date(sub.accession_date).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10)

        const trialEndDate = sub.end_accession_date
          ? new Date(sub.end_accession_date).toISOString().slice(0, 10)
          : null

        const nextChargeDate = sub.date_next_charge
          ? new Date(sub.date_next_charge).toISOString().slice(0, 10)
          : trialEndDate

        // Determine status
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

        // Build offer title
        const offerTitle = priceValue === 0 || sub.trial
          ? 'Secure Parent Collective (Trial)'
          : plan === 'annual'
            ? 'Secure Parent Collective (Annual)'
            : 'Secure Parent Collective (Monthly)'

        // Check if member exists
        const { data: existing } = await supabase
          .from('spc_members')
          .select('id, status')
          .eq('email', email)
          .maybeSingle()

        // Build member data — only set joined_at on create
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
          // New member
          memberData.joined_at = approvedDate
          const { error } = await supabase.from('spc_members').insert(memberData)
          if (error) {
            // If duplicate email, try upsert
            if (error.code === '23505') {
              await supabase.from('spc_members').update(memberData).eq('email', email)
              results.updated++
            } else {
              results.errors.push(`Insert ${email}: ${error.message}`)
              continue
            }
          } else {
            results.created++
          }
        } else {
          // Existing member — update, but don't downgrade active → trial
          if (existing.status === 'active' && status === 'trial') {
            // Keep active, just update dates
            memberData.status = 'active'
          }
          // Check trial → active conversion
          if (existing.status === 'trial' && status === 'active') {
            memberData.converted_from_trial = true
            memberData.converted_at = new Date().toISOString().slice(0, 10)
          }
          const { error } = await supabase
            .from('spc_members')
            .update(memberData)
            .eq('id', existing.id)
          if (error) {
            results.errors.push(`Update ${email}: ${error.message}`)
            continue
          }
          results.updated++
        }

        // Upsert transaction
        if (transactionId) {
          const { error: txError } = await supabase
            .from('transactions')
            .upsert(
              {
                transaction_id: transactionId,
                date: approvedDate,
                offer_title: offerTitle,
                cost: priceValue,
                buyer_name: name,
                buyer_email: email,
                currency,
                source: 'Hotmart',
                status: 'completed',
              },
              { onConflict: 'transaction_id' }
            )
          if (txError && txError.code !== '23505') {
            results.errors.push(`Tx ${transactionId}: ${txError.message}`)
          }
        }

        results.synced++
      } catch (subErr: any) {
        results.errors.push(`Subscriber error: ${subErr.message}`)
      }
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message, ...results },
      { status: 500 }
    )
  }

  console.log('[Hotmart Sync]', JSON.stringify(results))
  return NextResponse.json(results)
}
