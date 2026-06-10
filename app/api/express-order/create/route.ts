// app/api/express-order/create/route.ts
// Express signup: creates an account from name + phone + (optional) email,
// signs the user in via magic-link OTP, and returns a session token URL
// they can be redirected to.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/sentry'

export async function POST(req: NextRequest) {
  const { name, phone, email } = await req.json()

  if (!name || !phone) {
    return NextResponse.json({ error: 'Name and phone are required' }, { status: 400 })
  }
  if (name.trim().length < 2) {
    return NextResponse.json({ error: 'Please enter your full name' }, { status: 400 })
  }

  // Nigerian phone validation — must match before we create anything
  const cleanPhone = phone.replace(/\s|-/g, '')
  if (!/^(\+?234|0)[789][01]\d{8}$/.test(cleanPhone)) {
    return NextResponse.json({ error: 'Please enter a valid Nigerian phone number' }, { status: 400 })
  }

  // Normalize phone to +234 format
  let normalizedPhone = cleanPhone
  if (cleanPhone.startsWith('0')) normalizedPhone = '+234' + cleanPhone.slice(1)
  else if (cleanPhone.startsWith('234')) normalizedPhone = '+' + cleanPhone
  else if (!cleanPhone.startsWith('+')) normalizedPhone = '+' + cleanPhone

  // Generate a placeholder email if not provided
  const userEmail = email?.trim() ||
    `${normalizedPhone.replace(/[^0-9]/g, '')}@express.campusrun.food`

  const admin = createAdminClient()

  // Check if a user with this phone already exists
  const { data: existingUser } = await admin
    .from('users')
    .select('id, email, full_name, phone')
    .eq('phone', normalizedPhone)
    .maybeSingle()

  if (existingUser) {
    // Existing user — generate a magic link to sign them in
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: existingUser.email,
      options: { redirectTo: `${req.nextUrl.origin}/api/auth/callback?next=/checkout` },
    })

    if (linkErr || !linkData?.properties?.action_link) {
      captureError(linkErr || new Error('Magic link generation failed'), {
        tags: { event: 'express_login_failed' },
        extra: { phone: normalizedPhone },
      })
      return NextResponse.json({ error: 'Could not log you in. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({
      action: 'login',
      magic_link: linkData.properties.action_link,
      existing: true,
    })
  }

  // Create a new auth user
  const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
    email: userEmail,
    email_confirm: true, // skip email confirmation for express users
    user_metadata: {
      full_name: name.trim(),
      phone:     normalizedPhone,
      signup_source: 'express',
    },
  })

  if (createErr || !newUser.user) {
    // If the failure is because the email/phone already exists, attempt a login flow
    if (createErr?.message?.includes('already')) {
      return NextResponse.json({ error: 'An account with this phone already exists. Please log in.' }, { status: 409 })
    }
    captureError(createErr || new Error('Express user create failed'), {
      tags: { event: 'express_signup_failed' },
      extra: { phone: normalizedPhone, email: userEmail },
    })
    return NextResponse.json({ error: 'Could not create your account. Please try again.' }, { status: 500 })
  }

  // Insert the user profile row
  const { error: insertErr } = await admin.from('users').insert({
    id:                   newUser.user.id,
    email:                userEmail,
    full_name:            name.trim(),
    phone:                normalizedPhone,
    role:                 'customer',
    is_active:            true,
    onboarding_done:      true,         // skip the tutorial — they're already ordering
    signup_source:        'express',
    express_acknowledged: false,         // will trigger post-delivery acknowledgment
    chat_intro_seen:      false,
  })

  if (insertErr) {
    captureError(insertErr, { tags: { event: 'express_profile_create_failed' }, extra: { userId: newUser.user.id } })
    return NextResponse.json({ error: 'Account created but profile failed. Please try again.' }, { status: 500 })
  }

  // Generate a magic link to sign them in immediately
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: userEmail,
    options: { redirectTo: `${req.nextUrl.origin}/api/auth/callback?next=/checkout` },
  })

  if (linkErr || !linkData?.properties?.action_link) {
    captureError(linkErr || new Error('Magic link generation failed for new express user'), {
      tags: { event: 'express_magic_link_failed' },
      extra: { userId: newUser.user.id },
    })
    return NextResponse.json({ error: 'Account created but auto-login failed. Please try logging in.' }, { status: 500 })
  }

  return NextResponse.json({
    action: 'signup',
    magic_link: linkData.properties.action_link,
    existing: false,
    user_id: newUser.user.id,
  })
}
