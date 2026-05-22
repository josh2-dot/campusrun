// lib/auth-errors.ts
// Maps raw Supabase auth and Postgres error strings to friendly user-facing messages.
// Never expose raw DB errors to users.

export function friendlyAuthError(raw: string): string {
  const msg = raw.toLowerCase()

  // ── Supabase Auth errors ─────────────────────────────────
  if (msg.includes('invalid login credentials'))
    return 'Wrong email or password. Please try again.'
  if (msg.includes('user already registered') || msg.includes('already been registered'))
    return 'An account already exists with this email. Log in instead.'
  if (msg.includes('email not confirmed'))
    return 'Please confirm your email first. Check your inbox.'
  if (msg.includes('password should be at least'))
    return 'Password must be at least 8 characters.'
  if (msg.includes('unable to validate email address'))
    return 'That email address doesn\'t look valid. Please check it.'
  if (msg.includes('email rate limit exceeded') || msg.includes('over_email_send_rate_limit'))
    return 'Too many attempts. Please wait a few minutes before trying again.'
  if (msg.includes('captcha'))
    return 'Security check failed. Please refresh the page and try again.'
  if (msg.includes('signup is disabled'))
    return 'Sign-ups are temporarily closed. Please check back soon.'

  // ── Postgres / RLS errors ────────────────────────────────
  if (msg.includes('row-level security') || msg.includes('rls'))
    return 'Account setup failed. Please try again or contact support.'
  if (msg.includes('duplicate key') || msg.includes('unique constraint'))
    return 'An account already exists with these details.'
  if (msg.includes('foreign key') || msg.includes('violates foreign key'))
    return 'Account setup failed. Please try again.'
  if (msg.includes('null value in column') || msg.includes('not-null constraint'))
    return 'Some required information is missing. Please fill in all fields.'
  if (msg.includes('value too long'))
    return 'One of your inputs is too long. Please shorten it.'
  if (msg.includes('connection') || msg.includes('network') || msg.includes('fetch'))
    return 'Connection problem. Please check your internet and try again.'

  // ── Generic fallback ─────────────────────────────────────
  return 'Something went wrong. Please try again.'
}

export function friendlySignupError(raw: string): string {
  // Specific signup context overrides
  const msg = raw.toLowerCase()
  if (msg.includes('user already registered') || msg.includes('already been registered') || msg.includes('duplicate key'))
    return 'An account already exists with this email.'
  return friendlyAuthError(raw)
}

// ── Client-side validators ────────────────────────────────────
export function validatePhone(phone: string): string | null {
  const cleaned = phone.replace(/\s+/g, '').replace(/^(\+234)/, '0')
  if (!/^0[789][01]\d{8}$/.test(cleaned))
    return 'Enter a valid Nigerian phone number (e.g. 08012345678)'
  return null
}

export function validateFullName(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed.length < 3) return 'Enter your full name'
  if (!trimmed.includes(' ')) return 'Enter both first and last name'
  return null
}

export function validateEmail(email: string): string | null {
  if (!email.includes('@') || !email.includes('.'))
    return 'Enter a valid email address'
  return null
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters'
  if (/^(.)\1+$/.test(password)) return 'Choose a stronger password'
  const weak = ['12345678', 'password', 'qwerty123', '11111111', 'abcdefgh']
  if (weak.includes(password.toLowerCase())) return 'Choose a stronger password'
  return null
}
