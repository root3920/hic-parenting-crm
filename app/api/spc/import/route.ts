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

// GHL: all known status values → normalized status
const GHL_STATUS_MAP: Record<string, string> = {
  canceled:           'cancelled',
  cancelled:          'cancelled',
  incomplete_expired: 'cancelled',
  trialing:           'trial',
  approval_pending:   'trial',
  active:             'active',
  paused:             'active',
  past_due:           'active',
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
    const { csv, source, mode = 'cancellations' } = (await req.json()) as { csv: string; source: 'kajabi' | 'ghl'; mode?: 'cancellations' | 'members' }

    if (!csv || !source) {
      return NextResponse.json({ error: 'Missing csv or source' }, { status: 400 })
    }

    const rows = parseCSV(csv)
    const errors: string[] = []

    // ── MODE: members (Kajabi active import) ──────────────────────────────────
    if (mode === 'members') {
      const records: Record<string, unknown>[] = []

      for (const row of rows) {
        if (source === 'kajabi') {
          const status = row['Status']?.trim()
          if (status !== 'active' && status !== 'Pending Cancellation') continue
          records.push({
            name:      row['Customer Name']?.trim() || null,
            email:     row['Customer Email']?.trim() || null,
            amount:    parseAmount(row['Amount'] ?? '0'),
            plan:      mapInterval(row['Interval'] ?? ''),
            provider:  row['Provider']?.trim() || 'Kajabi',
            joined_at: row['Created At']?.trim() || null,
            status:    'active',
          })
        } else {
          // GHL members mode — uses same unified path as cancellations mode below
          const rawStatus = row['Status']?.trim().toLowerCase()
          const mappedStatus = GHL_STATUS_MAP[rawStatus]
          if (!mappedStatus || mappedStatus === 'cancelled') continue
          records.push({
            name:      row['Customer name']?.trim() || null,
            email:     row['Customer email']?.trim() || null,
            amount:    parseAmount(row['Total amount'] ?? '0'),
            plan:      'monthly',
            provider:  row['Payment provider']?.trim() || 'GHL',
            joined_at: row['Subscription start']?.trim() || null,
            status:    mappedStatus,
          })
        }
      }

      if (records.length === 0) {
        return NextResponse.json({ imported: 0, updated: 0, skipped: 0, errors })
      }

      const emails = records.map(r => r.email as string).filter(Boolean)
      const { data: existing } = await supabaseAdmin.from('spc_members').select('email').in('email', emails)
      const existingEmails = new Set((existing ?? []).map((e: { email: string }) => e.email))
      const toInsert = records.filter(r => !existingEmails.has(r.email as string))
      const toUpdate = records.filter(r => existingEmails.has(r.email as string))

      if (toInsert.length > 0) {
        const { error: insertError } = await supabaseAdmin.from('spc_members').insert(toInsert)
        if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
      }

      for (const record of toUpdate) {
        const { error: updateError } = await supabaseAdmin
          .from('spc_members')
          .update(record)
          .eq('email', record.email as string)
        if (updateError) errors.push(`Failed to update ${record.email}: ${updateError.message}`)
      }

      return NextResponse.json({ imported: toInsert.length, updated: toUpdate.length, skipped: 0, errors })
    }

    // ── MODE: cancellations (default) ─────────────────────────────────────────

    if (source === 'kajabi') {
      // ── Kajabi: unchanged logic ──────────────────────────────────────────────
      const records: Record<string, unknown>[] = []

      for (const row of rows) {
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
      }

      if (records.length === 0) {
        return NextResponse.json({ imported: 0, skipped: 0, errors })
      }

      const subIds = records.map(r => r.subscription_id as string)
      const { data: existingCancels } = await supabaseAdmin
        .from('spc_cancellations')
        .select('subscription_id')
        .in('subscription_id', subIds)

      const existingIds = new Set((existingCancels ?? []).map((e: { subscription_id: string }) => e.subscription_id))
      const newRecords = records.filter(r => !existingIds.has(r.subscription_id as string))
      const skipped = records.length - newRecords.length

      if (newRecords.length > 0) {
        const { error: insertError } = await supabaseAdmin.from('spc_cancellations').insert(newRecords)
        if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

        const cancelledEmails = newRecords
          .map(r => r.email as string | null)
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
    }

    // ── GHL: unified status handler ──────────────────────────────────────────

    type CancelRow = Record<string, unknown>
    type MemberRow = { email: string | null; name: string | null; amount: number; status: string; plan: string; provider: string; joined_at: string | null }

    const cancelRows: CancelRow[] = []
    const memberRows: MemberRow[] = []
    let skippedCount = 0

    for (const row of rows) {
      const rawStatus = (row['Status'] ?? '').trim().toLowerCase()
      const mappedStatus = GHL_STATUS_MAP[rawStatus]

      if (!mappedStatus) {
        skippedCount++
        continue
      }

      const email     = row['Customer email']?.trim() || null
      const name      = row['Customer name']?.trim() || null
      const amount    = parseAmount(row['Total amount'] ?? '0')
      const provider  = row['Payment provider']?.trim() || 'GHL'
      const joinedAt  = row['Subscription start']?.trim() || null

      if (mappedStatus === 'cancelled') {
        const subId = row['Subscription id']?.trim()
        if (!subId) {
          errors.push(`Row skipped (no subscription ID): ${email ?? 'unknown'}`)
          continue
        }
        cancelRows.push({
          subscription_id: subId,
          name,
          email,
          customer_phone:  row['Customer phone']?.trim() || null,
          amount,
          currency:        row['Currency']?.trim() || null,
          plan:            'monthly',
          cancel_type:     'paid_cancel' as CancelType,
          cancelled_at:    row['Cancelled at']?.trim() || null,
          offer_title:     row['Line item name']?.trim() || null,
          provider,
          subscribed_at:   joinedAt,
          source:          'ghl',
        })
      } else {
        // trial or active
        memberRows.push({ email, name, amount, status: mappedStatus, plan: 'monthly', provider, joined_at: joinedAt })
      }
    }

    // ── Process cancellations ────────────────────────────────────────────────
    let cancelledCount = 0

    if (cancelRows.length > 0) {
      const subIds = cancelRows.map(r => r.subscription_id as string)
      const { data: existingCancels } = await supabaseAdmin
        .from('spc_cancellations')
        .select('subscription_id')
        .in('subscription_id', subIds)

      const existingIds = new Set((existingCancels ?? []).map((e: { subscription_id: string }) => e.subscription_id))
      const newCancels = cancelRows.filter(r => !existingIds.has(r.subscription_id as string))
      skippedCount += cancelRows.length - newCancels.length

      if (newCancels.length > 0) {
        const { error: insertError } = await supabaseAdmin.from('spc_cancellations').insert(newCancels)
        if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

        cancelledCount = newCancels.length

        // Update spc_members status → cancelled for these emails
        const cancelledEmails = newCancels
          .map(r => r.email as string | null)
          .filter((e): e is string => !!e)

        if (cancelledEmails.length > 0) {
          const { data: membersToCancel } = await supabaseAdmin
            .from('spc_members')
            .select('id')
            .in('email', cancelledEmails)
            .in('status', ['active', 'trial'])

          if (membersToCancel && membersToCancel.length > 0) {
            await supabaseAdmin
              .from('spc_members')
              .update({ status: 'cancelled' })
              .in('id', membersToCancel.map((m: { id: string }) => m.id))
          }
        }
      }
    }

    // ── Process trial / active members ───────────────────────────────────────
    let updatedToTrial = 0
    let updatedToActive = 0
    let insertedNew = 0

    if (memberRows.length > 0) {
      const emails = memberRows.map(r => r.email).filter((e): e is string => !!e)

      const { data: existingMembers } = await supabaseAdmin
        .from('spc_members')
        .select('id, email, status')
        .in('email', emails)

      const existingMap = new Map(
        (existingMembers ?? []).map((m: { id: string; email: string; status: string }) => [m.email, m])
      )

      const toInsert: typeof memberRows = []

      for (const row of memberRows) {
        if (!row.email) continue

        const existing = existingMap.get(row.email)

        if (existing) {
          // Never downgrade a cancelled member
          if (existing.status === 'cancelled') continue

          const { error } = await supabaseAdmin
            .from('spc_members')
            .update({ status: row.status })
            .eq('id', existing.id)

          if (error) {
            errors.push(`Failed to update ${row.email}: ${error.message}`)
          } else {
            if (row.status === 'trial') updatedToTrial++
            else updatedToActive++
          }
        } else {
          toInsert.push(row)
        }
      }

      if (toInsert.length > 0) {
        const { error: insertError } = await supabaseAdmin.from('spc_members').insert(toInsert)
        if (insertError) {
          errors.push(`Bulk insert failed: ${insertError.message}`)
        } else {
          insertedNew = toInsert.length
        }
      }
    }

    return NextResponse.json({
      cancelled:        cancelledCount,
      updated_to_trial: updatedToTrial,
      updated_to_active: updatedToActive,
      inserted_new:     insertedNew,
      skipped:          skippedCount,
      errors,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
