import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  // Strip BOM (common in GHL exports)
  const cleaned = text.replace(/^\uFEFF/, '')
  const lines = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
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
      console.log('[SPC Import] Total rows:', rows.length, '| Source:', source, '| Mode:', mode)
    }

    // ── MODE: members (Kajabi active import) ──────────────────────────────────
    if (mode === 'members') {
      const records: Record<string, unknown>[] = []

      for (const row of rows) {
        if (source === 'kajabi') {
          const status = row['Status']?.trim()
          if (status !== 'active' && status !== 'Pending Cancellation') continue
          records.push({
            name:      row['Customer Name']?.trim() || null,
            email:     (row['Customer Email']?.trim() || '').toLowerCase() || null,
            amount:    parseAmount(row['Amount'] ?? '0'),
            plan:      mapInterval(row['Interval'] ?? ''),
            provider:  row['Provider']?.trim() || 'Kajabi',
            joined_at: row['Created At']?.trim() || null,
            status:    'active',
          })
        } else {
          const rawStatus = (row['Status'] ?? '').trim().toLowerCase()
          const mappedStatus = GHL_STATUS_MAP[rawStatus]
          if (!mappedStatus || mappedStatus === 'cancelled') continue
          records.push({
            name:      row['Customer name']?.trim() || null,
            email:     (row['Customer email']?.trim() || '').toLowerCase() || null,
            amount:    parseAmount(row['Total amount'] ?? '0'),
            plan:      deriveIntervalFromName(row['Line item name'] ?? ''),
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
          email:           (row['Customer Email']?.trim() || '').toLowerCase() || null,
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
        return NextResponse.json({ parsed_total: rows.length, cancelled: 0, skipped: 0, errors })
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
          for (const email of cancelledEmails) {
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
        cancelled: newRecords.length,
        members_updated_to_cancelled: newRecords.length,
        skipped,
        errors,
      })
    }

    // ── GHL: unified status handler ──────────────────────────────────────────

    // Step 1: Count raw statuses for debug
    const statusCounts: Record<string, number> = {}
    for (const row of rows) {
      const raw = (row['Status'] ?? '').trim().toLowerCase()
      statusCounts[raw] = (statusCounts[raw] || 0) + 1
    }
    console.log('[SPC Import GHL] Raw status counts:', statusCounts)

    // Step 2: Bucket rows
    const cancelRows: Record<string, unknown>[] = []
    const memberRows: { email: string; name: string | null; amount: number; status: string; plan: 'monthly' | 'annual'; provider: string; joined_at: string | null }[] = []
    let skippedCount = 0

    for (const row of rows) {
      const rawStatus = (row['Status'] ?? '').trim().toLowerCase()
      const mappedStatus = GHL_STATUS_MAP[rawStatus]

      if (!mappedStatus) {
        skippedCount++
        errors.push(`Unknown status "${rawStatus}" for ${row['Customer email'] ?? 'unknown'}`)
        continue
      }

      const email     = (row['Customer email']?.trim() || '').toLowerCase() || null
      const name      = row['Customer name']?.trim() || null
      const amount    = parseAmount(row['Total amount'] ?? '0')
      const lineItem  = row['Line item name']?.trim() || ''
      const plan      = deriveIntervalFromName(lineItem)
      const provider  = row['Payment provider']?.trim() || 'GHL'
      const joinedAt  = row['Subscription start']?.trim() || null

      if (mappedStatus === 'cancelled') {
        const subId = row['Subscription id']?.trim()
        if (!subId) {
          errors.push(`Cancelled row skipped (no subscription ID): ${email ?? 'unknown'}`)
          continue
        }

        const isPaidCancel = amount > 0
        cancelRows.push({
          subscription_id: subId,
          name,
          email,
          customer_phone:  row['Customer phone']?.trim() || null,
          amount,
          currency:        row['Currency']?.trim() || 'USD',
          interval:        lineItem || null,
          plan,
          cancel_type:     isPaidCancel ? 'paid_cancel' : 'trial_cancel',
          paid_cancel:     isPaidCancel,
          trial_cancel:    !isPaidCancel,
          cancelled_at:    row['Cancelled at']?.trim() || null,
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
      // Dedup against existing cancellations
      const subIds = cancelRows.map(r => r.subscription_id as string)
      // Supabase .in() has a limit of ~100 values, batch if needed
      const existingIds = new Set<string>()
      for (let i = 0; i < subIds.length; i += 100) {
        const batch = subIds.slice(i, i + 100)
        const { data } = await supabaseAdmin
          .from('spc_cancellations')
          .select('subscription_id')
          .in('subscription_id', batch)
        for (const row of data ?? []) existingIds.add((row as { subscription_id: string }).subscription_id)
      }

      const newCancels = cancelRows.filter(r => !existingIds.has(r.subscription_id as string))
      const dupeCancels = cancelRows.length - newCancels.length
      if (dupeCancels > 0) {
        console.log(`[SPC Import GHL] ${dupeCancels} cancellations already exist, skipping`)
        skippedCount += dupeCancels
      }

      // Insert new cancellations one-by-one to avoid partial batch failures
      for (const cancel of newCancels) {
        const { error } = await supabaseAdmin.from('spc_cancellations').insert(cancel)
        if (error) {
          errors.push(`Cancel insert failed for ${cancel.email}: ${error.message}`)
        } else {
          cancellationsInserted++
        }
      }

      console.log(`[SPC Import GHL] Inserted ${cancellationsInserted} cancellations`)

      // Update spc_members status → cancelled for these emails
      const cancelEmails = newCancels
        .map(r => (r.email as string | null))
        .filter((e): e is string => !!e)

      for (const email of cancelEmails) {
        const { data: member } = await supabaseAdmin
          .from('spc_members')
          .select('id, email, status')
          .ilike('email', email)
          .in('status', ['active', 'trial'])
          .limit(1)
          .maybeSingle()

        if (member) {
          const { error } = await supabaseAdmin
            .from('spc_members')
            .update({ status: 'cancelled' })
            .eq('id', member.id)

          if (error) {
            errors.push(`Failed to cancel member ${email}: ${error.message}`)
          } else {
            membersUpdatedToCancelled++
            console.log(`[SPC Import GHL] Cancelled member: ${email} (was ${member.status})`)
          }
        }
      }
    }

    // ── Step 4: Process trial / active members ──────────────────────────────
    let membersUpdatedToTrial = 0
    let membersUpdatedToActive = 0
    let newMembersInserted = 0

    if (memberRows.length > 0) {
      for (const row of memberRows) {
        // Case-insensitive lookup
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

          // Only update if status actually changes
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
          // Insert new member
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
