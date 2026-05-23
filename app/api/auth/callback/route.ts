// app/api/auth/callback/route.ts
// Handles Supabase auth redirects: email confirmation links, magic links.
// Exchanges code for session, creates profile if first-time, routes by role.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') // e.g. /verified

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const tempResponse = NextResponse.redirect(`${origin}/home`)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value, options }) => {
            tempResponse.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !sessionData?.user) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  const user     = sessionData.user
  const meta     = user.user_metadata ?? {}
  const admin    = createAdminClient()

  // Check if profile already exists
  const { data: existing } = await admin
    .from('users')
    .select('role, onboarding_done')
    .eq('id', user.id)
    .single()

  let dest: string

  if (!existing) {
    // First time — create profile from metadata collected during signup
    const role = (meta.role as string) || 'customer'

    const { error: insertErr } = await admin.from('users').insert({
      id:              user.id,
      email:           user.email ?? '',
      full_name:       meta.full_name ?? '',
      phone:           meta.phone ?? '',
      role,
      matric_number:   meta.matric_number ?? null,
      is_active:       true,
      onboarding_done: false,
    })

    if (insertErr) {
      // Profile creation failed — redirect to signup with error
      const r = NextResponse.redirect(`${origin}/signup?error=profile_failed`)
      tempResponse.cookies.getAll().forEach(c => r.cookies.set(c.name, c.value, { path: '/' }))
      return r
    }

    // Create runner profile if needed
    if (role === 'runner') {
      await admin.from('runner_profiles').insert({
        user_id: user.id, is_available: false,
        total_deliveries: 0, total_earnings: 0, rating: 5.0,
      })
    }

    // next==/verified means they came from email confirmation link
    dest = next ?? (role === 'runner' ? '/dashboard' : '/verified')

  } else {
    // Returning user — route by role, check onboarding
    const roleMap: Record<string, string> = {
      customer: existing.onboarding_done ? '/home' : '/onboarding',
      runner:   '/dashboard',
      admin:    '/admin/dashboard',
    }
    dest = roleMap[existing.role ?? 'customer'] ?? '/home'
  }

  const finalResponse = NextResponse.redirect(`${origin}${dest}`)
  tempResponse.cookies.getAll().forEach(c => {
    finalResponse.cookies.set(c.name, c.value, { path: '/' })
  })
  return finalResponse
}
