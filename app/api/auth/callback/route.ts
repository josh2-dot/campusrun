// app/api/auth/callback/route.ts
// Handles redirects from Supabase: magic links.
// Exchanges the code for a session, creates profile for new users, routes by role.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

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

  const user = sessionData.user
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('users')
    .select('role, onboarding_done')
    .eq('id', user.id)
    .single()

  let dest: string

  if (!existing) {
    await admin.from('users').insert({
      id:              user.id,
      email:           user.email ?? '',
      full_name:       user.user_metadata?.full_name ?? user.user_metadata?.name ?? '',
      phone:           '',
      role:            'customer',
      is_active:       true,
      onboarding_done: false,
    })
    dest = '/onboarding'
  } else {
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
