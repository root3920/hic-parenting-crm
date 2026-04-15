import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  if (lines.length < 2) return []

  function parseRow(line: string): string[] {
    const fields: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim()); current = ''
      } else {
        current += ch
      }
    }
    fields.push(current.trim())
    return fields
  }

  const headers = parseRow(lines[0])
  return lines
    .slice(1)
    .filter((l) => l.trim())
    .map((line) => {
      const values = parseRow(line)
      return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']))
    })
}

// ── Status mappers ────────────────────────────────────────────────────────────

type CancelType = 'paid_cancel' | 'pending_cancel'

function mapKajabiStatus(status: string): { cancel_type: CancelType; mapped_status: string } | null {
  const s = status.trim()
  if (s === 'Canceled') return { cancel_type: 'paid_cancel', mapped_status: 'cancelled' }
  if (s === 'Pending Cancellation') return { cancel_type: 'pending_cancel', mapped_status: 'cancelled' }
  if (s.toLowerCase().includes('failed')) return { cancel_type: 'paid_cancel', mapped_status: 'failed' }
  return null
}

function mapGHLStatus(status: string): { cancel_type: CancelType; mapped_status: string } | null {
  const s = status.trim().toLowerCase()
  if (s === 'cancelled') return { cancel_type: 'paid_cancel', mapped_status: 'cancelled' }
  if (s === 'failed') return { cancel_type: 'paid_cancel', mapped_status: 'failed' }
  if (s === 'cancel') return { cancel_type: 'paid_cancel', mapped_status: 'cancelled' }
  return null
}

function parseAmount(val: string): number {
  return parseFloat(val.replace(/[$,\s]/g, '')) || 0
}

function mapInterval(interval: string): 'monthly' | 'annual' {
  const i = interval.trim().toLowerCase()
  if (i.includes('year') || i === 'annual') return 'annual'
  return 'monthly'
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { csv, source } = (await req.json()) as { csv: string; source: 'kajabi' | 'ghl' }

    if (!csv || !source) {
      return NextResponse.json({ error: 'Missing csv or source' }, { status: 400 })
    }

    const rows = parseCSV(csv)
    const errors: string[] = []
    const records: Record<string, unknown>[] = []

    for (const row of rows) {
      if (source === 'kajabi') {
        const mapped = mapKajabiStatus(row['Status'] ?? '')
        if (!mapped) continue

        const subId = row['Kajabi Subscription ID']?.trim()
        if (!subId) {
          errors.push(`Row skipped (no subscription ID): ${row['Customer Email'] ?? 'unknown'}`)
          continue
        }

        records.push({
          subscription_id: subId,
          name:            row['Customer Name']?.trim() || null,
          email:           row['Customer Email']?.trim() || null,
          amount:          parseAmount(row['Amount'] ?? '0'),
          currency:        row['Currency']?.trim() || null,
          interval:        row['Interval']?.trim() || null,
          plan:            mapInterval(row['Interval'] ?? ''),
          cancel_type:     mapped.cancel_type,
          cancelled_at:    row['Canceled On']?.trim() || null,
          offer_title:     row['Offer Title']?.trim() || null,
          provider:        row['Provider']?.trim() || null,
          subscribed_at:   row['Created At']?.trim() || null,
          source:          'kajabi',
        })
      } else {
        // GHL
        const mapped = mapGHLStatus(row['Status'] ?? '')
        if (!mapped) continue

        const subId = row['Subscription id']?.trim()
        if (!subId) {
          errors.push(`Row skipped (no subscription ID): ${row['Customer email'] ?? 'unknown'}`)
          continue
        }

        records.push({
          subscription_id: subId,
          name:            row['Customer name']?.trim() || null,
          email:           row['Customer email']?.trim() || null,
          customer_phone:  row['Customer phone']?.trim() || null,
          amount:          parseAmount(row['Total amount'] ?? '0'),
          currency:        row['Currency']?.trim() || null,
          plan:            'monthly',
          cancel_type:     mapped.cancel_type,
          cancelled_at:    row['Cancelled at']?.trim() || null,
          offer_title:     row['Line item name']?.trim() || null,
          provider:        row['Payment provider']?.trim() || null,
          subscribed_at:   row['Subscription start']?.trim() || null,
          source:          'ghl',
        })
      }
    }

    if (records.length === 0) {
      return NextResponse.json({ imported: 0, skipped: 0, errors })
    }

    // Check which subscription_ids already exist in this batch
    const subIds = records.map((r) => r.subscription_id as string)
    const { data: existing } = await supabaseAdmin
      .from('spc_cancellations')
      .select('subscription_id')
      .in('subscription_id', subIds)

    const existingIds = new Set((existing ?? []).map((e: { subscription_id: string }) => e.subscription_id))
    const newRecords = records.filter((r) => !existingIds.has(r.subscription_id as string))
    const skipped = records.length - newRecords.length

    if (newRecords.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('spc_cancellations')
        .insert(newRecords)

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }

      // ── Sync spc_members status for newly cancelled emails ─────────────────
      const cancelledEmails = newRecords
        .map((r) => r.email as string | null)
        .filter((e): e is string => !!e)

      if (cancelledEmails.length > 0) {
        const { data: membersToUpdate } = await supabaseAdmin
          .from('spc_members')
          .select('id')
          .in('email', cancelledEmails)
          .in('status', ['active', 'trial'])

        if (membersToUpdate && membersToUpdate.length > 0) {
          await supabaseAdmin
            .from('spc_members')
            .update({ status: 'cancelled' })
            .in('id', membersToUpdate.map((m: { id: string }) => m.id))
        }
      }
    }

    return NextResponse.json({ imported: newRecords.length, skipped, errors })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
