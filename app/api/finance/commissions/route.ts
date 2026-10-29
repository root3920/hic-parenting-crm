import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// Use service role to bypass RLS on finance_commissions
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** Normalize client name: trim + collapse multiple spaces + lowercase for comparison */
function normalizeClient(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

function normalizeClientForMatch(name: string): string {
  return normalizeClient(name).toLowerCase()
}

/** Verify the user is admin, returns { user, error response } */
async function verifyAdmin() {
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) {
    return { user: null, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const { data: profile } = await userSupabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') {
    return { user: null, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { user, res: null }
}

// ── GET: fetch all PWU commissions ──────────────────────────────────────────

export async function GET() {
  const { res } = await verifyAdmin()
  if (res) return res

  const supabase = getServiceClient()

  // Paginated fetch to handle >1000 rows
  const pageSize = 1000
  let all: Record<string, unknown>[] = []
  let page = 0
  while (true) {
    const { data, error } = await supabase
      .from('finance_commissions')
      .select('*')
      .ilike('payment_description', '%Parenting With Understanding%')
      .order('payment_date', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)
    if (error) {
      console.error('[API finance/commissions] Error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data || data.length === 0) break
    all = [...all, ...data]
    if (data.length < pageSize) break
    page++
  }

  return NextResponse.json(all)
}

// ── POST: create commission with duplicate check ────────────────────────────

export async function POST(req: NextRequest) {
  const { user, res } = await verifyAdmin()
  if (res) return res

  const body = await req.json()
  const {
    payment_date, client, payment_description, amount,
    closer, setter, allow_duplicate,
  } = body

  if (!payment_date || !client || amount == null) {
    return NextResponse.json({ error: 'Missing required fields: payment_date, client, amount' }, { status: 400 })
  }

  const normalizedName = normalizeClient(client)
  const costNum = parseFloat(amount) || 0
  const supabase = getServiceClient()

  // ── Duplicate check ─────────────────────────────────────────────────────
  if (!allow_duplicate) {
    const { data: existing } = await supabase
      .from('finance_commissions')
      .select('*')
      .eq('payment_date', payment_date)
      .eq('amount', costNum)

    if (existing && existing.length > 0) {
      // Check for match by normalized client name or buyer_email
      const descBase = (payment_description || '').trim().toLowerCase()
      const match = existing.find(row => {
        const rowClient = normalizeClientForMatch(row.client || '')
        const inputClient = normalizeClientForMatch(normalizedName)
        const clientMatch = rowClient === inputClient
        const descMatch = !descBase || (row.payment_description || '').trim().toLowerCase() === descBase
        return clientMatch && descMatch
      })

      if (match) {
        return NextResponse.json({
          error: 'duplicate',
          message: `Ya existe una comisión de ${match.client} por $${match.amount} el ${match.payment_date}` +
            (match.closer ? `, closer ${match.closer}` : '') +
            (match.setter ? `, setter ${match.setter}` : ''),
          existing: match,
        }, { status: 409 })
      }
    }
  }

  // ── Calculate commissions ───────────────────────────────────────────────
  const closerName = closer?.trim() || null
  const setterName = setter?.trim() || null
  const closerComm = closerName ? costNum * 0.15 : 0
  const setterComm = setterName ? costNum * 0.05 : 0
  const totalComm = closerComm + setterComm

  const { data, error } = await supabase
    .from('finance_commissions')
    .insert({
      payment_date,
      client: normalizedName,
      payment_description: payment_description?.trim() || 'Parenting With Understanding',
      amount: costNum,
      closer: closerName,
      closer_commission: closerComm || null,
      closer_commission_status: closerName ? 'Pending' : 'N/A',
      setter: setterName,
      setter_commission: setterComm || null,
      setter_commission_status: setterName ? 'Pending' : 'N/A',
      total_commission: totalComm,
      commission_paid: 0,
      commission_pending: totalComm,
      net_total: costNum - totalComm,
    })
    .select()
    .single()

  if (error) {
    console.error('[API finance/commissions POST] Error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}

// ── PATCH: update commission fields ─────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const { res } = await verifyAdmin()
  if (res) return res

  const body = await req.json()
  const { id, field, value } = body
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const allowedFields = [
    'closer_commission_status', 'setter_commission_status',
    'closer', 'setter', 'closer_commission', 'setter_commission',
    'total_commission', 'commission_paid', 'commission_pending', 'net_total',
  ]

  // Support multi-field updates ({ id, updates: {...} }) or single-field ({ id, field, value })
  const updates: Record<string, unknown> = {}
  if (body.updates && typeof body.updates === 'object') {
    for (const [k, v] of Object.entries(body.updates)) {
      if (allowedFields.includes(k)) updates[k] = v
    }
  } else if (field && allowedFields.includes(field)) {
    updates[field] = value
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No allowed fields to update' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const { error } = await supabase
    .from('finance_commissions')
    .update(updates)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

// ── DELETE: delete commission with audit trail ──────────────────────────────

export async function DELETE(req: NextRequest) {
  const { user, res } = await verifyAdmin()
  if (res) return res

  const body = await req.json()
  const { id } = body
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const supabase = getServiceClient()

  // Fetch the row before deleting
  const { data: row, error: fetchError } = await supabase
    .from('finance_commissions')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !row) {
    return NextResponse.json({ error: 'Commission not found' }, { status: 404 })
  }

  // Save audit copy
  const { error: auditError } = await supabase
    .from('finance_commissions_audit')
    .insert({
      commission_id: row.id,
      row_data: row,
      deleted_by: user!.id,
      deleted_at: new Date().toISOString(),
    })

  if (auditError) {
    console.error('[API finance/commissions DELETE] Audit insert failed:', auditError.message)
    return NextResponse.json({ error: 'Failed to create audit record: ' + auditError.message }, { status: 500 })
  }

  // Delete the row
  const { error: deleteError } = await supabase
    .from('finance_commissions')
    .delete()
    .eq('id', id)

  if (deleteError) {
    console.error('[API finance/commissions DELETE] Delete failed:', deleteError.message)
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, deleted: row })
}
