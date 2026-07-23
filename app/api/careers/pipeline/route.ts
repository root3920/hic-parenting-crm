import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function authenticateAdmin(cookieStore: Awaited<ReturnType<typeof cookies>>) {
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
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return profile?.role === 'admin' ? user : null
}

/* ─── GET — returns pipeline data with auto-advance ──────────── */

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const user = await authenticateAdmin(cookieStore)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceClient = getServiceClient()
  const position = request.nextUrl.searchParams.get('position') || 'dm_setter'
  const sync = request.nextUrl.searchParams.get('sync') === 'true'

  // Fetch all Stage 2 submissions
  const { data: stage2Submissions } = await serviceClient
    .from('dm_setter_stage2')
    .select('email')

  const stage2Emails = new Set(
    (stage2Submissions || []).map((s: { email: string }) => s.email.toLowerCase())
  )

  // Fetch all existing applications for this position
  const { data: applications, error } = await serviceClient
    .from('job_applications')
    .select('*')
    .eq('position', position)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const existingEmails = new Set(
    (applications || []).map((a: Record<string, unknown>) => (a.email as string).toLowerCase())
  )

  let advanced = 0
  let created = 0

  // Auto-advance existing applicants with Stage 2
  for (const app of (applications || [])) {
    const appEmail = (app.email as string).toLowerCase()
    const hasStage2 = stage2Emails.has(appEmail)
    const currentStage = (app.pipeline_stage as number) || 1

    if (hasStage2 && currentStage < 3) {
      await serviceClient
        .from('job_applications')
        .update({ pipeline_stage: 3, pipeline_stage_updated_at: new Date().toISOString() })
        .eq('id', app.id)
      app.pipeline_stage = 3
      advanced++
    }

    app.has_stage2 = hasStage2
  }

  // Create records for Stage 2 orphans (no Stage 1 application)
  const orphanEmails = Array.from(stage2Emails).filter(email => !existingEmails.has(email))

  const newRecords: Record<string, unknown>[] = []
  for (const email of orphanEmails) {
    const { data: inserted, error: insertError } = await serviceClient
      .from('job_applications')
      .insert({
        email,
        full_name: email,
        position: 'dm_setter',
        pipeline_stage: 3,
        pipeline_stage_updated_at: new Date().toISOString(),
        status: 'pending',
      })
      .select()
      .single()

    if (!insertError && inserted) {
      inserted.has_stage2 = true
      newRecords.push(inserted)
      created++
    }
  }

  // Combine and re-sort
  const allApps = [...(applications || []), ...newRecords]
    .sort((a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime())

  // If sync was requested, include stats in response
  if (sync) {
    return NextResponse.json({ applications: allApps, sync: { advanced, created } })
  }

  return NextResponse.json(allApps)
}
