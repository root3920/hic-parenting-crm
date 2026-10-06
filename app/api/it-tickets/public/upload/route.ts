import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

function detectImageType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null

  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47)
    return 'image/png'

  // JPEG
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF)
    return 'image/jpeg'

  // WebP: starts with RIFF, offset 8-11 = WEBP
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  )
    return 'image/webp'

  return null
}

function hashIP(ip: string): string {
  const salt = process.env.IT_TICKETS_IP_SALT || 'hic-it-tickets-default-salt-2024'
  return createHash('sha256').update(ip + salt).digest('hex')
}

function getClientIP(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '0.0.0.0'
  )
}

/**
 * POST /api/it-tickets/public/upload
 * Public upload endpoint. Validates magic bytes. Rate limited.
 */
export async function POST(req: NextRequest) {
  const svc = getServiceClient()
  const ip = getClientIP(req)
  const ipHash = hashIP(ip)

  // Rate limit: max 15 uploads per IP per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count } = await svc
    .from('it_ticket_rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', oneHourAgo)

  if ((count ?? 0) >= 15) {
    return NextResponse.json(
      { error: 'Has subido demasiados archivos. Intenta de nuevo en una hora.' },
      { status: 429 },
    )
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  if (file.size > MAX_SIZE)
    return NextResponse.json({ error: 'El archivo excede 5 MB' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())

  // Verify real content type via magic bytes
  const detectedType = detectImageType(buffer)
  if (!detectedType)
    return NextResponse.json({ error: 'Tipo de archivo no permitido. Solo PNG, JPEG o WebP.' }, { status: 400 })

  const ext = detectedType === 'image/png' ? 'png' : detectedType === 'image/webp' ? 'webp' : 'jpg'
  const fileName = `public/${crypto.randomUUID()}.${ext}`

  const { error } = await svc.storage
    .from('it-ticket-attachments')
    .upload(fileName, buffer, { contentType: detectedType, upsert: false })

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 })

  // Record rate limit hit
  await svc.from('it_ticket_rate_limits').insert({ ip_hash: ipHash })

  return NextResponse.json({ path: fileName })
}
