// app/api/auth/callback/route.ts
// Handles the redirect from Supabase OAuth (Google).
// Exchanges the code for a session, creates the user profile on first sign-in,
// then routes to the right page.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code  = searchParams.get('code')
  const next  = searchParams.get('next') ?? '/home'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  // Exchange code for session using a response-aware client
  const response = NextResponse.redirect(`${origin}${next}`)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => request.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !sessionData?.user) {
    return NextResponse.redirect(`${origin}/login?error=oauth_failed`)
  }

  const user = sessionData.user

  // Check if profile already exists
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('users')
    .select('role, onboarding_done')
    .eq('id', user.id)
    .single()

  if (!existing) {
    // First-time OAuth sign-in — create profile
    await admin.from('users').insert({
      id:               user.id,
      email:            user.email ?? '',
      full_name:        user.user_metadata?.full_name ?? user.user_metadata?.name ?? '',
      phone:            user.user_metadata?.phone ?? '',
      role:             'customer',
      is_active:        true,
      onboarding_done:  false,
    })
    // New user → onboarding
    const redirectResponse = NextResponse.redirect(`${origin}/onboarding`)
    supabase.auth  // cookies already set on the response above; rebuild for new redirect
    // Re-set cookies on the new redirect response
    response.cookies.getAll().forEach(c => {
      redirectResponse.cookies.set(c.name, c.value, { path: '/' })
    })
    return redirectResponse
  }

  // Existing user — route by role
  const roleMap: Record<string, string> = {
    customer: '/home',
    runner:   '/dashboard',
    admin:    '/admin/dashboard',
  }
  const dest = roleMap[existing.role ?? 'customer'] ?? '/home'
  const finalResponse = NextResponse.redirect(`${origin}${dest}`)
  response.cookies.getAll().forEach(c => {
    finalResponse.cookies.set(c.name, c.value, { path: '/' })
  })
  return finalResponse
}
