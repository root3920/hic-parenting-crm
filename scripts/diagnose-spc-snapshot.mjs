/**
 * Diagnostic script: cross-reference SPC snapshot CSV against live Supabase DB.
 * Run: node scripts/diagnose-spc-snapshot.mjs
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

// ── ENV ──────────────────────────────────────────────────────────────────────
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const supabase = createClient(url, key)

// ── CSV parse (handle BOM, quoted fields) ────────────────────────────────────
function parseCSV(text) {
  // Strip BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
  const lines = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { current += '"'; i++; continue }
      inQuotes = !inQuotes; continue
    }
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (current.length > 0 || lines.length > 0) lines.push(current)
      current = ''
      if (ch === '\r' && text[i + 1] === '\n') i++
      continue
    }
    current += ch
  }
  if (current.length > 0) lines.push(current)

  const header = lines[0].split(',').map(h => h.trim())
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const vals = []
    let field = ''
    let q = false
    for (let j = 0; j < lines[i].length; j++) {
      const c = lines[i][j]
      if (c === '"') { if (q && lines[i][j+1] === '"') { field += '"'; j++ } else q = !q; continue }
      if (c === ',' && !q) { vals.push(field.trim()); field = ''; continue }
      field += c
    }
    vals.push(field.trim())
    const obj = {}
    header.forEach((h, idx) => obj[h] = vals[idx] ?? '')
    rows.push(obj)
  }
  return rows
}

// ── Exclusion rules ──────────────────────────────────────────────────────────
function isExcluded(row) {
  const email = (row.email || '').toLowerCase().trim()
  const name = (row.full_name || '').toLowerCase().trim()
  if (!email) return 'no_email'
  if (email.endsWith('@hicparenting.com')) return 'hicparenting_email'
  if (email === 'highimpactclub@gmail.com') return 'highimpactclub_email'
  if (name === 'high impact llc' || name.includes('high impact llc')) return 'test_account'
  return null
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Read CSV
  const raw = readFileSync('data/spc_members_snapshot_2026-10-15.csv', 'utf-8')
  const allRows = parseCSV(raw)
  console.log(`CSV total rows: ${allRows.length}`)

  // Apply exclusions
  const excluded = []
  const rows = []
  for (const r of allRows) {
    const reason = isExcluded(r)
    if (reason) { excluded.push({ email: r.email, name: r.full_name, reason, real_status: r.real_status }); continue }
    rows.push(r)
  }
  console.log(`\n── EXCLUDED (${excluded.length}) ──`)
  for (const e of excluded) console.log(`  ${e.email || '(no email)'} — ${e.name} — reason: ${e.reason} — real_status: ${e.real_status}`)

  console.log(`\nCSV after exclusions: ${rows.length}`)

  // Count by real_status
  const byStatus = {}
  for (const r of rows) {
    byStatus[r.real_status] = (byStatus[r.real_status] || 0) + 1
  }
  console.log('\n── CSV real_status counts (after exclusions) ──')
  for (const [s, c] of Object.entries(byStatus).sort()) console.log(`  ${s}: ${c}`)
  const activePlusTrial = (byStatus['active'] || 0) + (byStatus['trial'] || 0)
  console.log(`  → active + trial = ${activePlusTrial}`)

  // 2. Fetch DB
  const { data: dbMembers, error: mErr } = await supabase.from('spc_members').select('id, email, name, status, plan, amount, provider, joined_at')
  if (mErr) { console.error('DB error (members):', mErr.message); process.exit(1) }
  console.log(`\nDB spc_members total: ${dbMembers.length}`)

  const dbByEmail = {}
  for (const m of dbMembers) {
    dbByEmail[m.email.toLowerCase().trim()] = m
  }

  // DB status counts
  const dbStatusCounts = {}
  for (const m of dbMembers) {
    dbStatusCounts[m.status] = (dbStatusCounts[m.status] || 0) + 1
  }
  console.log('DB status counts:')
  for (const [s, c] of Object.entries(dbStatusCounts).sort()) console.log(`  ${s}: ${c}`)

  // 3. Cross-reference
  let existsInDb = 0
  let notInDb = 0
  const newEmails = []
  const matrix = {} // key = `${db_status} → ${csv_status}`, value = count
  const matrixList = {} // same but with emails

  for (const r of rows) {
    const email = r.email.toLowerCase().trim()
    const dbRow = dbByEmail[email]
    if (dbRow) {
      existsInDb++
      const key = `${dbRow.status} → ${r.real_status}`
      matrix[key] = (matrix[key] || 0) + 1
      if (!matrixList[key]) matrixList[key] = []
      matrixList[key].push(email)
    } else {
      notInDb++
      newEmails.push({ email, real_status: r.real_status, name: r.full_name })
    }
  }

  console.log(`\n── CROSS-REFERENCE ──`)
  console.log(`  Emails in CSV that exist in DB: ${existsInDb}`)
  console.log(`  Emails in CSV NOT in DB:        ${notInDb}`)

  console.log(`\n── STATUS MATRIX (DB status → CSV real_status : count) ──`)
  for (const [key, count] of Object.entries(matrix).sort()) {
    console.log(`  ${key}: ${count}`)
  }

  // 4. Active/trial in DB but should_cancel/cancelled/incomplete in CSV
  console.log(`\n── ACTIVE/TRIAL in DB → should_cancel/cancelled/incomplete in CSV ──`)
  const dangerTransitions = ['should_cancel', 'cancelled', 'incomplete']
  for (const [key, emails] of Object.entries(matrixList)) {
    const [dbSt, csvSt] = key.split(' → ')
    if ((dbSt === 'active' || dbSt === 'trial') && dangerTransitions.includes(csvSt)) {
      console.log(`\n  ${key} (${emails.length}):`)
      for (const e of emails) {
        const r = rows.find(x => x.email.toLowerCase().trim() === e)
        console.log(`    ${e} — ${r?.full_name} — platform: ${r?.source_platform} — provider: ${r?.payment_provider} — months_unpaid: ${r?.months_unpaid}`)
      }
    }
  }

  // 5. Active/trial in DB but NOT in CSV
  console.log(`\n── ACTIVE/TRIAL in DB but NOT in CSV ──`)
  const csvEmails = new Set(rows.map(r => r.email.toLowerCase().trim()))
  const dbActiveTrialNotInCsv = dbMembers.filter(m =>
    (m.status === 'active' || m.status === 'trial') && !csvEmails.has(m.email.toLowerCase().trim())
  )
  console.log(`  Count: ${dbActiveTrialNotInCsv.length}`)
  for (const m of dbActiveTrialNotInCsv) {
    console.log(`    ${m.email} — ${m.name} — status: ${m.status} — provider: ${m.provider} — plan: ${m.plan}`)
  }

  // 6. New emails by real_status
  console.log(`\n── NEW EMAILS (not in DB) by real_status ──`)
  const newByStatus = {}
  for (const e of newEmails) {
    newByStatus[e.real_status] = (newByStatus[e.real_status] || 0) + 1
  }
  for (const [s, c] of Object.entries(newByStatus).sort()) console.log(`  ${s}: ${c}`)

  // 7. Cancellations check
  const { data: dbCancels, error: cErr } = await supabase.from('spc_cancellations').select('email, cancelled_at, cancel_type')
  if (cErr) { console.error('DB error (cancellations):', cErr.message); process.exit(1) }
  console.log(`\nDB spc_cancellations total: ${dbCancels.length}`)

  const cancelsByEmail = {}
  for (const c of dbCancels) {
    const e = (c.email || '').toLowerCase().trim()
    if (!cancelsByEmail[e]) cancelsByEmail[e] = []
    cancelsByEmail[e].push(c)
  }

  // CSV cancellations with cancelled_at in 2026
  const csvCancels2026 = rows.filter(r =>
    (r.real_status === 'cancelled' || r.real_status === 'should_cancel') && r.cancelled_at && r.cancelled_at.startsWith('2026')
  )
  const csvCancelsNoCancelledAt = rows.filter(r =>
    (r.real_status === 'cancelled') && !r.cancelled_at
  )

  let alreadyInCancellations = 0
  let missingFromCancellations = 0
  const missingCancelEmails = []

  for (const r of csvCancels2026) {
    const email = r.email.toLowerCase().trim()
    if (cancelsByEmail[email] && cancelsByEmail[email].length > 0) {
      alreadyInCancellations++
    } else {
      missingFromCancellations++
      missingCancelEmails.push({ email, name: r.full_name, cancelled_at: r.cancelled_at, real_status: r.real_status })
    }
  }

  console.log(`\n── CANCELLATIONS 2026 CHECK ──`)
  console.log(`  CSV rows with cancelled_at in 2026: ${csvCancels2026.length}`)
  console.log(`  Already in spc_cancellations:        ${alreadyInCancellations}`)
  console.log(`  Missing from spc_cancellations:      ${missingFromCancellations}`)
  console.log(`  CSV cancelled WITHOUT cancelled_at:  ${csvCancelsNoCancelledAt.length} (will NOT be inserted)`)

  if (missingCancelEmails.length > 0 && missingCancelEmails.length <= 30) {
    console.log(`\n  Missing cancellation records (first 30):`)
    for (const m of missingCancelEmails.slice(0, 30)) {
      console.log(`    ${m.email} — ${m.name} — cancelled_at: ${m.cancelled_at} — ${m.real_status}`)
    }
  } else if (missingCancelEmails.length > 30) {
    console.log(`\n  Missing cancellation records (showing 30 of ${missingCancelEmails.length}):`)
    for (const m of missingCancelEmails.slice(0, 30)) {
      console.log(`    ${m.email} — ${m.name} — cancelled_at: ${m.cancelled_at} — ${m.real_status}`)
    }
  }

  // 8. Should_cancel breakdown
  console.log(`\n── SHOULD_CANCEL BREAKDOWN ──`)
  const shouldCancel = rows.filter(r => r.real_status === 'should_cancel')
  const scPaypal = shouldCancel.filter(r => r.payment_provider === 'paypal')
  const scHotmart = shouldCancel.filter(r => r.payment_provider === 'hotmart')
  const scOther = shouldCancel.filter(r => r.payment_provider !== 'paypal' && r.payment_provider !== 'hotmart')
  console.log(`  Total: ${shouldCancel.length}`)
  console.log(`  PayPal (→ expired): ${scPaypal.length}`)
  for (const r of scPaypal) console.log(`    ${r.email} — ${r.full_name} — months_unpaid: ${r.months_unpaid} — platform_status: ${r.platform_status}`)
  console.log(`  Hotmart (→ keep + payment_issue): ${scHotmart.length}`)
  for (const r of scHotmart) console.log(`    ${r.email} — ${r.full_name} — months_unpaid: ${r.months_unpaid} — platform_status: ${r.platform_status} — next_charge: ${r.next_charge_at}`)
  if (scOther.length > 0) {
    console.log(`  Other: ${scOther.length}`)
    for (const r of scOther) console.log(`    ${r.email} — ${r.full_name} — provider: ${r.payment_provider}`)
  }

  // 9. payment_issue breakdown
  console.log(`\n── PAYMENT_ISSUE (1 month unpaid) ──`)
  const paymentIssue = rows.filter(r => r.real_status === 'payment_issue')
  for (const r of paymentIssue) console.log(`  ${r.email} — ${r.full_name} — months_unpaid: ${r.months_unpaid} — provider: ${r.payment_provider}`)

  // 10. Paused breakdown
  console.log(`\n── PAUSED ──`)
  const paused = rows.filter(r => r.real_status === 'paused')
  console.log(`  Total: ${paused.length}`)
  const pausedInDb = paused.filter(r => dbByEmail[r.email.toLowerCase().trim()])
  const pausedNotInDb = paused.filter(r => !dbByEmail[r.email.toLowerCase().trim()])
  console.log(`  Already in DB: ${pausedInDb.length}`)
  console.log(`  Not in DB: ${pausedNotInDb.length}`)
}

main().catch(err => { console.error(err); process.exit(1) })
