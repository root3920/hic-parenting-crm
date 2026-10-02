import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()

    const updates: Record<string, unknown> = {}
    if (body.followup_status !== undefined) updates.followup_status = body.followup_status
    if (body.followup_date !== undefined) updates.followup_date = body.followup_date || null
    if (body.followup_notes !== undefined) updates.followup_notes = body.followup_notes || null
    if (body.final_outcome !== undefined) updates.final_outcome = body.final_outcome || null

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('spc_satisfaction_responses')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Satisfaction update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Satisfaction update error:', message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
