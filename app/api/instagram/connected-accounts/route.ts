import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * GET /api/instagram/connected-accounts
 *
 * Returns connected Instagram accounts (without access_token).
 */
export async function GET() {
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

  const svc = getServiceClient()
  const { data, error } = await svc
    .from('instagram_connected_accounts')
    .select('id, ig_user_id, ig_username, ig_profile_pic_url, ig_name, fb_page_id, token_type, connected_at')
    .order('connected_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ accounts: data ?? [] })
}

/**
 * DELETE /api/instagram/connected-accounts
 *
 * Disconnect an Instagram account.
 * Body: { id: string }
 */
export async function DELETE(req: NextRequest) {
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
  const { id } = body as { id?: string }

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const svc = getServiceClient()
  const { error } = await svc
    .from('instagram_connected_accounts')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
