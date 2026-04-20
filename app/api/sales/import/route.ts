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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns 0 for empty/invalid values — never passes NaN to the DB */
function parseAmount(val: string): number {
  if (!val || val.trim() === '') return 0
  const n = parseFloat(val.replace(/[$,\s]/g, ''))
  return isNaN(n) ? 0 : n
}

/** Returns "YYYY-MM-DD" or null — never passes an empty string to the DB */
function parseDate(dateStr: string, timeStr = ''): string | null {
  const ds = dateStr?.trim() ?? ''
  if (!ds || ds === 'NA') return null
  const combined = timeStr?.trim() ? `${ds} ${timeStr.trim()}` : ds
  const d = new Date(combined)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  // Try MM/DD/YYYY
  const parts = ds.split('/')
  if (parts.length === 3) {
    const [m, day, y] = parts
    const iso = `${y}-${m.padStart(2, '0')}-${day.padStart(2, '0')}`
    const d2 = new Date(iso)
    if (!isNaN(d2.getTime())) return iso
  }
  return null
}

function isTruthy(val: string): boolean {
  const v = val.trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes' || v === 'refunded' || v.includes('refund')
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
        const status = row['Status']?.trim() ?? ''
        const type = row['Type']?.trim() ?? ''
        const isRefund = type.toLowerCase() === 'refund'
        const isFailed = status.toLowerCase() === 'failed'

        if (!isRefund && !isFailed) continue

        const txId = row['ID']?.trim()
        if (!txId) {
          errors.push(`Row skipped (no ID): ${row['Customer Email'] ?? 'unknown'}`)
          continue
        }

        records.push({
          transaction_id: txId,
          date:           parseDate(row['Created At'] ?? ''),
          cost:           parseAmount(row['Amount'] ?? ''),
          currency:       row['Currency']?.trim() || 'USD',
          status:         isRefund ? 'refunded' : 'failed',
          offer_title:    row['Offer Title']?.trim() || null,
          buyer_name:     row['Customer Name']?.trim() || null,
          buyer_email:    row['Customer Email']?.trim() || null,
          buyer_phone:    row['Phone']?.trim() || null,
          payment_source: row['Payment Method']?.trim() || null,
          source:         'Kajabi',
        })
      } else {
        // GHL
        const status = row['Status']?.trim() ?? ''
        const isRefunded = isTruthy(row['Is refunded'] ?? '')
        const isFailed = status.toLowerCase() === 'failed'

        if (!isRefunded && !isFailed) continue

        const txId = row['Internal transaction id']?.trim()
        if (!txId) {
          errors.push(`Row skipped (no transaction ID): ${row['Customer email'] ?? 'unknown'}`)
          continue
        }

        const amountPaid = parseAmount(row['Total amount paid'] ?? '')
        const amountDue  = parseAmount(row['Total amount due'] ?? '')
        const amount = amountPaid || amountDue

        const dateStr = row['Transaction date']?.trim() ?? ''
        const timeStr = row['Transaction time']?.trim() ?? ''

        records.push({
          transaction_id:  txId,
          date:            parseDate(dateStr ? `${dateStr} ${timeStr}` : '', ''),
          cost:            amount,
          currency:        row['Currency']?.trim() || 'USD',
          status:          isRefunded ? 'refunded' : 'failed',
          offer_title:     row['Line item name']?.trim() || null,
          buyer_name:      row['Customer name']?.trim() || null,
          buyer_email:     row['Customer email']?.trim() || null,
          buyer_phone:     row['Customer phone']?.trim() || null,
          payment_source:  row['Payment method']?.trim() || null,
          source:          'GoHighLevel',
        })
      }
    }

    if (records.length === 0) {
      return NextResponse.json({ imported: 0, skipped: 0, errors })
    }

    // Check which transaction_ids already exist in this batch
    const txIds = records.map((r) => r.transaction_id as string)
    const { data: existing } = await supabaseAdmin
      .from('transactions')
      .select('transaction_id')
      .in('transaction_id', txIds)

    const existingIds = new Set(
      (existing ?? []).map((e: { transaction_id: string }) => e.transaction_id)
    )
    const newRecords = records.filter((r) => !existingIds.has(r.transaction_id as string))
    const skipped = records.length - newRecords.length

    if (newRecords.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('transactions')
        .insert(newRecords)

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
    }

    return NextResponse.json({ imported: newRecords.length, skipped, errors })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
