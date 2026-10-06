import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
 * POST /api/it-tickets/public
 * Creates a ticket from the public form. No auth required.
 */
export async function POST(req: NextRequest) {
  // Guard against oversized bodies
  const contentLength = parseInt(req.headers.get('content-length') ?? '0', 10)
  if (contentLength > 50_000) {
    return NextResponse.json({ error: 'Cuerpo de la solicitud demasiado grande' }, { status: 413 })
  }

  const svc = getServiceClient()
  const ip = getClientIP(req)
  const ipHash = hashIP(ip)

  // --- Rate limiting ---
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  // Opportunistic cleanup of old records (>24h)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  await svc.from('it_ticket_rate_limits').delete().lt('created_at', oneDayAgo)

  // Check ticket rate: max 5 per IP per hour
  const { count } = await svc
    .from('it_ticket_rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', oneHourAgo)

  if ((count ?? 0) >= 5) {
    return NextResponse.json(
      { error: 'Has enviado demasiados tickets. Intenta de nuevo en una hora.' },
      { status: 429 },
    )
  }

  const body = await req.json()
  const {
    contact_name, contact_email, contact_phone, website,
    title, description, category, priority, page_url, attachment_urls,
  } = body as {
    contact_name?: string
    contact_email?: string
    contact_phone?: string
    website?: string
    title?: string
    description?: string
    category?: string
    priority?: string
    page_url?: string
    attachment_urls?: string[]
  }

  // Honeypot check — respond 200 but don't save
  if (website) {
    return NextResponse.json({ ticket_number: 0 })
  }

  // --- Validate ---
  if (!contact_name || contact_name.length < 2 || contact_name.length > 80)
    return NextResponse.json({ error: 'Nombre inválido (2–80 caracteres)' }, { status: 400 })
  if (!contact_email || !EMAIL_RE.test(contact_email))
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  if (contact_phone && contact_phone.length > 30)
    return NextResponse.json({ error: 'Teléfono demasiado largo (máx 30)' }, { status: 400 })
  if (!title || title.length < 3 || title.length > 120)
    return NextResponse.json({ error: 'El título debe tener entre 3 y 120 caracteres' }, { status: 400 })
  if (!description || description.length < 10 || description.length > 4000)
    return NextResponse.json({ error: 'La descripción debe tener entre 10 y 4000 caracteres' }, { status: 400 })
  if (!category || !VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number]))
    return NextResponse.json({ error: 'Categoría inválida' }, { status: 400 })
  if (priority && !VALID_PRIORITIES.includes(priority as typeof VALID_PRIORITIES[number]))
    return NextResponse.json({ error: 'Prioridad inválida' }, { status: 400 })
  if (page_url && page_url.length > 300)
    return NextResponse.json({ error: 'URL demasiado larga (máx 300)' }, { status: 400 })

  const urls = attachment_urls ?? []
  if (urls.length > 3)
    return NextResponse.json({ error: 'Máximo 3 archivos adjuntos' }, { status: 400 })

  // Validate that attachment paths are in the public/ folder
  for (const url of urls) {
    if (!url.startsWith('public/'))
      return NextResponse.json({ error: 'Adjunto no autorizado' }, { status: 403 })
  }

  // --- Insert ticket ---
  const { data: ticket, error: ticketError } = await svc
    .from('it_tickets')
    .insert({
      title,
      description,
      category,
      priority: priority ?? 'medium',
      page_url: page_url || null,
      attachment_urls: urls,
      source: 'public_form',
      requester_id: null,
      requester_name: contact_name,
      requester_email: contact_email,
      requester_role: 'externo',
      contact_name,
      contact_email,
      contact_phone: contact_phone || null,
    })
    .select('ticket_number')
    .single()

  if (ticketError)
    return NextResponse.json({ error: ticketError.message }, { status: 500 })

  // Create 'created' event
  const { data: insertedTicket } = await svc
    .from('it_tickets')
    .select('id')
    .eq('ticket_number', ticket.ticket_number)
    .single()

  if (insertedTicket) {
    await svc.from('it_ticket_events').insert({
      ticket_id: insertedTicket.id,
      event_type: 'created',
      to_value: 'pending',
      actor_name: contact_name,
      actor_role: 'externo',
    })
  }

  // Record rate limit hit
  await svc.from('it_ticket_rate_limits').insert({ ip_hash: ipHash })

  return NextResponse.json({ ticket_number: ticket.ticket_number })
}
