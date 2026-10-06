import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

/**
 * POST /api/it-tickets/upload
 * Receives an image, validates type/size, uploads to the bucket.
 */
export async function POST(req: NextRequest) {
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  if (!ALLOWED_TYPES.includes(file.type))
    return NextResponse.json({ error: 'Tipo de archivo no permitido. Solo PNG, JPEG o WebP.' }, { status: 400 })

  if (file.size > MAX_SIZE)
    return NextResponse.json({ error: 'El archivo excede 5 MB' }, { status: 400 })

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const fileName = `${user.id}/${crypto.randomUUID()}.${ext}`

  const svc = getServiceClient()
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await svc.storage
    .from('it-ticket-attachments')
    .upload(fileName, buffer, { contentType: file.type, upsert: false })

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ path: fileName })
}
