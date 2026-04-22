import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── CSV parser via papaparse ─────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  // Strip BOM (common in GHL exports)
  const cleaned = text.replace(/^\uFEFF/, '')
  const result = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
    transform: (v) => v.trim(),
  })
  return result.data
}

// ── Case-insensitive column lookup ───────────────────────────────────────────

function getCol(row: Record<string, string>, name: string): string {
  const lower = name.toLowerCase()
  const key = Object.keys(row).find((k) => k.trim().toLowerCase() === lower)
  return key ? (row[key] ?? '').trim() : ''
}

// ── Status mappers ────────────────────────────────────────────────────────────

function mapKajabiStatus(status: string): { cancel_type: string; mapped_status: string } | null {
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

function deriveIntervalFromName(name: string): 'monthly' | 'annual' {
  const lower = (name ?? '').toLowerCase()
  if (lower.includes('year') || lower.includes('annual')) return 'annual'
  return 'monthly'
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { csv, source, mode = 'cancellations' } = (await req.json()) as {
      csv: string; source: 'kajabi' | 'ghl'; mode?: 'cancellations' | 'members'
    }

    if (!csv || !source) {
      return NextResponse.json({ error: 'Missing csv or source' }, { status: 400 })
    }

    const rows = parseCSV(csv)
    const errors: string[] = []

    // Debug: log parsed headers so column name issues are visible
    if (rows.length > 0) {
      console.log('[SPC Import] Parsed headers:', Object.keys(rows[0]))
      console.log('[SPC Import] First row sample:', JSON.stringify(rows[0]).slice(0, 300))
      console.log('[SPC Import] Total rows:', rows.length, '| Source:', source, '| Mode:', mode)
    } else {
      console.log('[SPC Import] WARNING: 0 rows parsed from CSV')
    }

    // ── MODE: members (Kajabi active import) ──────────────────────────────────
    if (mode === 'members') {
      const records: Record<string, unknown>[] = []

      for (const row of rows) {
        if (source === 'kajabi') {
          const status = getCol(row, 'Status')
          if (status !== 'active' && status !== 'Pending Cancellation') continue
          records.push({
            name:      getCol(row, 'Customer Name') || null,
            email:     getCol(row, 'Customer Email').toLowerCase() || null,
            amount:    parseAmount(getCol(row, 'Amount')),
            plan:      mapInterval(getCol(row, 'Interval')),
            provider:  getCol(row, 'Provider') || 'Kajabi',
            joined_at: getCol(row, 'Created At') || null,
            status:    'active',
          })
        } else {
          const rawStatus = getCol(row, 'Status').toLowerCase()
          const mappedStatus = GHL_STATUS_MAP[rawStatus]
          if (!mappedStatus || mappedStatus === 'cancelled') continue
          records.push({
            name:      getCol(row, 'Customer name') || null,
            email:     getCol(row, 'Customer email').toLowerCase() || null,
            amount:    parseAmount(getCol(row, 'Total amount')),
            plan:      deriveIntervalFromName(getCol(row, 'Line item name')),
            provider:  getCol(row, 'Payment provider') || 'GHL',
            joined_at: getCol(row, 'Subscription start') || null,
            status:    mappedStatus,
          })
        }
      }

      if (records.length === 0) {
        return NextResponse.json({ imported: 0, updated: 0, skipped: 0, errors })
      }

      const emails = records.map(r => r.email as string).filter(Boolean)
      const { data: existing } = await supabaseAdmin
        .from('spc_members')
        .select('email')
        .in('email', emails)
      const existingEmails = new Set((existing ?? []).map((e: { email: string }) => e.email?.toLowerCase()))
      const toInsert = records.filter(r => !existingEmails.has((r.email as string)?.toLowerCase()))
      const toUpdate = records.filter(r => existingEmails.has((r.email as string)?.toLowerCase()))

      if (toInsert.length > 0) {
        const { error: insertError } = await supabaseAdmin.from('spc_members').insert(toInsert)
        if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
      }

      for (const record of toUpdate) {
        const { error: updateError } = await supabaseAdmin
          .from('spc_members')
          .update(record)
          .ilike('email', record.email as string)
        if (updateError) errors.push(`Failed to update ${record.email}: ${updateError.message}`)
      }

      return NextResponse.json({ imported: toInsert.length, updated: toUpdate.length, skipped: 0, errors })
    }

    // ── MODE: cancellations (default) ─────────────────────────────────────────

    if (source === 'kajabi') {
      const records: Record<string, unknown>[] = []

      for (const row of rows) {
        const mapped = mapKajabiStatus(getCol(row, 'Status'))
        if (!mapped) continue

        const subId = getCol(row, 'Kajabi Subscription ID')
        if (!subId) {
          errors.push(`Row skipped (no subscription ID): ${getCol(row, 'Customer Email') || 'unknown'}`)
          continue
        }

        records.push({
          subscription_id: subId,
          name:            getCol(row, 'Customer Name') || null,
          email:           getCol(row, 'Customer Email').toLowerCase() || null,
          amount:          parseAmount(getCol(row, 'Amount')),
          currency:        getCol(row, 'Currency') || null,
          interval:        getCol(row, 'Interval') || null,
          plan:            mapInterval(getCol(row, 'Interval')),
          cancel_type:     mapped.cancel_type,
          cancelled_at:    getCol(row, 'Canceled On') || null,
          offer_title:     getCol(row, 'Offer Title') || null,
          provider:        getCol(row, 'Provider') || null,
          subscribed_at:   getCol(row, 'Created At') || null,
          source:          'kajabi',
        })
      }

      if (records.length === 0) {
        return NextResponse.json({ parsed_total: rows.length, cancelled: 0, skipped: 0, errors })
      }

      // Upsert by email — updates existing record if same email, inserts otherwise
      let upserted = 0
      let skipped = 0

      for (const record of records) {
        const email = record.email as string | null
        if (!email) {
          // No email — insert directly (won't conflict with unique index)
          const { error } = await supabaseAdmin.from('spc_cancellations').insert(record)
          if (error) {
            errors.push(`Insert failed for ${record.subscription_id}: ${error.message}`)
          } else {
            upserted++
          }
          continue
        }

        const { data: existing } = await supabaseAdmin
          .from('spc_cancellations')
          .select('id')
          .eq('email', email)
          .maybeSingle()

        if (existing) {
          const { error } = await supabaseAdmin
            .from('spc_cancellations')
            .update(record)
            .eq('id', existing.id)
          if (error) {
            errors.push(`Update failed for ${email}: ${error.message}`)
          } else {
            upserted++
          }
        } else {
          const { error } = await supabaseAdmin.from('spc_cancellations').insert(record)
          if (error) {
            errors.push(`Insert failed for ${email}: ${error.message}`)
          } else {
            upserted++

            // Only update spc_members for new cancellations
            await supabaseAdmin
              .from('spc_members')
              .update({ status: 'cancelled' })
              .ilike('email', email)
              .in('status', ['active', 'trial'])
          }
        }
      }

      return NextResponse.json({
        parsed_total: rows.length,
        cancelled: upserted,
        members_updated_to_cancelled: upserted,
        skipped,
        errors,
      })
    }

    // ── GHL: cancellations only ────────────────────────────────────────────

    const CANCEL_STATUSES = new Set(['canceled', 'cancelled', 'incomplete_expired'])

    // Count raw statuses for debug
    const statusCounts: Record<string, number> = {}
    for (const row of rows) {
      const raw = getCol(row, 'Status').toLowerCase()
      statusCounts[raw || '(empty)'] = (statusCounts[raw || '(empty)'] || 0) + 1
    }
    console.log('[SPC Import GHL] Raw status counts:', statusCounts)

    // Only pick cancelled rows, skip everything else
    const cancelRows: Record<string, unknown>[] = []

    for (const row of rows) {
      const rawStatus = getCol(row, 'Status').toLowerCase()
      if (!CANCEL_STATUSES.has(rawStatus)) continue

      const email    = (getCol(row, 'Customer email') || '').toLowerCase().trim() || null
      const name     = getCol(row, 'Customer name') || null
      const amount   = parseAmount(getCol(row, 'Total amount'))
      const lineItem = getCol(row, 'Line item name')
      const isPaid   = amount > 0

      cancelRows.push({
        subscription_id: getCol(row, 'Subscription id') || null,
        name,
        email,
        customer_phone: getCol(row, 'Customer phone') || null,
        amount,
        currency:       'USD',
        interval:       lineItem || null,
        plan:           deriveIntervalFromName(lineItem),
        cancel_type:    isPaid ? 'paid_cancel' : 'trial_cancel',
        paid_cancel:    isPaid,
        trial_cancel:   !isPaid,
        cancelled_at:   getCol(row, 'Cancelled at') || null,
        offer_title:    lineItem || null,
        provider:       getCol(row, 'Payment provider') || 'GHL',
        subscribed_at:  getCol(row, 'Subscription start') || null,
        source:         'ghl',
      })
    }

    console.log(`[SPC Import GHL] Found ${cancelRows.length} cancelled rows out of ${rows.length} total`)

    let cancellationsUpserted = 0
    let membersUpdatedToCancelled = 0
    let skippedAlreadyCancelled = 0

    for (const cancel of cancelRows) {
      const email = cancel.email as string | null

      // Upsert into spc_cancellations by email
      if (!email) {
        const { error } = await supabaseAdmin.from('spc_cancellations').insert(cancel)
        if (error) {
          errors.push(`Cancel insert failed (no email): ${error.message}`)
        } else {
          cancellationsUpserted++
        }
        continue
      }

      const { data: existing } = await supabaseAdmin
        .from('spc_cancellations')
        .select('id')
        .eq('email', email)
        .maybeSingle()

      if (existing) {
        const { error } = await supabaseAdmin
          .from('spc_cancellations')
          .update(cancel)
          .eq('id', existing.id)
        if (error) {
          errors.push(`Cancel update failed for ${email}: ${error.message}`)
        } else {
          cancellationsUpserted++
        }
      } else {
        const { error } = await supabaseAdmin.from('spc_cancellations').insert(cancel)
        if (error) {
          errors.push(`Cancel insert failed for ${email}: ${error.message}`)
        } else {
          cancellationsUpserted++
        }
      }

      // Update spc_members if they exist and are not already cancelled
      const { data: member } = await supabaseAdmin
        .from('spc_members')
        .select('id, status')
        .ilike('email', email)
        .limit(1)
        .maybeSingle()

      if (member) {
        if (member.status === 'cancelled') {
          skippedAlreadyCancelled++
        } else {
          const { error: mErr } = await supabaseAdmin
            .from('spc_members')
            .update({ status: 'cancelled' })
            .eq('id', member.id)
          if (mErr) {
            errors.push(`Failed to cancel member ${email}: ${mErr.message}`)
          } else {
            membersUpdatedToCancelled++
            console.log(`[SPC Import GHL] Cancelled member: ${email} (was ${member.status})`)
          }
        }
      }
    }

    const result = {
      total_rows:                  rows.length,
      cancelled_rows_found:        cancelRows.length,
      cancellations_upserted:      cancellationsUpserted,
      members_updated_to_cancelled: membersUpdatedToCancelled,
      skipped_already_cancelled:   skippedAlreadyCancelled,
      status_counts:               statusCounts,
      errors,
    }

    console.log('[SPC Import GHL] Final result:', JSON.stringify(result, null, 2))
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[SPC Import] Unhandled error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
