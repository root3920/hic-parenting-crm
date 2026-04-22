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

    // ── GHL: unified status handler ──────────────────────────────────────────

    // Step 1: Count raw statuses for debug
    const statusCounts: Record<string, number> = {}
    for (const row of rows) {
      const raw = getCol(row, 'Status').toLowerCase()
      statusCounts[raw || '(empty)'] = (statusCounts[raw || '(empty)'] || 0) + 1
    }
    console.log('[SPC Import GHL] Raw status counts:', statusCounts)

    // Step 2: Bucket rows
    const cancelRows: Record<string, unknown>[] = []
    const memberRows: { email: string; name: string | null; amount: number; status: string; plan: 'monthly' | 'annual'; provider: string; joined_at: string | null }[] = []
    let skippedCount = 0

    for (const row of rows) {
      const rawStatus = getCol(row, 'Status').toLowerCase()
      const mappedStatus = GHL_STATUS_MAP[rawStatus]

      if (!mappedStatus) {
        skippedCount++
        if (rawStatus) errors.push(`Unknown status "${rawStatus}" for ${getCol(row, 'Customer email') || 'unknown'}`)
        continue
      }

      const email     = getCol(row, 'Customer email').toLowerCase() || null
      const name      = getCol(row, 'Customer name') || null
      const amount    = parseAmount(getCol(row, 'Total amount'))
      const lineItem  = getCol(row, 'Line item name')
      const plan      = deriveIntervalFromName(lineItem)
      const provider  = getCol(row, 'Payment provider') || 'GHL'
      const joinedAt  = getCol(row, 'Subscription start') || null

      if (mappedStatus === 'cancelled') {
        const subId = getCol(row, 'Subscription id')
        if (!subId) {
          errors.push(`Cancelled row skipped (no subscription ID): ${email ?? 'unknown'}`)
          continue
        }

        const isPaidCancel = amount > 0
        cancelRows.push({
          subscription_id: subId,
          name,
          email,
          customer_phone:  getCol(row, 'Customer phone') || null,
          amount,
          currency:        getCol(row, 'Currency') || 'USD',
          interval:        lineItem || null,
          plan,
          cancel_type:     isPaidCancel ? 'paid_cancel' : 'trial_cancel',
          paid_cancel:     isPaidCancel,
          trial_cancel:    !isPaidCancel,
          cancelled_at:    getCol(row, 'Cancelled at') || null,
          offer_title:     lineItem || null,
          provider,
          subscribed_at:   joinedAt,
          source:          'ghl',
        })
      } else {
        if (!email) {
          errors.push(`Member row skipped (no email): ${name ?? 'unknown'}`)
          continue
        }
        memberRows.push({ email, name, amount, status: mappedStatus, plan, provider, joined_at: joinedAt })
      }
    }

    console.log(`[SPC Import GHL] Bucketed: ${cancelRows.length} cancels, ${memberRows.length} members, ${skippedCount} skipped`)
    if (cancelRows.length > 0) {
      console.log('[SPC Import GHL] First 3 cancel emails:', cancelRows.slice(0, 3).map(r => r.email))
    }

    // ── Step 3: Process cancellations ────────────────────────────────────────
    let cancellationsInserted = 0
    let membersUpdatedToCancelled = 0

    if (cancelRows.length > 0) {
      // Upsert by email — updates existing record if same email, inserts otherwise
      for (const cancel of cancelRows) {
        const email = cancel.email as string | null

        if (!email) {
          const { error } = await supabaseAdmin.from('spc_cancellations').insert(cancel)
          if (error) {
            errors.push(`Cancel insert failed (no email): ${error.message}`)
          } else {
            cancellationsInserted++
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
            cancellationsInserted++
            console.log(`[SPC Import GHL] Updated existing cancel: ${email}`)
          }
          continue
        }

        const { error } = await supabaseAdmin.from('spc_cancellations').insert(cancel)
        if (error) {
          errors.push(`Cancel insert failed for ${email}: ${error.message}`)
          console.log(`[SPC Import GHL] Cancel insert FAILED for ${email}: ${error.message}`)
        } else {
          cancellationsInserted++

          // Only update spc_members for genuinely new cancellations
          const { data: member } = await supabaseAdmin
            .from('spc_members')
            .select('id, email, status')
            .ilike('email', email)
            .in('status', ['active', 'trial'])
            .limit(1)
            .maybeSingle()

          if (member) {
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

      console.log(`[SPC Import GHL] Upserted ${cancellationsInserted} cancellations`)
    }

    // ── Step 4: Process trial / active members ──────────────────────────────
    let membersUpdatedToTrial = 0
    let membersUpdatedToActive = 0
    let newMembersInserted = 0

    if (memberRows.length > 0) {
      for (const row of memberRows) {
        const { data: existing } = await supabaseAdmin
          .from('spc_members')
          .select('id, email, status')
          .ilike('email', row.email)
          .limit(1)
          .maybeSingle()

        if (existing) {
          // Never overwrite a cancelled status
          if (existing.status === 'cancelled') {
            console.log(`[SPC Import GHL] Skipping ${row.email} — already cancelled`)
            continue
          }

          if (existing.status !== row.status) {
            const { error } = await supabaseAdmin
              .from('spc_members')
              .update({ status: row.status })
              .eq('id', existing.id)

            if (error) {
              errors.push(`Failed to update ${row.email}: ${error.message}`)
            } else {
              if (row.status === 'trial') membersUpdatedToTrial++
              else membersUpdatedToActive++
              console.log(`[SPC Import GHL] Updated ${row.email}: ${existing.status} → ${row.status}`)
            }
          }
        } else {
          const { error } = await supabaseAdmin.from('spc_members').insert({
            name:      row.name || 'Unknown',
            email:     row.email,
            amount:    row.amount,
            plan:      row.plan,
            provider:  row.provider,
            joined_at: row.joined_at || new Date().toISOString().split('T')[0],
            status:    row.status,
          })

          if (error) {
            errors.push(`Failed to insert ${row.email}: ${error.message}`)
          } else {
            newMembersInserted++
            console.log(`[SPC Import GHL] Inserted new member: ${row.email} (${row.status})`)
          }
        }
      }
    }

    const result = {
      parsed_total:                rows.length,
      status_counts:               statusCounts,
      cancellations_inserted:      cancellationsInserted,
      members_updated_to_cancelled: membersUpdatedToCancelled,
      members_updated_to_trial:    membersUpdatedToTrial,
      members_updated_to_active:   membersUpdatedToActive,
      new_members_inserted:        newMembersInserted,
      skipped:                     skippedCount,
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
