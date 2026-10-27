import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST — Escalate member to High Ticket
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()

  const {
    escalated_program = 'PWU 1:1 - 6 meses',
    escalated_contract_value,
    escalated_installments,
    escalated_first_payment,
    escalated_at,
    escalated_notes,
  } = body

  // Fetch current member
  const { data: member, error: fetchErr } = await supabase
    .from('spc_members')
    .select('id, status, email')
    .eq('id', id)
    .single()

  if (fetchErr || !member) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  if (member.status === 'escalated') {
    return NextResponse.json({ error: 'Member is already escalated' }, { status: 400 })
  }

  const today = new Date().toISOString().slice(0, 10)

  // Update member to escalated
  const { data, error } = await supabase
    .from('spc_members')
    .update({
      status_before_escalation: member.status,
      status: 'escalated',
      escalated_at: escalated_at || today,
      escalated_program,
      escalated_contract_value: escalated_contract_value || null,
      escalated_installments: escalated_installments || null,
      escalated_first_payment: escalated_first_payment || null,
      escalated_notes: escalated_notes || null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If member has an active cancellation, reclassify it as 'escalated'
  await supabase
    .from('spc_cancellations')
    .update({
      cancel_type: 'escalated',
      paid_cancel: false,
      trial_cancel: false,
    })
    .eq('email', member.email)

  return NextResponse.json({ success: true, member: data })
}

// DELETE — Revert escalation
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Fetch current member
  const { data: member, error: fetchErr } = await supabase
    .from('spc_members')
    .select('id, status, email, status_before_escalation')
    .eq('id', id)
    .single()

  if (fetchErr || !member) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  if (member.status !== 'escalated') {
    return NextResponse.json({ error: 'Member is not escalated' }, { status: 400 })
  }

  const previousStatus = member.status_before_escalation || 'active'

  // Revert member status and clear escalation columns
  const { data, error } = await supabase
    .from('spc_members')
    .update({
      status: previousStatus,
      status_before_escalation: null,
      escalated_at: null,
      escalated_program: null,
      escalated_contract_value: null,
      escalated_installments: null,
      escalated_first_payment: null,
      escalated_notes: null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Restore cancellation records that were marked as 'escalated'
  // Determine original cancel_type based on restored status
  const wasTrial = previousStatus === 'trial'
  await supabase
    .from('spc_cancellations')
    .update({
      cancel_type: wasTrial ? 'trial_cancel' : 'paid_cancel',
      paid_cancel: !wasTrial,
      trial_cancel: wasTrial,
    })
    .eq('email', member.email)
    .eq('cancel_type', 'escalated')

  return NextResponse.json({ success: true, member: data })
}
