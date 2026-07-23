import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()

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

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const position = request.nextUrl.searchParams.get('position') || 'dm_setter'

  // Fetch all applications for this position
  const { data: applications, error } = await serviceClient
    .from('job_applications')
    .select('*')
    .eq('position', position)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Fetch all Stage 2 submissions to check which applicants have completed it
  const { data: stage2Submissions } = await serviceClient
    .from('dm_setter_stage2')
    .select('email')

  const stage2Emails = new Set(
    (stage2Submissions || []).map((s: { email: string }) => s.email.toLowerCase())
  )

  // Auto-advance: if applicant has Stage 2 AND pipeline_stage < 3, advance to 3
  const autoAdvancePromises: PromiseLike<unknown>[] = []
  const results = (applications || []).map((app: Record<string, unknown>) => {
    const hasStage2 = stage2Emails.has((app.email as string).toLowerCase())
    const currentStage = (app.pipeline_stage as number) || 1

    if (hasStage2 && currentStage < 3) {
      // Auto-advance
      autoAdvancePromises.push(
        serviceClient
          .from('job_applications')
          .update({ pipeline_stage: 3, pipeline_stage_updated_at: new Date().toISOString() })
          .eq('id', app.id)
          .then()
      )
      return { ...app, pipeline_stage: 3, has_stage2: true }
    }

    return { ...app, has_stage2: hasStage2 }
  })

  // Execute auto-advance updates in background
  if (autoAdvancePromises.length > 0) {
    await Promise.all(autoAdvancePromises)
  }

  return NextResponse.json(results)
}
