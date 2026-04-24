import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { converted_from_trial } = await req.json()

  const { data, error } = await supabase
    .from('spc_members')
    .update({
      converted_from_trial: !!converted_from_trial,
      converted_at: converted_from_trial ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, member: data })
}
