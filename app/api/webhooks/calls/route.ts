import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    // Log all headers
    const headers: Record<string, string> = {}
    req.headers.forEach((value, key) => {
      headers[key] = value
    })

    // Log raw body
    const body = await req.json()

    // Log everything to console (visible in Vercel logs)
    console.log('=== CALLS WEBHOOK RECEIVED ===')
    console.log('Timestamp:', new Date().toISOString())
    console.log('Headers:', JSON.stringify(headers, null, 2))
    console.log('Body:', JSON.stringify(body, null, 2))
    console.log('Body keys:', Object.keys(body))
    console.log('==============================')

    // Return 200 with everything we received
    return NextResponse.json({
      success: true,
      received_at: new Date().toISOString(),
      headers_received: headers,
      body_received: body,
      body_keys: Object.keys(body),
      message: 'Webhook received and logged. Check Vercel logs for full details.'
    }, { status: 200 })

  } catch (err: unknown) {
    console.error('Calls webhook error:', err)

    // Try to get raw text if JSON parsing failed
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
      note: 'Could not parse as JSON'
    }, { status: 200 }) // Return 200 anyway so GHL doesn't retry
  }
}

// Also handle GET for testing
export async function GET(req: NextRequest) {
  return NextResponse.json({
    status: 'Calls webhook is active',
    url: 'POST https://dashboard.hicparenting.com/api/webhooks/calls',
    timestamp: new Date().toISOString()
  })
}
