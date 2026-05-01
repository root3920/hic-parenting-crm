import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function inferSetter(calendarName: string, explicitSetter?: string): string | null {
  if (explicitSetter) return explicitSetter
  const cal = (calendarName || '').toLowerCase()
  if (cal.includes('valentina')) return 'Valentina Llano'
  if (cal.includes('marcela collier')) return 'Marcela Collier'
  return null
}

// Map GHL appoinmentStatus to our calls.status
// Note: GHL typo — field is "appoinmentStatus" (one 'i')
function mapStatus(appoinmentStatus: string): string {
  const s = (appoinmentStatus || '').toLowerCase().trim()
  if (s === 'confirmed')                                       return 'Scheduled'
  if (s === 'cancelled' || s === 'canceled')                   return 'Cancelled'
  if (s === 'rescheduled')                                     return 'Rescheduled'
  if (s === 'showed' || s === 'showed_up' || s === 'attended') return 'Showed Up'
  if (s === 'noshow'  || s === 'no_show'  || s === 'no-show')  return 'No show'
  return 'Scheduled'
}

// GHL sends startTime as "2026-04-13T11:00:00" — local time in the calendar's
// selectedTimezone, but JS would parse it as UTC. This converts it to true UTC.
function ghlTimeToUTC(localTimeStr: string, sourceTz: string): string {
  const [datePart, timePart = '00:00:00'] = localTimeStr.split('T')
  const [year, month, day]                = datePart.split('-').map(Number)
  const [hour, minute, second = 0]        = timePart.split(':').map(Number)

  // Treat the components as UTC first (a neutral "test" instant)
  const testDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second))

  // Ask Intl what clock shows in sourceTz at that instant
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: sourceTz,
    year:     'numeric', month:  '2-digit', day:    '2-digit',
    hour:     '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(testDate)

  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0)
  const tzAsUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))

  // Offset = how far testDate is from what sourceTz displays for it
  const offsetMs = testDate.getTime() - tzAsUTC

  // True UTC = local components + offset
  return new Date(testDate.getTime() + offsetMs).toISOString()
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    console.log('=== CALLS WEBHOOK RAW BODY ===')
    console.log(JSON.stringify(body, null, 2))
    console.log('==============================')

    // Extract key fields
    const appointmentId  = body?.calendar?.appointmentId
    const appStatus      = body?.calendar?.appoinmentStatus  // GHL typo — one 'i'
    const startTime      = body?.calendar?.startTime
    const endTime        = body?.calendar?.endTime
    const meetingUrl     = body?.calendar?.address || body?.customData?.meeting_url
    const calendarName   = body?.calendar?.calendarName || body?.customData?.calendar_name
    const fullName       = body?.full_name || `${body?.first_name ?? ''} ${body?.last_name ?? ''}`.trim()
    const firstName      = body?.first_name
    const lastName       = body?.last_name
    const email          = body?.email
    const phone          = body?.phone
    const closerName     = body?.customData?.closer_name ||
                           `${body?.user?.firstName ?? ''} ${body?.user?.lastName ?? ''}`.trim() ||
                           null
    const setterName     = inferSetter(calendarName, body?.customData?.setter_name)
    const utmSource      = body?.customData?.utm_source       ?? null
    const utmMedium      = body?.customData?.utm_medium       ?? null
    const utmCampaign    = body?.customData?.utm_campaign     ?? null
    const sourceTimezone = body?.calendar?.selectedTimezone   ?? 'America/Denver'

    if (!appointmentId) {
      return NextResponse.json({ error: 'Missing appointmentId' }, { status: 400 })
    }

    // Convert GHL local times to UTC
    const startUTC = startTime ? ghlTimeToUTC(startTime, sourceTimezone) : null
    const endUTC   = endTime   ? ghlTimeToUTC(endTime,   sourceTimezone) : null

    const status       = mapStatus(appStatus)
    const activityType = status === 'Rescheduled' ? 'Rescheduled Meeting' : 'Appointment Booked'
    const callType     = calendarName?.toLowerCase().includes('vct') ? 'Interview' : 'Qualified'

    console.log('=== CALLS WEBHOOK ===')
    console.log(`AppointmentId: ${appointmentId}`)
    console.log(`appoinmentStatus: ${appStatus} → mapped to: ${status}`)
    console.log(`Contact: ${fullName} | ${email}`)
    console.log(`Closer: ${closerName}`)
    console.log(`Setter: ${setterName}`)
    console.log(`Time (local): ${startTime} (${sourceTimezone})`)
    console.log(`Time (UTC):   ${startUTC}`)
    console.log('====================')

    // Check if this exact GHL appointment already exists
    const { data: existing } = await supabase
      .from('calls')
      .select('id, status, start_date, reported_at')
      .eq('external_id', appointmentId)
      .single()

    if (existing) {
      // Same external_id → UPSERT to prevent duplicates.
      // Only update status-related fields. NEVER touch start_date/email/notes
      // on calls that already happened or have a report.
      const isPast     = existing.start_date && new Date(existing.start_date) < new Date()
      const isReported = !!existing.reported_at

      const updateFields: Record<string, unknown> = {
        status,
        appointment_status: appStatus,
        activity_type:      activityType,
      }

      // Only update time/url if the call is still in the future and unreported
      if (!isPast && !isReported) {
        updateFields.start_date   = startUTC
        updateFields.end_date     = endUTC
        updateFields.meeting_url  = meetingUrl
      }

      const { data, error } = await supabase
        .from('calls')
        .update(updateFields)
        .eq('external_id', appointmentId)
        .select()
        .single()

      if (error) {
        console.error('Upsert error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      console.log(`UPSERTED: ${appointmentId} | ${existing.status} → ${status}${isPast || isReported ? ' (protected — time/url unchanged)' : ''}`)

      return NextResponse.json({
        success:         true,
        action:          'upserted',
        previous_status: existing.status,
        new_status:      status,
        call_id:         data?.id,
        appointment_id:  appointmentId,
        name:            fullName,
        start_utc:       startUTC,
      })
    }

    // Different external_id → ALWAYS INSERT a new record.
    // First, check if there's an existing FUTURE Scheduled unreported call
    // for the same contact — if so, mark only that one as Rescheduled.
    const now = new Date()

    if (email) {
      const { data: existingFutureCall } = await supabase
        .from('calls')
        .select('id, start_date, full_name')
        .eq('email', email)
        .eq('status', 'Scheduled')               // only Scheduled, not already completed
        .gt('start_date', now.toISOString())      // must be in the future
        .is('reported_at', null)                   // not yet reported
        .order('start_date', { ascending: true })
        .limit(1)
        .single()

      if (existingFutureCall) {
        await supabase
          .from('calls')
          .update({ status: 'Rescheduled' })
          .eq('id', existingFutureCall.id)

        console.log(`AUTO-RESCHEDULED: call ${existingFutureCall.id} (${existingFutureCall.full_name} @ ${existingFutureCall.start_date}) → Rescheduled`)
      }
    }

    // INSERT — new call record (always, regardless of reschedule)
    const { data, error } = await supabase
      .from('calls')
      .insert({
        start_date:         startUTC,
        end_date:           endUTC,
        full_name:          fullName,
        first_name:         firstName,
        last_name:          lastName,
        email,
        phone,
        meeting_url:        meetingUrl,
        activity_type:      activityType,
        status:             status === 'Rescheduled' ? 'Scheduled' : status,
        call_type:          callType,
        calendar:           calendarName,
        closer_name:        closerName,
        setter_name:        setterName,
        utm_source:         utmSource,
        utm_medium:         utmMedium,
        utm_campaign:       utmCampaign,
        external_id:        appointmentId,
        appointment_status: appStatus,
        source_timezone:    sourceTimezone,
      })
      .select()
      .single()

    if (error) {
      console.error('Insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`INSERTED: ${appointmentId} | ${status} | ${fullName}`)

    return NextResponse.json({
      success:        true,
      action:         'created',
      status_set:     status,
      call_id:        data?.id,
      appointment_id: appointmentId,
      name:           fullName,
      start_utc:      startUTC,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Webhook error:', message)
    return NextResponse.json(
      { error: 'Internal server error', details: message },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    status:          'Calls webhook active',
    url:             'POST https://dashboard.hicparenting.com/api/webhooks/calls',
    events_handled:  [
      'confirmed → Scheduled',
      'cancelled → Cancelled',
      'rescheduled → Rescheduled',
      'showed → Showed Up',
      'noshow → No show',
    ],
    key_field:   'calendar.appoinmentStatus (note: GHL typo, one i)',
    time_note:   'startTime converted from selectedTimezone local time to UTC before storage',
  })
}
