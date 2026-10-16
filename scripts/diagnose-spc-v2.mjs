/**
 * Diagnostic v2: corrected rules, nominal lists, duplicate detection.
 * Run: node --env-file=.env.local scripts/diagnose-spc-v2.mjs
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Missing env vars'); process.exit(1) }
const supabase = createClient(url, key)

// ── Email corrections ────────────────────────────────────────────────────────
const EMAIL_CORRECTIONS = {
  'chrisvalenc@yahoo.comx': 'chrisvalenc@yahoo.com',
  'natalycardenasgrau08@gmail.cm': 'natalycardenasgrau08@gmail.com',
}

// ── CSV parser with 19-column assertion ──────────────────────────────────────
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
  const rows = []
  let fields = [], field = '', inQ = false, lineNum = 1

  function pushField() { fields.push(field); field = '' }
  function pushRow() {
    if (fields.length > 0 || field.length > 0) {
      pushField()
      rows.push({ fields, lineNum })
    }
    fields = []; lineNum++
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      if (inQ && text[i + 1] === '"') { field += '"'; i++ }
      else inQ = !inQ
    } else if (ch === ',' && !inQ) {
      pushField()
    } else if ((ch === '\n' || ch === '\r') && !inQ) {
      pushRow()
      if (ch === '\r' && text[i + 1] === '\n') i++
    } else {
      field += ch
    }
  }
  pushRow() // last line

  const header = rows[0].fields.map(h => h.trim())
  if (header.length !== 19) {
    console.error(`Header has ${header.length} columns, expected 19:`, header)
    process.exit(1)
  }

  const data = []
  for (let i = 1; i < rows.length; i++) {
    const { fields: vals, lineNum: ln } = rows[i]
    if (vals.length !== 19) {
      console.warn(`Line ${ln}: ${vals.length} cols (expected 19), skipping: ${vals.slice(0, 3).join(',')}`)
      continue
    }
    const obj = {}
    header.forEach((h, idx) => obj[h] = (vals[idx] || '').trim())
    data.push(obj)
  }
  return data
}

// ── Exclusions ───────────────────────────────────────────────────────────────
function isExcluded(row) {
  const email = (row.email || '').toLowerCase().trim()
  const name = (row.full_name || '').toLowerCase().trim()
  if (!email) return 'no_email'
  if (email.endsWith('@hicparenting.com')) return `hicparenting_email (${email})`
  if (email === 'highimpactclub@gmail.com') return 'highimpactclub_email'
  if (name === 'high impact llc') return 'test_account'
  return null
}

// ── Normalize for search ─────────────────────────────────────────────────────
function normName(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z ]/g, '').trim()
}
function digitsOnly(s) { return (s || '').replace(/\D/g, '') }

async function main() {
  // 1. Read & parse CSV
  const raw = readFileSync('data/spc_members_snapshot_2026-10-15.csv', 'utf-8')
  const allRows = parseCSV(raw)
  console.log(`CSV parsed: ${allRows.length} data rows (expected 702)`)

  // Apply exclusions
  const excluded = []
  const rows = []
  for (const r of allRows) {
    // Apply email corrections BEFORE exclusion check
    const corrected = EMAIL_CORRECTIONS[r.email.toLowerCase().trim()]
    if (corrected) {
      console.log(`  Email correction: ${r.email} → ${corrected}`)
      r.email = corrected
    }
    const reason = isExcluded(r)
    if (reason) { excluded.push({ email: r.email || '(none)', name: r.full_name, reason, rs: r.real_status }); continue }
    rows.push(r)
  }
  console.log(`\n── EXCLUDED (${excluded.length}) ──`)
  for (const e of excluded) console.log(`  ${e.email} — ${e.name} — ${e.reason} — ${e.rs}`)
  console.log(`\nCSV after exclusions: ${rows.length}`)

  // Theile alias skip
  const SKIP_EMAILS = new Set(['theile.nycole@gmail.com'])

  // Status counts
  const csvCounts = {}
  for (const r of rows) {
    if (SKIP_EMAILS.has(r.email.toLowerCase().trim())) continue
    csvCounts[r.real_status] = (csvCounts[r.real_status] || 0) + 1
  }
  console.log('\n── CSV real_status (after exclusions, skips) ──')
  for (const [s, c] of Object.entries(csvCounts).sort()) console.log(`  ${s}: ${c}`)
  console.log(`  active + trial = ${(csvCounts.active || 0) + (csvCounts.trial || 0)}`)

  // 2. Fetch DB
  const { data: dbMembers } = await supabase.from('spc_members').select('*')
  const { data: dbCancels } = await supabase.from('spc_cancellations').select('email, cancelled_at, cancel_type, provider')
  console.log(`\nDB: ${dbMembers.length} members, ${dbCancels.length} cancellations`)

  const dbByEmail = {}
  for (const m of dbMembers) dbByEmail[m.email.toLowerCase().trim()] = m

  const cancelsByEmail = {}
  for (const c of dbCancels) {
    const e = (c.email || '').toLowerCase().trim()
    if (!cancelsByEmail[e]) cancelsByEmail[e] = []
    cancelsByEmail[e].push(c)
  }

  // 3. Build change plan with CORRECTED RULES
  const changes = []  // { email, name, action, db_status, new_status, detail }
  const reports = []  // should_cancel and others just reported
  const newInserts = [] // paused not in DB
  const cancelInserts = [] // spc_cancellations to add

  for (const r of rows) {
    const email = r.email.toLowerCase().trim()
    if (SKIP_EMAILS.has(email)) {
      reports.push({ email, name: r.full_name, action: 'SKIP (Nycole alias)', rs: r.real_status })
      continue
    }
    const db = dbByEmail[email]
    const rs = r.real_status

    if (rs === 'active') {
      if (db && db.status !== 'active') {
        changes.push({ email, name: r.full_name, action: 'reactivate', db_status: db.status, new_status: 'active', csv: r })
      } else if (db && db.status === 'active') {
        changes.push({ email, name: r.full_name, action: 'update_active', db_status: 'active', new_status: 'active', csv: r })
      } else {
        // Not in DB — Christine corrected email matches DB; others skip
        if (db === undefined) {
          reports.push({ email, name: r.full_name, action: 'NOT_IN_DB (active, skip)', rs })
        }
      }
    } else if (rs === 'trial') {
      if (db) {
        changes.push({ email, name: r.full_name, action: db.status === 'trial' ? 'update_trial' : 'change_to_trial', db_status: db.status, new_status: 'trial', csv: r })
      }
    } else if (rs === 'payment_issue') {
      if (db) {
        const newStatus = db.status === 'cancelled' ? 'active' : db.status  // Julie Milne: cancelled -> active
        changes.push({ email, name: r.full_name, action: 'payment_issue', db_status: db.status, new_status: newStatus === 'cancelled' ? 'active' : (db.status === 'active' ? 'active' : db.status), csv: r })
      }
    } else if (rs === 'should_cancel') {
      // RULE: do NOT change status, do NOT insert cancellations. Just report.
      const provider = r.payment_provider
      const inDb = db ? `${db.status} (${db.provider})` : 'NOT IN DB'
      reports.push({ email, name: r.full_name, action: `REPORT should_cancel (${provider})`, rs, months_unpaid: r.months_unpaid, platform_status: r.platform_status, db: inDb })
    } else if (rs === 'paused') {
      if (db) {
        if (db.status !== 'paused') {
          changes.push({ email, name: r.full_name, action: 'change_to_paused', db_status: db.status, new_status: 'paused', csv: r })
        } else {
          changes.push({ email, name: r.full_name, action: 'update_paused', db_status: 'paused', new_status: 'paused', csv: r })
        }
      } else {
        newInserts.push({ email, name: r.full_name, csv: r })
      }
    } else if (rs === 'cancelled') {
      if (db && db.status !== 'cancelled') {
        changes.push({ email, name: r.full_name, action: 'change_to_cancelled', db_status: db.status, new_status: 'cancelled', csv: r })
      }
      // Check spc_cancellations
      if (r.cancelled_at && r.cancelled_at.startsWith('2026')) {
        const existing = cancelsByEmail[email]
        if (!existing || existing.length === 0) {
          cancelInserts.push({ email, name: r.full_name, cancelled_at: r.cancelled_at, csv: r })
        }
      }
    } else if (rs === 'incomplete') {
      // do nothing
    }
  }

  // ── SECTION A: Nominal list of 79 active ──
  console.log('\n' + '='.repeat(70))
  console.log('SECTION A: FINAL ACTIVE MEMBERS (projected)')
  console.log('='.repeat(70))

  // Compute final active: start with DB active, apply changes
  const finalActive = []
  // DB active that stay active
  for (const m of dbMembers) {
    if (m.status !== 'active') continue
    const email = m.email.toLowerCase().trim()
    const change = changes.find(c => c.email === email)
    if (!change) {
      // DB-only, no CSV match — stays active
      finalActive.push({ email, name: m.name, source: 'DB-only', provider: m.provider, plan: m.plan })
    } else if (change.new_status === 'active') {
      const src = change.action === 'payment_issue' ? 'CSV (payment_issue)' : 'CSV'
      finalActive.push({ email, name: m.name, source: src, provider: change.csv?.payment_provider || m.provider, plan: change.csv?.plan || m.plan })
    }
    // else: they're moving away from active
  }
  // Reactivations and payment_issue from non-active
  for (const c of changes) {
    if (c.new_status === 'active' && c.db_status !== 'active') {
      const src = c.action === 'payment_issue' ? 'Reactivation (payment_issue)' : 'Reactivation'
      finalActive.push({ email: c.email, name: c.name, source: src, provider: c.csv?.payment_provider, plan: c.csv?.plan })
    }
  }

  finalActive.sort((a, b) => a.name.localeCompare(b.name))
  let piCount = 0
  for (let i = 0; i < finalActive.length; i++) {
    const a = finalActive[i]
    const isPi = a.source.includes('payment_issue')
    if (isPi) piCount++
    console.log(`  ${String(i + 1).padStart(2)}. ${a.email.padEnd(45)} ${a.name.padEnd(30)} ${a.source.padEnd(25)} ${a.provider}`)
  }
  console.log(`\nTotal final active: ${finalActive.length} (${piCount} with payment_issue badge)`)

  // ── SECTION B: Nominal list of trials ──
  console.log('\n' + '='.repeat(70))
  console.log('SECTION B: FINAL TRIAL MEMBERS (projected)')
  console.log('='.repeat(70))

  const finalTrial = []
  for (const m of dbMembers) {
    if (m.status !== 'trial') continue
    const email = m.email.toLowerCase().trim()
    const change = changes.find(c => c.email === email)
    if (!change) {
      finalTrial.push({ email, name: m.name, source: 'DB-only', provider: m.provider })
    } else if (change.new_status === 'trial') {
      finalTrial.push({ email, name: m.name, source: 'CSV', provider: change.csv?.payment_provider || m.provider })
    }
  }
  // Non-trial -> trial (unlikely but check)
  for (const c of changes) {
    if (c.new_status === 'trial' && c.db_status !== 'trial') {
      finalTrial.push({ email: c.email, name: c.name, source: 'Change to trial', provider: c.csv?.payment_provider })
    }
  }

  finalTrial.sort((a, b) => a.name.localeCompare(b.name))
  for (let i = 0; i < finalTrial.length; i++) {
    const t = finalTrial[i]
    const isInternal = t.email.endsWith('@hicparenting.com')
    console.log(`  ${String(i + 1).padStart(2)}. ${t.email.padEnd(45)} ${t.name.padEnd(30)} ${t.source.padEnd(15)} ${t.provider}${isInternal ? ' ← INTERNAL' : ''}`)
  }
  console.log(`\nTotal final trial: ${finalTrial.length} (${finalTrial.filter(t => !t.email.endsWith('@hicparenting.com')).length} visible, excl. internal)`)

  // ── SECTION C: Detailed transitions ──
  console.log('\n' + '='.repeat(70))
  console.log('SECTION C: DETAILED STATUS TRANSITIONS')
  console.log('='.repeat(70))

  function showTransition(label, filter) {
    const items = changes.filter(filter)
    if (items.length === 0) { console.log(`\n${label}: (none)`); return }
    console.log(`\n${label} (${items.length}):`)
    for (const c of items) {
      const db = dbByEmail[c.email]
      const lpa = c.csv?.last_payment_at || '—'
      console.log(`  ${c.email.padEnd(45)} ${c.name.padEnd(30)} ${c.db_status} → ${c.new_status}   last_payment: ${lpa}`)
    }
  }

  showTransition('active → paused', c => c.db_status === 'active' && c.new_status === 'paused')
  showTransition('active → cancelled', c => c.db_status === 'active' && c.new_status === 'cancelled')
  showTransition('cancelled → paused', c => c.db_status === 'cancelled' && c.new_status === 'paused')
  showTransition('cancelled → active (reactivation)', c => c.db_status === 'cancelled' && c.new_status === 'active')
  showTransition('expired → paused', c => c.db_status === 'expired' && c.new_status === 'paused')
  showTransition('expired → cancelled', c => c.db_status === 'expired' && c.new_status === 'cancelled')
  showTransition('trial → cancelled', c => c.db_status === 'trial' && c.new_status === 'cancelled')
  showTransition('payment_issue flagged (status stays active)', c => c.action === 'payment_issue')

  // ── SECTION D: spc_cancellations inserts ──
  console.log('\n' + '='.repeat(70))
  console.log('SECTION D: spc_cancellations TO INSERT (15)')
  console.log('='.repeat(70))
  // Check if any of these correspond to someone who will be active/paused after sync
  for (const ci of cancelInserts) {
    const email = ci.email
    const finalChange = changes.find(c => c.email === email)
    const finalSt = finalChange ? finalChange.new_status : (dbByEmail[email]?.status || 'not_in_db')
    const warn = (finalSt === 'active' || finalSt === 'paused' || finalSt === 'trial') ? ' ⚠️ FINAL STATUS IS ' + finalSt : ''
    console.log(`  ${email.padEnd(45)} ${ci.name.padEnd(30)} cancelled_at: ${ci.cancelled_at}  final: ${finalSt}${warn}`)
  }

  // ── SECTION E: should_cancel report ──
  console.log('\n' + '='.repeat(70))
  console.log('SECTION E: SHOULD_CANCEL — REPORT ONLY (no DB changes)')
  console.log('='.repeat(70))
  const scReports = reports.filter(r => r.action.startsWith('REPORT should_cancel'))
  console.log(`\nPayPal (12):`)
  for (const r of scReports.filter(r => r.action.includes('paypal'))) {
    console.log(`  ${r.email.padEnd(45)} ${r.name.padEnd(30)} months_unpaid: ${r.months_unpaid}  platform: ${r.platform_status}  DB: ${r.db}`)
  }
  console.log(`\nHotmart (5) — review after 2026-10-19:`)
  for (const r of scReports.filter(r => r.action.includes('hotmart'))) {
    console.log(`  ${r.email.padEnd(45)} ${r.name.padEnd(30)} months_unpaid: ${r.months_unpaid}  platform: ${r.platform_status}  DB: ${r.db}`)
  }

  // ── SECTION F: New paused inserts + duplicate check ──
  console.log('\n' + '='.repeat(70))
  console.log('SECTION F: NEW PAUSED INSERTS — DUPLICATE CHECK')
  console.log('='.repeat(70))

  for (const ni of newInserts) {
    const csvPhone = digitsOnly(ni.csv.phone)
    const csvName = normName(ni.name)
    const nameParts = csvName.split(' ').filter(Boolean)

    console.log(`\n  ${ni.email} — ${ni.name} — phone: ${ni.csv.phone || '(none)'}`)

    // Search by phone
    if (csvPhone.length >= 7) {
      const phoneDups = dbMembers.filter(m => {
        const dbPhone = digitsOnly(m.phone)
        return dbPhone.length >= 7 && (dbPhone.includes(csvPhone) || csvPhone.includes(dbPhone))
      })
      if (phoneDups.length > 0) {
        console.log(`    PHONE MATCH:`)
        for (const d of phoneDups) console.log(`      ${d.email} — ${d.name} — status: ${d.status} — phone: ${d.phone}`)
      } else {
        console.log(`    No phone match`)
      }
    } else {
      console.log(`    No phone to check`)
    }

    // Search by name (any part matches)
    const nameDups = dbMembers.filter(m => {
      const dbName = normName(m.name)
      if (dbName === csvName) return true
      // Check if first+last overlap
      return nameParts.length >= 2 && nameParts.every(p => dbName.includes(p))
    })
    if (nameDups.length > 0) {
      console.log(`    NAME MATCH:`)
      for (const d of nameDups) console.log(`      ${d.email} — ${d.name} — status: ${d.status}`)
    } else {
      console.log(`    No name match`)
    }
  }

  // ── SECTION G: Final projected counts ──
  console.log('\n' + '='.repeat(70))
  console.log('SECTION G: PROJECTED FINAL STATUS COUNTS')
  console.log('='.repeat(70))

  // Start from DB, apply changes + new inserts
  const finalCounts = {}
  for (const m of dbMembers) {
    const email = m.email.toLowerCase().trim()
    const change = changes.find(c => c.email === email)
    const st = change ? change.new_status : m.status
    finalCounts[st] = (finalCounts[st] || 0) + 1
  }
  // Add new inserts
  for (const ni of newInserts) {
    finalCounts['paused'] = (finalCounts['paused'] || 0) + 1
  }

  for (const [s, c] of Object.entries(finalCounts).sort()) {
    console.log(`  ${s}: ${c}`)
  }
  console.log(`\n  Active + Trial (DB) = ${(finalCounts.active || 0) + (finalCounts.trial || 0)}`)
  console.log(`  Active + Trial (visible, excl. internal) = ${finalActive.length} + ${finalTrial.filter(t => !t.email.endsWith('@hicparenting.com')).length} = ${finalActive.length + finalTrial.filter(t => !t.email.endsWith('@hicparenting.com')).length}`)

  // ── SECTION H: DB constraint values ──
  console.log('\n' + '='.repeat(70))
  console.log('SECTION H: CURRENT DB DISTINCT VALUES (for migration)')
  console.log('='.repeat(70))
  const distinctStatus = [...new Set(dbMembers.map(m => m.status))].sort()
  const distinctPlan = [...new Set(dbMembers.map(m => m.plan))].sort()
  const distinctProvider = [...new Set(dbMembers.map(m => m.provider))].sort()
  console.log(`  status values in DB:   ${distinctStatus.join(', ')}`)
  console.log(`  plan values in DB:     ${distinctPlan.join(', ')}`)
  console.log(`  provider values in DB: ${distinctProvider.join(', ')}`)

  // Check if payment_issue and months_unpaid columns already exist
  const { data: colCheck } = await supabase.from('spc_members').select('payment_issue, months_unpaid').limit(1)
  console.log(`  payment_issue column exists: ${colCheck !== null && !colCheck?.error}`)
}

main().catch(err => { console.error(err); process.exit(1) })
