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
    // First time — create profile from metadata
    // For email/password signup: metadata has full_name, phone, role, matric_number
    // For Google OAuth: only full_name (from Google), phone is missing
    const role = (meta.role as string) || 'customer'
    // Detect OAuth providers — google sets meta.iss/provider, name/full_name from profile
    const isOAuth = !!(meta.iss || meta.provider_id || user.app_metadata?.provider === 'google')
    const fullName = meta.full_name || meta.name || ''
    const phone    = meta.phone || ''

    const { error: insertErr } = await admin.from('users').insert({
      id:              user.id,
      email:           user.email ?? '',
      full_name:       fullName,
      phone,
      role,
      matric_number:   meta.matric_number ?? null,
      is_active:       true,
      onboarding_done: false,
    })

    if (insertErr) {
      const r = NextResponse.redirect(`${origin}/signup?error=profile_failed`)
      tempResponse.cookies.getAll().forEach(c => r.cookies.set(c.name, c.value, { path: '/' }))
      return r
    }

    if (role === 'runner') {
      await admin.from('runner_profiles').insert({
        user_id: user.id, is_available: false,
        total_deliveries: 0, total_earnings: 0, rating: 5.0,
      })
    }

    // Routing for first-time users:
    //   - OAuth without phone → /complete-profile to capture missing details
    //   - Email/password (has phone in meta) → /verified (email confirm flow) or dashboard
    if (isOAuth || !phone) {
      dest = '/complete-profile'
    } else {
      dest = next ?? (role === 'runner' ? '/dashboard' : '/verified')
    }

  } else {
    // Returning user — verify profile completeness, route by role
    // Fetch full profile to check phone (the only field that may be missing for OAuth users)
    const { data: full } = await admin
      .from('users')
      .select('phone, full_name')
      .eq('id', user.id)
      .single()

    if (!full?.phone || !full?.full_name) {
      dest = '/complete-profile'
    } else {
      const roleMap: Record<string, string> = {
        customer: existing.onboarding_done ? '/home' : '/onboarding',
        runner:   '/dashboard',
        admin:    '/admin/dashboard',
      }
      dest = roleMap[existing.role ?? 'customer'] ?? '/home'
    }
  }

  const finalResponse = NextResponse.redirect(`${origin}${dest}`)
  tempResponse.cookies.getAll().forEach(c => {
    finalResponse.cookies.set(c.name, c.value, { path: '/' })
  })
  return finalResponse
}
