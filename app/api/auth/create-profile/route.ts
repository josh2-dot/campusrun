// app/api/auth/create-profile/route.ts
// Server-side profile creation after signUp.
// Uses the admin client (bypasses RLS) and verifies the session matches the id.
// If profile insert fails, deletes the orphaned auth user so the user can retry.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { friendlySignupError } from '@/lib/auth-errors'

export async function POST(req: NextRequest) {
  const payload = await req.json()

  // ── Verify the session matches the id being inserted ────────
  // Build a server-side Supabase client that reads cookies from the request
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: () => {}, // read-only
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.id !== payload.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // ── Insert profile with admin client (bypasses RLS) ──────────
  const admin = createAdminClient()

  // Runners start as 'customer' role until admin approves their application.
  // runner_profiles is created only when admin approves.
  const isRunnerSignup = payload.role === 'runner'
  const { error: profileError } = await admin.from('users').insert({
    id:              payload.id,
    email:           payload.email,
    phone:           payload.phone ?? '',
    full_name:       payload.full_name ?? '',
    role:            isRunnerSignup ? 'customer' : (payload.role ?? 'customer'),
    matric_number:   payload.matric_number ?? null,
    is_active:       true,
    onboarding_done: isRunnerSignup ? true : false,
  })

  if (profileError) {
    // ── Rollback: delete the orphaned auth user ──────────────
    // The user has an auth account but no profile — if we don't delete it,
    // they're stuck in a broken state and can't sign up again.
    await admin.auth.admin.deleteUser(user.id)
    return NextResponse.json(
      { error: friendlySignupError(profileError.message) },
      { status: 400 }
    )
  }

  // ── Runner signup: create application, not profile ──────────
  // runner_profiles is created only when admin approves via /admin/applications
  if (isRunnerSignup) {
    await admin.from('runner_applications').insert({
      user_id:       payload.id,
      matric_number: payload.matric_number ?? '',
      department:    payload.department ?? '',
      status:        'pending',
      applied_at:    new Date().toISOString(),
    })
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/admin/notify-application`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicantName: payload.full_name, matricNumber: payload.matric_number }),
    }).catch(() => {})
  }

  return NextResponse.json({ success: true })
}
