import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(req: NextRequest) {
  // Auth check — admin only
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await userSupabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const body = await req.json()
  const csvText: string = body.csv || ''

  if (!csvText.trim()) {
    return NextResponse.json({ error: 'No CSV data provided' }, { status: 400 })
  }

  // Parse CSV
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) {
    return NextResponse.json({ error: 'CSV must have header + data rows' }, { status: 400 })
  }

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const colIdx = (name: string) => header.indexOf(name)

  const iDate = colIdx('fecha_compra')
  const iNombre = colIdx('nombre')
  const iApellido = colIdx('apellido')
  const iEmail = colIdx('email')
  const iTelefono = colIdx('telefono')
  const iSource = colIdx('utm_source')
  const iProducto = colIdx('producto')
  const iInstagram = colIdx('instagram')

  if (iEmail === -1) {
    return NextResponse.json({ error: 'CSV must have an "email" column' }, { status: 400 })
  }

  const rows: {
    email: string
    first_name: string | null
    last_name: string | null
    phone: string | null
    product: string | null
    source: string | null
    purchase_date: string | null
    instagram: string | null
  }[] = []

  for (let i = 1; i < lines.length; i++) {
    // Simple CSV parse (handles basic cases)
    const cols = lines[i].split(',').map((c) => c.trim())
    const email = (cols[iEmail] || '').trim().toLowerCase()

    // Skip invalid emails
    if (!email || email.includes('#error') || email.includes('#ERROR')) continue

    rows.push({
      email,
      first_name: cols[iNombre] || null,
      last_name: cols[iApellido] || null,
      phone: cols[iTelefono] || null,
      product: cols[iProducto] || null,
      source: iSource >= 0 ? (cols[iSource] || null) : null,
      purchase_date: iDate >= 0 && cols[iDate] ? cols[iDate] : null,
      instagram: iInstagram >= 0 ? (cols[iInstagram] || null) : null,
    })
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No valid rows found' }, { status: 400 })
  }

  // Upsert in batches
  const svc = getServiceClient()
  const BATCH_SIZE = 500
  let inserted = 0
  let errors = 0

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await svc
      .from('freebie_leads')
      .upsert(batch, { onConflict: 'email,product', ignoreDuplicates: false })

    if (error) {
      errors += batch.length
    } else {
      inserted += batch.length
    }
  }

  return NextResponse.json({ inserted, errors, total: rows.length })
}
