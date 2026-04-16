import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getCanonicalProduct } from '@/lib/products'

type InRow = {
  date: string
  offer_title: string
  cost: number | string
  buyer_name: string
  buyer_email: string
  buyer_phone?: string
  currency?: string
  transaction_id: string
  source: string
  payment_source?: string
}

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-sync-secret')
    if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { rows } = (await req.json()) as { rows: InRow[] }
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'rows must be a non-empty array' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Dedup by (date, buyer_email, offer_title) — the GHL "transaction_id"
    // is actually the offer ID, so it repeats across distinct sales.
    const emails = Array.from(new Set(rows.map((r) => r.buyer_email).filter(Boolean)))
    const dates = Array.from(new Set(rows.map((r) => r.date).filter(Boolean)))

    const { data: existing, error: selErr } = await supabase
      .from('transactions')
      .select('date, buyer_email, offer_title')
      .in('buyer_email', emails)
      .in('date', dates)

    if (selErr) {
      return NextResponse.json({ error: `select failed: ${selErr.message}` }, { status: 500 })
    }

    const key = (d: string, e: string, o: string) => `${d}|${e}|${o}`
    const existingSet = new Set(
      (existing ?? []).map((e: any) => key(e.date, e.buyer_email, e.offer_title))
    )
    const missing = rows.filter((r) => !existingSet.has(key(r.date, r.buyer_email, r.offer_title)))

    if (missing.length === 0) {
      return NextResponse.json({ inserted: 0, skipped: rows.length, alreadyPresent: [...existingSet] })
    }

    const toInsert = missing.map((r) => ({
      date: r.date,
      offer_title: r.offer_title,
      cost: typeof r.cost === 'string' ? parseFloat(r.cost) || 0 : r.cost,
      buyer_name: r.buyer_name,
      buyer_email: r.buyer_email,
      buyer_phone: r.buyer_phone ?? null,
      currency: r.currency || 'USD',
      transaction_id: r.transaction_id,
      source: r.source,
      payment_source: r.payment_source ?? null,
      status: 'completed',
    }))

    const { error: insErr } = await supabase.from('transactions').insert(toInsert)
    if (insErr) {
      return NextResponse.json({ error: `insert failed: ${insErr.message}` }, { status: 500 })
    }

    // Auto-sync side-effects (PWU students + SPC members) for each inserted row
    for (const r of missing) {
      const canonical = getCanonicalProduct(r.offer_title)
      const costNum = typeof r.cost === 'string' ? parseFloat(r.cost) || 0 : r.cost

      if (canonical.startsWith('Parenting With Understanding') && r.buyer_email) {
        const { data: exist } = await supabase
          .from('pwu_students')
          .select('id')
          .eq('email', r.buyer_email)
          .maybeSingle()
        if (!exist) {
          const parts = (r.buyer_name ?? '').trim().split(/\s+/)
          await supabase.from('pwu_students').insert({
            first_name: parts[0] || 'Unknown',
            last_name: parts.slice(1).join(' ') || null,
            email: r.buyer_email,
            phone: r.buyer_phone ?? null,
            cohort: '1:1',
            type: 'individual',
            status: 'active',
          })
        }
      }

      if (canonical === 'Secure Parent Collective' && r.buyer_email) {
        const spcProvider = r.source === 'Kajabi' ? 'Kajabi' : 'Stripe'

        if (costNum === 0) {
          const { data: exist } = await supabase
            .from('spc_members')
            .select('id, status')
            .eq('email', r.buyer_email)
            .maybeSingle()
          if (!exist) {
            await supabase.from('spc_members').insert({
              name: r.buyer_name || 'Unknown',
              email: r.buyer_email,
              phone: r.buyer_phone ?? null,
              status: 'trial',
              plan: 'monthly',
              amount: 0,
              provider: spcProvider,
              joined_at: r.date,
            })
          } else if (exist.status !== 'cancelled') {
            await supabase.from('spc_members').update({ status: 'trial' }).eq('id', exist.id)
          }
        } else {
          const { data: inCanc } = await supabase
            .from('spc_cancellations')
            .select('id')
            .eq('email', r.buyer_email)
            .maybeSingle()

          if (!inCanc) {
            const { data: exist } = await supabase
              .from('spc_members')
              .select('id, status')
              .eq('email', r.buyer_email)
              .maybeSingle()
            if (!exist) {
              await supabase.from('spc_members').insert({
                name: r.buyer_name || 'Unknown',
                email: r.buyer_email,
                phone: r.buyer_phone ?? null,
                status: 'active',
                plan: costNum >= 400 ? 'annual' : 'monthly',
                amount: costNum,
                provider: spcProvider,
                joined_at: r.date,
              })
            } else if (exist.status === 'trial') {
              await supabase.from('spc_members').update({ status: 'active' }).eq('id', exist.id)
            }
          }
        }
      }
    }

    return NextResponse.json({
      inserted: toInsert.length,
      skipped: rows.length - toInsert.length,
      insertedRows: toInsert.map((t) => ({
        date: t.date,
        buyer_email: t.buyer_email,
        offer_title: t.offer_title,
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 })
  }
}
