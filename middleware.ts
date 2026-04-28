import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

type UserRole = 'admin' | 'closer' | 'setter' | 'csm_spc' | 'csm_ht'

const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  '/dashboard':          ['admin'],
  '/sales':              ['admin', 'csm_spc', 'csm_ht'],
  '/llamadas':           ['admin', 'closer'],
  '/spc':                ['admin', 'csm_spc'],
  '/students':           ['admin', 'csm_ht'],
  '/equipo/csm':         ['admin', 'csm_ht'],
  '/equipo/spc':         ['admin', 'csm_spc'],
  '/equipo/setter':      ['admin', 'setter'],
  '/equipo/closer':      ['admin', 'closer'],
  '/equipo/profiles':    ['admin'],
  '/goals':              ['admin'],
  '/surveys':            ['admin'],
  '/settings':           ['admin', 'closer', 'setter', 'csm_spc', 'csm_ht'],
}

const ROLE_HOME: Record<UserRole, string> = {
  admin:   '/dashboard',
  closer:  '/llamadas',
  setter:  '/equipo/setter',
  csm_spc: '/spc',
  csm_ht:  '/students',
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { pathname } = request.nextUrl

  // Public routes — no auth required
  const PUBLIC_PATHS = ['/login', '/auth/setup', '/auth/callback', '/apply']
  if (
    pathname.startsWith('/api/webhooks') ||
    pathname.startsWith('/api/invite') ||
    pathname.startsWith('/api/surveys') ||
    pathname === '/api/sales/backfill' ||
    pathname === '/api/spc/backfill-csv' ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
  ) {
    return NextResponse.next()
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/login') {
    // Will redirect to role home after profile check below
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    const role = profile?.role as UserRole | undefined
    const home = role ? ROLE_HOME[role] : '/dashboard'
    const url = request.nextUrl.clone()
    url.pathname = home
    return NextResponse.redirect(url)
  }

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const role = profile?.role as UserRole | undefined

    // No profile yet (e.g. admin before migration) — let through
    if (!role) return supabaseResponse

    // Redirect root to role home
    if (pathname === '/') {
      const url = request.nextUrl.clone()
      url.pathname = ROLE_HOME[role]
      return NextResponse.redirect(url)
    }

    // Check route permissions
    const matchedRoute = Object.keys(ROUTE_PERMISSIONS).find(route =>
      pathname === route || pathname.startsWith(route + '/')
    )

    if (matchedRoute) {
      const allowed = ROUTE_PERMISSIONS[matchedRoute]
      if (!allowed.includes(role)) {
        const url = request.nextUrl.clone()
        url.pathname = ROLE_HOME[role]
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
