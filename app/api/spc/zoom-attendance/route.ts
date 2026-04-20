import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { recalculateAllScores } from '../_scoring'

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

// ── Parse Zoom datetime: "4/16/2026 10:05:14 AM" → ISO string + date-only ──

function parseZoomDatetime(raw: string): { iso: string; date: string } | null {
  if (!raw?.trim()) return null
  const d = new Date(raw.trim())
  if (isNaN(d.getTime())) return null
  return {
    iso:  d.toISOString(),
    date: d.toISOString().slice(0, 10),
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { csv } = (await req.json()) as { csv: string }
    if (!csv) return NextResponse.json({ error: 'Missing csv' }, { status: 400 })

    const rows = parseCSV(csv)
    if (rows.length === 0) return NextResponse.json({ error: 'No rows found in CSV' }, { status: 400 })

    // Build records — skip empty emails and waiting-room-only guests
    let classDate: string | null = null
    const records: {
      member_email: string
      member_name: string
      class_date: string
      join_time: string
      duration_minutes: number
    }[] = []

    for (const row of rows) {
      const email = row['Email']?.trim().toLowerCase()
      if (!email) continue

      const isGuest = row['Guest']?.trim().toLowerCase() === 'yes'
      const duration = parseInt(row['Duration (minutes)'] ?? '0') || 0
      if (isGuest && duration < 5) continue

      const joinParsed = parseZoomDatetime(row['Join time'] ?? '')
      if (!joinParsed) continue

      if (!classDate) classDate = joinParsed.date

      records.push({
        member_email:     email,
        member_name:      row['Name (original name)']?.trim() || '',
        class_date:       joinParsed.date,
        join_time:        joinParsed.iso,
        duration_minutes: duration,
      })
    }

    if (!classDate || records.length === 0) {
      return NextResponse.json({ error: 'No valid attendance rows found' }, { status: 400 })
    }

    // Deduplicate by email — keep the row with the longest duration
    // (same person can appear multiple times if they rejoined the call)
    const dedupMap: Record<string, typeof records[0]> = {}
    for (const record of records) {
      const existing = dedupMap[record.member_email]
      if (!existing || record.duration_minutes > existing.duration_minutes) {
        dedupMap[record.member_email] = record
      }
    }
    const deduped = Object.values(dedupMap)

    console.log(`[zoom-attendance] ${records.length} rows → ${deduped.length} unique attendees for ${classDate}`)

    // Upsert deduplicated records
    const { error: upsertError } = await supabaseAdmin
      .from('spc_class_attendance')
      .upsert(deduped, { onConflict: 'member_email,class_date', ignoreDuplicates: false })

    if (upsertError) {
      console.error('[zoom-attendance] Upsert error:', upsertError.message)
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    // Check how many attendees are matched in spc_members
    const emails = deduped.map((r) => r.member_email)
    const { data: memberRows } = await supabaseAdmin
      .from('spc_members')
      .select('email')
      .in('email', emails)

    const memberEmailSet = new Set((memberRows ?? []).map((m: { email: string }) => m.email.toLowerCase()))
    const matched   = emails.filter((e) => memberEmailSet.has(e)).length
    const unmatched = emails.length - matched

    console.log(`[zoom-attendance] matched=${matched} unmatched=${unmatched} — recalculating scores inline`)

    // Recalculate scores inline — no HTTP fetch, directly calls shared logic
    const { processed: scoresUpdated } = await recalculateAllScores()

    return NextResponse.json({
      class_date:     classDate,
      total:          deduped.length,
      matched,
      unmatched,
      scores_updated: scoresUpdated,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[zoom-attendance] Unexpected error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
