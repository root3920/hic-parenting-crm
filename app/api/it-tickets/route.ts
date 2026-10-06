import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const VALID_CATEGORIES = [
  'crm_dashboard','gohighlevel','zapier_automatizaciones','email',
  'acceso_contrasenas','zoom_llamadas','hotmart_pagos','equipo_hardware','otro',
] as const

const VALID_PRIORITIES = ['low','medium','high','urgent'] as const

/**
 * GET /api/it-tickets
 * Admin: all tickets (filterable). Others: own tickets only.
 */
export async function GET(req: NextRequest) {
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await userSupabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  const svc = getServiceClient()
  const isAdmin = profile.role === 'admin'

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const priority = searchParams.get('priority')
  const category = searchParams.get('category')
  const q = searchParams.get('q')
  const pageParam = parseInt(searchParams.get('page') ?? '0', 10)
  const pageSize = 50

  let query = svc.from('it_tickets').select('*', { count: 'exact' })

  if (!isAdmin) {
    query = query.eq('requester_id', user.id)
  }
  if (status) query = query.eq('status', status)
  if (priority) query = query.eq('priority', priority)
  if (category) query = query.eq('category', category)
  if (q) {
    query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%,ticket_number.eq.${parseInt(q) || 0}`)
  }

  query = query.order('created_at', { ascending: false })
  query = query.range(pageParam * pageSize, (pageParam + 1) * pageSize - 1)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ tickets: data, total: count })
}

/**
 * POST /api/it-tickets
 * Any authenticated user can create a ticket.
 */
export async function POST(req: NextRequest) {
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await userSupabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  const body = await req.json()
  const { title, description, category, priority, page_url, attachment_urls } = body as {
    title?: string
    description?: string
    category?: string
    priority?: string
    page_url?: string
    attachment_urls?: string[]
  }

  // Validate
  if (!title || title.length < 3 || title.length > 120)
    return NextResponse.json({ error: 'El título debe tener entre 3 y 120 caracteres' }, { status: 400 })
  if (!description || description.length < 10 || description.length > 4000)
    return NextResponse.json({ error: 'La descripción debe tener entre 10 y 4000 caracteres' }, { status: 400 })
  if (!category || !VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number]))
    return NextResponse.json({ error: 'Categoría inválida' }, { status: 400 })
  if (priority && !VALID_PRIORITIES.includes(priority as typeof VALID_PRIORITIES[number]))
    return NextResponse.json({ error: 'Prioridad inválida' }, { status: 400 })

  const urls = attachment_urls ?? []
  if (urls.length > 3)
    return NextResponse.json({ error: 'Máximo 3 archivos adjuntos' }, { status: 400 })

  // Validate that attachment paths belong to the user
  const userFolder = `${user.id}/`
  for (const url of urls) {
    if (!url.startsWith(userFolder))
      return NextResponse.json({ error: 'Adjunto no autorizado' }, { status: 403 })
  }

  const svc = getServiceClient()

  const { data: ticket, error: ticketError } = await svc
    .from('it_tickets')
    .insert({
      title,
      description,
      category,
      priority: priority ?? 'medium',
      page_url: page_url || null,
      attachment_urls: urls,
      requester_id: user.id,
      requester_name: profile.full_name,
      requester_email: user.email,
      requester_role: profile.role,
    })
    .select()
    .single()

  if (ticketError) return NextResponse.json({ error: ticketError.message }, { status: 500 })

  // Create 'created' event
  await svc.from('it_ticket_events').insert({
    ticket_id: ticket.id,
    event_type: 'created',
    to_value: 'pending',
    actor_id: user.id,
    actor_name: profile.full_name,
    actor_role: profile.role,
  })

  return NextResponse.json({ ticket }, { status: 201 })
}
