/**
 * Test script for getUtcRangeForLocalDate
 * Run with: node scripts/test-utc-range.mjs
 *
 * Since getUtcRangeForLocalDate is TypeScript, we re-implement the same logic
 * here for standalone testing (no tsx dependency required).
 */

function getUtcRangeForLocalDate(dateStr, timeZone) {
  function localMidnightToUtc(ymd, tz) {
    const [y, m, d] = ymd.split('-').map(Number)
    const guess = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      hour12: false,
    })
    const parts = fmt.formatToParts(guess)
    const get = (type) => parseInt(parts.find(p => p.type === type)?.value ?? '0')
    const localAtGuess = new Date(Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')))
    const offsetMs = localAtGuess.getTime() - guess.getTime()
    const midnightUtc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMs)

    const parts2 = fmt.formatToParts(midnightUtc)
    const get2 = (type) => parseInt(parts2.find(p => p.type === type)?.value ?? '0')
    const localAtMidnight = new Date(Date.UTC(get2('year'), get2('month') - 1, get2('day'), get2('hour'), get2('minute'), get2('second')))
    const offsetMs2 = localAtMidnight.getTime() - midnightUtc.getTime()

    if (offsetMs2 !== offsetMs) {
      return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMs2).toISOString()
    }
    return midnightUtc.toISOString()
  }

  const [y, m, d] = dateStr.split('-').map(Number)
  const nextDay = new Date(Date.UTC(y, m - 1, d + 1))
  const nextDayStr = nextDay.toISOString().split('T')[0]

  return {
    startIso: localMidnightToUtc(dateStr, timeZone),
    endIso: localMidnightToUtc(nextDayStr, timeZone),
  }
}

let passed = 0
let failed = 0

function assert(label, actual, expected) {
  if (actual === expected) {
    console.log(`  PASS: ${label}`)
    passed++
  } else {
    console.log(`  FAIL: ${label}`)
    console.log(`    expected: ${expected}`)
    console.log(`    actual:   ${actual}`)
    failed++
  }
}

function assertInRange(label, isoTimestamp, startIso, endIso) {
  const t = new Date(isoTimestamp).getTime()
  const s = new Date(startIso).getTime()
  const e = new Date(endIso).getTime()
  if (t >= s && t < e) {
    console.log(`  PASS: ${label} — ${isoTimestamp} is within [${startIso}, ${endIso})`)
    passed++
  } else {
    console.log(`  FAIL: ${label} — ${isoTimestamp} is NOT within [${startIso}, ${endIso})`)
    failed++
  }
}

// ─── Test 1: America/Los_Angeles 2026-10-12 (PDT, UTC-7) ──────────────
// THE BUG CASE: 5:00 PM PDT = 2026-10-13T00:00:00Z
console.log('\n=== America/Los_Angeles 2026-10-12 (PDT, UTC-7) ===')
{
  const r = getUtcRangeForLocalDate('2026-10-12', 'America/Los_Angeles')
  // Oct 12 midnight PDT = Oct 12 07:00 UTC
  assert('startIso', r.startIso, '2026-10-12T07:00:00.000Z')
  // Oct 13 midnight PDT = Oct 13 07:00 UTC
  assert('endIso', r.endIso, '2026-10-13T07:00:00.000Z')

  // 5:00 PM PDT on Oct 12 = Oct 13 00:00 UTC — MUST be in range
  assertInRange('5:00 PM PDT call', '2026-10-13T00:00:00Z', r.startIso, r.endIso)
  // 12:00 PM PDT on Oct 12 = Oct 12 19:00 UTC — MUST be in range
  assertInRange('12:00 PM PDT call', '2026-10-12T19:00:00Z', r.startIso, r.endIso)
  // 4:00 PM PDT on Oct 12 = Oct 12 23:00 UTC — MUST be in range
  assertInRange('4:00 PM PDT call', '2026-10-12T23:00:00Z', r.startIso, r.endIso)
  // 11:59 PM PDT on Oct 12 = Oct 13 06:59 UTC — MUST be in range
  assertInRange('11:59 PM PDT call', '2026-10-13T06:59:00Z', r.startIso, r.endIso)
}

// ─── Test 2: America/Los_Angeles 2026-11-01 (DST ends, day has 25 hours) ──
// DST ends Nov 1 2026 2:00 AM — clocks fall back to 1:00 AM
// Day is 25 hours: PDT (UTC-7) until 2am, then PST (UTC-8) from 1am
console.log('\n=== America/Los_Angeles 2026-11-01 (DST ends — 25h day) ===')
{
  const r = getUtcRangeForLocalDate('2026-11-01', 'America/Los_Angeles')
  // Nov 1 midnight PDT = Nov 1 07:00 UTC
  assert('startIso', r.startIso, '2026-11-01T07:00:00.000Z')
  // Nov 2 midnight PST = Nov 2 08:00 UTC (25 hour gap)
  assert('endIso', r.endIso, '2026-11-02T08:00:00.000Z')

  const durationH = (new Date(r.endIso).getTime() - new Date(r.startIso).getTime()) / 3600000
  assert('duration is 25 hours', durationH, 25)
}

// ─── Test 3: America/Los_Angeles 2026-03-08 (DST starts — 23h day) ────
// DST starts Mar 8 2026 2:00 AM — clocks spring forward to 3:00 AM
console.log('\n=== America/Los_Angeles 2026-03-08 (DST starts — 23h day) ===')
{
  const r = getUtcRangeForLocalDate('2026-03-08', 'America/Los_Angeles')
  // Mar 8 midnight PST = Mar 8 08:00 UTC
  assert('startIso', r.startIso, '2026-03-08T08:00:00.000Z')
  // Mar 9 midnight PDT = Mar 9 07:00 UTC (23 hour gap)
  assert('endIso', r.endIso, '2026-03-09T07:00:00.000Z')

  const durationH = (new Date(r.endIso).getTime() - new Date(r.startIso).getTime()) / 3600000
  assert('duration is 23 hours', durationH, 23)
}

// ─── Test 4: America/New_York 2026-10-12 (EDT, UTC-4) ────────────────
console.log('\n=== America/New_York 2026-10-12 (EDT, UTC-4) ===')
{
  const r = getUtcRangeForLocalDate('2026-10-12', 'America/New_York')
  assert('startIso', r.startIso, '2026-10-12T04:00:00.000Z')
  assert('endIso', r.endIso, '2026-10-13T04:00:00.000Z')
}

// ─── Test 5: America/Chicago 2026-10-12 (CDT, UTC-5) ─────────────────
console.log('\n=== America/Chicago 2026-10-12 (CDT, UTC-5) ===')
{
  const r = getUtcRangeForLocalDate('2026-10-12', 'America/Chicago')
  assert('startIso', r.startIso, '2026-10-12T05:00:00.000Z')
  assert('endIso', r.endIso, '2026-10-13T05:00:00.000Z')
}

// ─── Test 6: America/New_York DST ends 2026-11-01 (25h day) ──────────
console.log('\n=== America/New_York 2026-11-01 (DST ends — 25h day) ===')
{
  const r = getUtcRangeForLocalDate('2026-11-01', 'America/New_York')
  assert('startIso', r.startIso, '2026-11-01T04:00:00.000Z')
  assert('endIso', r.endIso, '2026-11-02T05:00:00.000Z')

  const durationH = (new Date(r.endIso).getTime() - new Date(r.startIso).getTime()) / 3600000
  assert('duration is 25 hours', durationH, 25)
}

// ─── Summary ─────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
else console.log('All tests passed!')
