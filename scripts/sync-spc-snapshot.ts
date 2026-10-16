/**
 * SPC Members Snapshot Sync — 2026-10-15
 *
 * Usage:
 *   npx tsx scripts/sync-spc-snapshot.ts           # dry-run (default)
 *   npx tsx scripts/sync-spc-snapshot.ts --apply    # execute writes
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { readFileSync } from 'fs'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ─── Config ──────────────────────────────────────────────────────────────────

const CSV_PATH = 'data/spc_members_snapshot_2026-10-15.csv'
const EXPECTED_COLUMNS = 19

const EMAIL_CORRECTIONS: Record<string, string> = {
  'chrisvalenc@yahoo.comx': 'chrisvalenc@yahoo.com',
  'natalycardenasgrau08@gmail.cm': 'natalycardenasgrau08@gmail.com',
}

const SKIP_EMAILS = new Set(['theile.nycole@gmail.com'])

const EXCLUDED_EMAILS = new Set(['highimpactclub@gmail.com'])
const EXCLUDED_DOMAINS = ['@hicparenting.com']
const EXCLUDED_NAMES = new Set(['high impact llc'])

// ─── Types ───────────────────────────────────────────────────────────────────

interface CsvRow {
  email: string
  full_name: string
  phone: string
  source_platform: string
  payment_provider: string
  plan: string
  real_status: string
  platform_status: string
  joined_at: string
  trial_end: string
  last_payment_at: string
  payments_count: string
  months_unpaid: string
  next_charge_at: string
  cancelled_at: string
  external_subscription_id: string
  note: string
  all_subscriptions: string
  amount: string
}

interface DbMember {
  id: string
  email: string
  name: string
  status: string
  plan: string
  amount: number
  provider: string
  joined_at: string | null
  next_payment_date: string | null
  trial_end_date: string | null
  payment_issue: boolean | null
  months_unpaid: number | null
}

type Action =
  | { type: 'update_member'; email: string; name: string; dbStatus: string; newStatus: string; fields: Record<string, unknown>; reason: string }
  | { type: 'insert_member'; email: string; name: string; fields: Record<string, unknown>; reason: string }
  | { type: 'insert_cancellation'; email: string; name: string; fields: Record<string, unknown>; reason: string }

// ─── CSV Parser ──────────────────────────────────────────────────────────────

function parseCSV(text: string): CsvRow[] {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)

  const records: { fields: string[]; line: number }[] = []
  let fields: string[] = []
  let field = ''
  let inQ = false
  let lineNum = 1

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      if (inQ && text[i + 1] === '"') { field += '"'; i++ }
      else inQ = !inQ
    } else if (ch === ',' && !inQ) {
      fields.push(field); field = ''
    } else if ((ch === '\n' || ch === '\r') && !inQ) {
      fields.push(field)
      if (fields.length > 1 || fields[0] !== '') records.push({ fields, line: lineNum })
      fields = []; field = ''; lineNum++
      if (ch === '\r' && text[i + 1] === '\n') i++
    } else {
      field += ch
    }
  }
  fields.push(field)
  if (fields.length > 1 || fields[0] !== '') records.push({ fields, line: lineNum })

  if (records.length === 0) throw new Error('Empty CSV')
  const header = records[0].fields.map(h => h.trim())
  if (header.length !== EXPECTED_COLUMNS) {
    throw new Error(`Header has ${header.length} columns, expected ${EXPECTED_COLUMNS}: ${header.join(', ')}`)
  }

  const rows: CsvRow[] = []
  for (let i = 1; i < records.length; i++) {
    const { fields: vals, line } = records[i]
    if (vals.length !== EXPECTED_COLUMNS) {
      console.warn(`  WARN line ${line}: ${vals.length} columns (expected ${EXPECTED_COLUMNS}), skipping`)
      continue
    }
    const obj: Record<string, string> = {}
    header.forEach((h, idx) => { obj[h] = (vals[idx] || '').trim() })
    rows.push(obj as unknown as CsvRow)
  }
  return rows
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isExcluded(email: string, name: string): string | null {
  if (!email) return 'no_email'
  if (EXCLUDED_EMAILS.has(email)) return 'excluded_email'
  if (EXCLUDED_DOMAINS.some(d => email.endsWith(d))) return 'excluded_domain'
  if (EXCLUDED_NAMES.has(name.toLowerCase().trim())) return 'excluded_name'
  return null
}

function mapProvider(csvProvider: string): string {
  const p = csvProvider.toLowerCase().trim()
  if (p === 'stripe') return 'Stripe'
  if (p === 'paypal') return 'PayPal'
  if (p === 'hotmart') return 'Hotmart'
  if (p === 'kajabi') return 'Kajabi'
  return csvProvider || 'Stripe'
}

function mapPlan(csvPlan: string): string {
  const p = csvPlan.toLowerCase().trim()
  if (p === 'annual') return 'annual'
  if (p === 'monthly') return 'monthly'
  if (p === 'mid_ticket') return 'mid_ticket'
  return 'monthly'
}

function parseAmount(s: string): number {
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

function dateOrNull(s: string): string | null {
  if (!s || s === 'NaN' || s.length < 10) return null
  return s.slice(0, 10)
}

// ─── Build Actions ───────────────────────────────────────────────────────────

function buildActions(
  rows: CsvRow[],
  dbByEmail: Record<string, DbMember>,
  cancelsByEmail: Record<string, { email: string; cancelled_at: string }[]>,
): { actions: Action[]; reports: string[] } {
  const actions: Action[] = []
  const reports: string[] = []

  for (const r of rows) {
    let email = r.email.toLowerCase().trim()
    const corrected = EMAIL_CORRECTIONS[email]
    if (corrected) { email = corrected }

    const name = r.full_name.trim()
    const exclusion = isExcluded(email, name)
    if (exclusion) {
      reports.push(`EXCLUDED: ${email} — ${name} — ${exclusion}`)
      continue
    }
    if (SKIP_EMAILS.has(email)) {
      reports.push(`SKIPPED: ${email} — ${name} — alias (no changes)`)
      continue
    }

    const db = dbByEmail[email]
    const rs = r.real_status
    const provider = mapProvider(r.payment_provider)
    const plan = mapPlan(r.plan)
    const amount = parseAmount(r.amount)
    const joinedAt = dateOrNull(r.joined_at)
    const trialEnd = dateOrNull(r.trial_end)
    const nextCharge = dateOrNull(r.next_charge_at)
    const monthsUnpaid = parseFloat(r.months_unpaid) || 0

    if (rs === 'active') {
      if (db) {
        const fields: Record<string, unknown> = {
          status: 'active',
          plan,
          provider,
          payment_issue: false,
          months_unpaid: 0,
        }
        if (amount > 0 && (db.amount === 0 || db.amount === null)) fields.amount = amount
        if (joinedAt && !db.joined_at) fields.joined_at = joinedAt
        if (nextCharge) fields.next_payment_date = nextCharge
        if (trialEnd) fields.trial_end_date = trialEnd

        const reason = db.status === 'active' ? 'update active' : `reactivate (${db.status} → active)`
        actions.push({ type: 'update_member', email, name, dbStatus: db.status, newStatus: 'active', fields, reason })
      }
      // Not in DB and not a corrected email match → skip (don't insert new active)

    } else if (rs === 'trial') {
      if (db) {
        const fields: Record<string, unknown> = {
          status: 'trial',
          plan,
          provider,
          payment_issue: false,
          months_unpaid: 0,
        }
        if (amount > 0 && (db.amount === 0 || db.amount === null)) fields.amount = amount
        if (trialEnd) fields.trial_end_date = trialEnd
        if (nextCharge) fields.next_payment_date = nextCharge
        if (joinedAt && !db.joined_at) fields.joined_at = joinedAt

        actions.push({ type: 'update_member', email, name, dbStatus: db.status, newStatus: 'trial', fields, reason: 'update trial' })
      }

    } else if (rs === 'payment_issue') {
      if (db) {
        // Reactivate to active if currently cancelled, otherwise keep active
        const newStatus = (db.status === 'cancelled' || db.status === 'expired') ? 'active' : db.status
        const fields: Record<string, unknown> = {
          status: newStatus,
          payment_issue: true,
          months_unpaid: Math.round(monthsUnpaid),
          plan,
          provider,
        }
        if (amount > 0 && (db.amount === 0 || db.amount === null)) fields.amount = amount
        if (nextCharge) fields.next_payment_date = nextCharge

        const reason = db.status !== newStatus
          ? `reactivate + payment_issue (${db.status} → ${newStatus})`
          : `flag payment_issue (stays ${newStatus})`
        actions.push({ type: 'update_member', email, name, dbStatus: db.status, newStatus, fields, reason })
      }

    } else if (rs === 'should_cancel') {
      // REPORT ONLY — no DB changes per user decision
      const inDb = db ? `${db.status} (${db.provider})` : 'NOT IN DB'
      reports.push(`SHOULD_CANCEL: ${email} — ${name} — provider: ${r.payment_provider} — months_unpaid: ${r.months_unpaid} — platform: ${r.platform_status} — DB: ${inDb}`)

    } else if (rs === 'paused') {
      if (db) {
        if (db.status !== 'paused') {
          const fields: Record<string, unknown> = {
            status: 'paused',
            plan,
            provider,
            payment_issue: false,
            months_unpaid: 0,
          }
          if (amount > 0 && (db.amount === 0 || db.amount === null)) fields.amount = amount
          actions.push({ type: 'update_member', email, name, dbStatus: db.status, newStatus: 'paused', fields, reason: `${db.status} → paused` })
        }
      } else {
        // New insert
        const fields: Record<string, unknown> = {
          email,
          name,
          status: 'paused',
          plan,
          amount: amount || 0,
          provider,
          joined_at: joinedAt || new Date().toISOString().slice(0, 10),
          next_payment_date: nextCharge || joinedAt || new Date().toISOString().slice(0, 10),
          payment_issue: false,
          months_unpaid: 0,
        }
        if (trialEnd) fields.trial_end_date = trialEnd
        actions.push({ type: 'insert_member', email, name, fields, reason: 'new paused member' })
      }

    } else if (rs === 'cancelled') {
      // Update status only if exists and not already cancelled
      if (db && db.status !== 'cancelled') {
        actions.push({
          type: 'update_member',
          email, name,
          dbStatus: db.status,
          newStatus: 'cancelled',
          fields: { status: 'cancelled', payment_issue: false, months_unpaid: 0 },
          reason: `${db.status} → cancelled`,
        })
      }

      // Insert spc_cancellations if cancelled_at in 2026 and not already there
      if (r.cancelled_at && r.cancelled_at.startsWith('2026')) {
        const existing = cancelsByEmail[email]
        if (!existing || existing.length === 0) {
          // Determine cancel flags
          const wasTrial = db?.status === 'trial' || (db?.amount === 0 && db?.status !== 'active')
          const wasPaid = !wasTrial

          actions.push({
            type: 'insert_cancellation',
            email, name,
            fields: {
              name,
              email,
              cancelled_at: new Date(r.cancelled_at + 'T12:00:00Z').toISOString(),
              paid_cancel: wasPaid,
              trial_cancel: wasTrial,
              cancel_type: wasTrial ? 'trial_cancel' : 'requested',
              provider: mapProvider(r.payment_provider),
              source: r.source_platform || null,
            },
            reason: `missing cancellation record (${r.cancelled_at})`,
          })
        }
      }

    } else if (rs === 'incomplete') {
      // Do nothing
    }
  }

  return { actions, reports }
}

// ─── Execute ─────────────────────────────────────────────────────────────────

async function execute(supabase: SupabaseClient, actions: Action[], dryRun: boolean) {
  const stats = {
    members_updated: 0,
    members_inserted: 0,
    cancellations_inserted: 0,
    errors: [] as string[],
  }

  for (const action of actions) {
    if (action.type === 'update_member') {
      if (dryRun) {
        stats.members_updated++
        continue
      }
      const { data, error } = await supabase
        .from('spc_members')
        .update(action.fields)
        .eq('email', action.email)
        .select('id')
      if (error) {
        const msg = `UPDATE ${action.email}: ${error.code} — ${error.message} — ${error.details}`
        console.error(`  ERROR: ${msg}`)
        stats.errors.push(msg)
      } else if (!data || data.length === 0) {
        const msg = `UPDATE ${action.email}: 0 rows affected (email not found?)`
        console.error(`  ERROR: ${msg}`)
        stats.errors.push(msg)
      } else {
        stats.members_updated++
      }

    } else if (action.type === 'insert_member') {
      if (dryRun) {
        stats.members_inserted++
        continue
      }
      const { data, error } = await supabase
        .from('spc_members')
        .insert(action.fields)
        .select('id')
      if (error) {
        if (error.code === '23505') {
          // Duplicate — try update instead
          const { error: upErr } = await supabase
            .from('spc_members')
            .update(action.fields)
            .eq('email', action.email)
          if (upErr) {
            const msg = `INSERT→UPDATE ${action.email}: ${upErr.code} — ${upErr.message}`
            console.error(`  ERROR: ${msg}`)
            stats.errors.push(msg)
          } else {
            stats.members_updated++
          }
        } else {
          const msg = `INSERT ${action.email}: ${error.code} — ${error.message} — ${error.details}`
          console.error(`  ERROR: ${msg}`)
          stats.errors.push(msg)
        }
      } else {
        stats.members_inserted++
      }

    } else if (action.type === 'insert_cancellation') {
      if (dryRun) {
        stats.cancellations_inserted++
        continue
      }
      const { data, error } = await supabase
        .from('spc_cancellations')
        .insert(action.fields)
        .select('id')
      if (error) {
        const msg = `CANCEL INSERT ${action.email}: ${error.code} — ${error.message} — ${error.details}`
        console.error(`  ERROR: ${msg}`)
        stats.errors.push(msg)
      } else {
        stats.cancellations_inserted++
      }
    }
  }

  return stats
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Validate env
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    console.error('Run with: npx tsx --env-file=.env.local scripts/sync-spc-snapshot.ts')
    process.exit(1)
  }

  const dryRun = !process.argv.includes('--apply')
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  SPC Snapshot Sync — ${dryRun ? 'DRY RUN' : '🔴 APPLYING CHANGES'}`)
  console.log(`${'='.repeat(60)}\n`)

  // 1. Parse CSV
  const raw = readFileSync(CSV_PATH, 'utf-8')
  const rows = parseCSV(raw)
  console.log(`CSV: ${rows.length} data rows parsed (${EXPECTED_COLUMNS} columns each)`)

  // 2. Connect to Supabase
  const supabase = createClient(url, key)

  // 3. Fetch current DB state
  // Try with new columns first, fall back to without them (pre-migration)
  let dbMembers: DbMember[] | null = null
  let mErr: { message: string } | null = null
  const selectFull = 'id, email, name, status, plan, amount, provider, joined_at, next_payment_date, trial_end_date, payment_issue, months_unpaid'
  const selectLegacy = 'id, email, name, status, plan, amount, provider, joined_at, next_payment_date, trial_end_date'

  const res1 = await supabase.from('spc_members').select(selectFull)
  if (res1.error && res1.error.message.includes('payment_issue')) {
    console.log('  (payment_issue column not found — using legacy select. Run migration 045 first for --apply)')
    const res2 = await supabase.from('spc_members').select(selectLegacy)
    dbMembers = (res2.data ?? []) as unknown as DbMember[]
    mErr = res2.error
  } else {
    dbMembers = (res1.data ?? []) as unknown as DbMember[]
    mErr = res1.error
  }
  if (mErr) { console.error('DB fetch error:', mErr.message); process.exit(1) }

  const { data: dbCancels, error: cErr } = await supabase
    .from('spc_cancellations')
    .select('email, cancelled_at')
  if (cErr) { console.error('DB cancellations fetch error:', cErr.message); process.exit(1) }

  console.log(`DB: ${dbMembers!.length} members, ${dbCancels!.length} cancellations\n`)

  const dbByEmail: Record<string, DbMember> = {}
  for (const m of dbMembers!) {
    dbByEmail[(m.email as string).toLowerCase().trim()] = m
  }

  const cancelsByEmail: Record<string, { email: string; cancelled_at: string }[]> = {}
  for (const c of dbCancels!) {
    const e = (c.email || '').toLowerCase().trim()
    if (!cancelsByEmail[e]) cancelsByEmail[e] = []
    cancelsByEmail[e].push(c)
  }

  // 4. Build action plan
  const { actions, reports } = buildActions(rows, dbByEmail, cancelsByEmail)

  // 5. Print action plan
  console.log(`── REPORTS (${reports.length}) ──`)
  const excludedReports = reports.filter(r => r.startsWith('EXCLUDED'))
  const skippedReports = reports.filter(r => r.startsWith('SKIPPED'))
  const shouldCancelReports = reports.filter(r => r.startsWith('SHOULD_CANCEL'))
  console.log(`  Excluded: ${excludedReports.length}`)
  for (const r of excludedReports) console.log(`    ${r}`)
  console.log(`  Skipped: ${skippedReports.length}`)
  for (const r of skippedReports) console.log(`    ${r}`)
  console.log(`  Should-cancel (report only): ${shouldCancelReports.length}`)
  for (const r of shouldCancelReports) console.log(`    ${r}`)

  // Group actions by type
  const updates = actions.filter(a => a.type === 'update_member') as Extract<Action, { type: 'update_member' }>[]
  const inserts = actions.filter(a => a.type === 'insert_member') as Extract<Action, { type: 'insert_member' }>[]
  const cancelIns = actions.filter(a => a.type === 'insert_cancellation') as Extract<Action, { type: 'insert_cancellation' }>[]

  console.log(`\n── MEMBER UPDATES (${updates.length}) ──`)

  // Group updates by transition
  const byTransition: Record<string, typeof updates> = {}
  for (const u of updates) {
    const key = `${u.dbStatus} → ${u.newStatus}${u.fields.payment_issue ? ' (payment_issue)' : ''}`
    if (!byTransition[key]) byTransition[key] = []
    byTransition[key].push(u)
  }
  for (const [transition, items] of Object.entries(byTransition).sort()) {
    console.log(`\n  ${transition} (${items.length}):`)
    for (const u of items) {
      console.log(`    ${u.email.padEnd(45)} ${u.name.padEnd(30)} ${u.reason}`)
    }
  }

  console.log(`\n── NEW MEMBER INSERTS (${inserts.length}) ──`)
  for (const ins of inserts) {
    console.log(`  ${ins.email.padEnd(45)} ${ins.name.padEnd(30)} ${ins.reason}`)
  }

  console.log(`\n── CANCELLATION INSERTS (${cancelIns.length}) ──`)
  for (const ci of cancelIns) {
    console.log(`  ${ci.email.padEnd(45)} ${ci.name.padEnd(30)} cancelled_at: ${(ci.fields.cancelled_at as string).slice(0, 10)}`)
  }

  // 6. Summary
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`SUMMARY:`)
  console.log(`  Member updates:        ${updates.length}`)
  console.log(`  Member inserts:        ${inserts.length}`)
  console.log(`  Cancellation inserts:  ${cancelIns.length}`)
  console.log(`  Reports (no action):   ${reports.length}`)
  console.log(`${'─'.repeat(60)}`)

  if (dryRun) {
    console.log(`\n  ⚠️  DRY RUN — no changes written. Pass --apply to execute.\n`)
    return
  }

  // 7. Execute
  console.log(`\n  Executing ${actions.length} actions...\n`)
  const stats = await execute(supabase, actions, false)

  console.log(`\n${'='.repeat(60)}`)
  console.log(`RESULTS:`)
  console.log(`  Members updated:       ${stats.members_updated}`)
  console.log(`  Members inserted:      ${stats.members_inserted}`)
  console.log(`  Cancellations added:   ${stats.cancellations_inserted}`)
  console.log(`  Errors:                ${stats.errors.length}`)
  if (stats.errors.length > 0) {
    for (const e of stats.errors) console.log(`    ${e}`)
  }
  console.log(`${'='.repeat(60)}`)

  // 8. Verification query
  console.log(`\n── POST-SYNC VERIFICATION ──`)
  for (const status of ['active', 'trial', 'paused', 'expired', 'cancelled']) {
    const { count } = await supabase
      .from('spc_members')
      .select('*', { count: 'exact', head: true })
      .eq('status', status)
    console.log(`  ${status}: ${count}`)
  }
  const { count: piCount } = await supabase
    .from('spc_members')
    .select('*', { count: 'exact', head: true })
    .eq('payment_issue', true)
  console.log(`  payment_issue flagged: ${piCount}`)

  const { count: activeCount } = await supabase
    .from('spc_members')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')
  const { count: trialCount } = await supabase
    .from('spc_members')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'trial')
  console.log(`\n  Active + Trial = ${(activeCount ?? 0) + (trialCount ?? 0)}`)
}

main().catch(err => { console.error(err); process.exit(1) })
