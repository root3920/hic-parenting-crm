import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const cookieStore = await cookies()

  // Verify caller is an admin
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (callerProfile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { email, full_name, role, closer_name, setter_name } = body

  if (!email || !full_name || !role) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  // Admin client with service role key
  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: inviteData, error: inviteError } =
    await adminSupabase.auth.admin.inviteUserByEmail(email)

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 400 })
  }

  const { error: profileError } = await adminSupabase.from('profiles').insert({
    id: inviteData.user.id,
    full_name,
    role,
    closer_name: closer_name || null,
    setter_name: setter_name || null,
  })

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
