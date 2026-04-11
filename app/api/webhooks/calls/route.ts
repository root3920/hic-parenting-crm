import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Map GHL appoinmentStatus to our calls.status
// Note: GHL typo — field is "appoinmentStatus" (one 'i')
function mapStatus(appoinmentStatus: string): string {
  const s = (appoinmentStatus || '').toLowerCase().trim()
  if (s === 'confirmed')                              return 'Scheduled'
  if (s === 'cancelled' || s === 'canceled')          return 'Cancelled'
  if (s === 'rescheduled')                            return 'Rescheduled'
  if (s === 'showed' || s === 'showed_up' || s === 'attended') return 'Showed Up'
  if (s === 'noshow' || s === 'no_show' || s === 'no-show')    return 'No show'
  return 'Scheduled'
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Extract key fields
    const appointmentId = body?.calendar?.appointmentId
    const appStatus     = body?.calendar?.appoinmentStatus  // GHL typo — one 'i'
    const startTime     = body?.calendar?.startTime
    const endTime       = body?.calendar?.endTime
    const meetingUrl    = body?.calendar?.address || body?.customData?.meeting_url
    const calendarName  = body?.calendar?.calendarName || body?.customData?.calendar_name
    const fullName      = body?.full_name || `${body?.first_name ?? ''} ${body?.last_name ?? ''}`.trim()
    const firstName     = body?.first_name
    const lastName      = body?.last_name
    const email         = body?.email
    const phone         = body?.phone
    const closerName    = body?.customData?.closer_name ||
                          `${body?.user?.firstName ?? ''} ${body?.user?.lastName ?? ''}`.trim() ||
                          null
    const utmSource      = body?.customData?.utm_source       ?? null
    const utmMedium      = body?.customData?.utm_medium       ?? null
    const utmCampaign    = body?.customData?.utm_campaign     ?? null
    const sourceTimezone = body?.calendar?.selectedTimezone   ?? 'America/Los_Angeles'

    if (!appointmentId) {
      return NextResponse.json({ error: 'Missing appointmentId' }, { status: 400 })
    }

    const status       = mapStatus(appStatus)
    const activityType = status === 'Rescheduled' ? 'Rescheduled Meeting' : 'Appointment Booked'
    const callType     = calendarName?.toLowerCase().includes('vct') ? 'Interview' : 'Qualified'

    console.log('=== CALLS WEBHOOK ===')
    console.log(`AppointmentId: ${appointmentId}`)
    console.log(`appoinmentStatus: ${appStatus} → mapped to: ${status}`)
    console.log(`Contact: ${fullName} | ${email}`)
    console.log(`Closer: ${closerName}`)
    console.log(`Time: ${startTime}`)
    console.log('====================')

    // Check if this appointment already exists
    const { data: existing } = await supabase
      .from('calls')
      .select('id, status')
      .eq('external_id', appointmentId)
      .single()

    if (existing) {
      // UPDATE — appointment exists, update status and time fields only
      const { data, error } = await supabase
        .from('calls')
        .update({
          status,
          appointment_status: appStatus,
          start_date:    startTime,
          end_date:      endTime,
          meeting_url:   meetingUrl,
          activity_type: activityType,
        })
        .eq('external_id', appointmentId)
        .select()
        .single()

      if (error) {
        console.error('Update error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      console.log(`UPDATED: ${appointmentId} | ${existing.status} → ${status}`)

      return NextResponse.json({
        success:         true,
        action:          'updated',
        previous_status: existing.status,
        new_status:      status,
        call_id:         data?.id,
        appointment_id:  appointmentId,
        name:            fullName,
      })
    } else {
      // INSERT — new appointment
      const { data, error } = await supabase
        .from('calls')
        .insert({
          start_date:         startTime,
          end_date:           endTime,
          full_name:          fullName,
          first_name:         firstName,
          last_name:          lastName,
          email,
          phone,
          meeting_url:        meetingUrl,
          activity_type:      activityType,
          status,
          call_type:          callType,
          calendar:           calendarName,
          closer_name:        closerName,
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
      })
    }
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
    key_field: 'calendar.appoinmentStatus (note: GHL typo, one i)',
  })
}
