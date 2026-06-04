'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff } from 'lucide-react'
import { friendlySignupError, validateEmail, validateFullName, validatePassword, validatePhone } from '@/lib/auth-errors'
import { GoogleSignInButton } from '@/components/ui/GoogleSignInButton'
import type { UserRole } from '@/types'

export default function SignupForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const supabase     = createClient()
  const submitting   = useRef(false)

  const [role,         setRole]         = useState<UserRole>((searchParams.get('role') as UserRole) || 'customer')
  const [fullName,     setFullName]     = useState('')
  const [email,        setEmail]        = useState('')
  const [phone,        setPhone]        = useState('')
  const [matricNumber, setMatricNumber] = useState('')
  const [department,   setDepartment]   = useState('')
  const [password,     setPassword]     = useState('')
  const [showPass,     setShowPass]     = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')
  // Per-field errors
  const [fieldErrors,  setFieldErrors]  = useState<Record<string, string>>({})

  // Redirect already-authenticated users
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/home')
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const campusDomains = ['rsu.edu.ng', 'babcock.edu.ng', 'abuad.edu.ng', 'covenantuniversity.edu.ng']
  const isCampusDomain = campusDomains.some(d => email.toLowerCase().endsWith('@' + d))

  function validate(): boolean {
    const errs: Record<string, string> = {}
    const nameErr = validateFullName(fullName)
    if (nameErr) errs.fullName = nameErr
    const phoneErr = validatePhone(phone)
    if (phoneErr) errs.phone = phoneErr
    const emailErr = validateEmail(email)
    if (emailErr) errs.email = emailErr
    const passErr = validatePassword(password)
    if (passErr) errs.password = passErr
    if (role === 'runner' && !matricNumber.trim()) errs.matric = 'Matric number is required'
    if (role === 'runner' && !department.trim())   errs.department = 'Department is required'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (submitting.current) return
    if (!validate()) return
    submitting.current = true
    setLoading(true); setError('')

    // Step 1: create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name:     fullName,
          phone:         phone,
          role:          role,
          matric_number: role === 'runner' ? matricNumber.trim() : null,
        },
        // Redirect to verified page so user sees confirmation success
        emailRedirectTo: `${window.location.origin}/api/auth/callback?next=/verified`,
      },
    })
    if (authError) {
      setError(friendlySignupError(authError.message))
      setLoading(false); submitting.current = false; return
    }
    if (!authData.user) {
      setError('Something went wrong. Please try again.')
      setLoading(false); submitting.current = false; return
    }

    // Email confirmation required (Supabase returns user but no session)
    if (!authData.session) {
      setLoading(false); submitting.current = false
      // Show email confirmation screen
      setShowConfirm(true); return
    }

    // Step 2: create profile via server route (uses admin client, bypasses RLS)
    // Rollback (delete auth user) happens server-side if this fails
    const res = await fetch('/api/auth/create-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id:            authData.user.id,
        email,
        phone,
        full_name:     fullName,
        role,
        matric_number: role === 'runner' ? matricNumber.trim() : null,
      }),
    })

    const { error: profileError } = await res.json()
    if (profileError) {
      setError(profileError)
      setLoading(false); submitting.current = false; return
    }

    // Runner: redirect to apply-runner page which shows pending approval state
    router.push(role === 'runner' ? '/apply-runner' : '/onboarding')
  }

  const [showConfirm, setShowConfirm] = useState(false)

  const inp: React.CSSProperties = {
    display: 'block', width: '100%',
    background: '#111110', border: '1.5px solid #2A2825',
    borderRadius: 14, padding: '16px 48px 16px 16px',
    fontSize: 15, fontWeight: 600, fontFamily: 'inherit',
    outline: 'none', color: 'white', boxSizing: 'border-box',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  }
  const inpNoIcon: React.CSSProperties = { ...inp, paddingRight: 16 }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 800, color: '#6B6660', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.1em' }
  const ferr: React.CSSProperties = { fontSize: 11, color: '#FF3B30', fontWeight: 700, marginTop: 5 }
  const focus = (e: React.FocusEvent<HTMLInputElement>) => { e.target.style.borderColor = '#FF6B2B'; e.target.style.boxShadow = '0 0 0 3px rgba(255,107,43,0.1)' }
  const blur  = (e: React.FocusEvent<HTMLInputElement>) => { e.target.style.borderColor = '#2A2825'; e.target.style.boxShadow = 'none' }

  if (showConfirm) return (
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: '#0C0B09', fontFamily: "'Nunito', system-ui, sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 28px' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 20 }}>📬</div>
        <h2 className="font-display" style={{ fontSize: 28, color: 'white', margin: '0 0 12px' }}>Confirm your email</h2>
        <p style={{ fontSize: 14, color: '#6B6660', fontWeight: 600, lineHeight: 1.6, margin: '0 0 24px' }}>
          We sent a confirmation link to<br /><b style={{ color: 'white' }}>{email}</b><br />Tap it to activate your account.
        </p>
        <p style={{ fontSize: 12, color: '#3A3830', fontWeight: 600 }}>
          Already confirmed?{' '}<Link href="/login" style={{ color: '#FF6B2B', fontWeight: 800 }}>Log in</Link>
        </p>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: '#0C0B09', fontFamily: "'Nunito', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>

      {/* Logo */}
      <div style={{ padding: '52px 28px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: '#FF6B2B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>⚡</span>
        </div>
        <span className="font-display" style={{ fontSize: 18, color: 'white', letterSpacing: '-0.01em' }}>CampusRun</span>
      </div>

      {/* Hero */}
      <div className="dot-texture" style={{ padding: '28px 28px 32px' }}>
        <p className="label-cap fade-up-1" style={{ color: '#FF6B2B', fontSize: 10, margin: '0 0 10px', letterSpacing: '0.15em' }}>
          {role === 'runner' ? 'BECOME A RUNNER' : 'JOIN TODAY'}
        </p>
        <h1 className="font-display fade-up-2" style={{ fontSize: 44, color: 'white', lineHeight: 1.0, margin: '0 0 10px', letterSpacing: '-0.02em' }}>
          {role === 'runner' ? <>Earn between<br />classes.</> : <>Food at<br />your door.</>}
        </h1>
        <p className="fade-up-3" style={{ fontSize: 14, color: '#6B6660', fontWeight: 600, margin: 0 }}>
          {role === 'runner' ? '₦300 per delivery. Peak bonus. Cash out anytime.' : 'From the restaurant to your block, fast.'}
        </p>
      </div>

      <div style={{ flex: 1, padding: '0 28px 48px', overflowY: 'auto' }}>

        {/* Role tabs */}
        <div style={{ display: 'flex', gap: 6, background: '#1A1917', padding: 5, borderRadius: 14, marginBottom: 24, border: '1px solid #2A2825' }}>
          {(['customer', 'runner'] as UserRole[]).map(r => (
            <button key={r} type="button" onClick={() => { setRole(r); setMatricNumber(''); setError(''); setFieldErrors({}) }} className="press"
              style={{ flex: 1, padding: '11px 8px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 14, fontFamily: 'inherit', transition: 'all 0.15s', background: role === r ? '#FF6B2B' : 'transparent', color: role === r ? 'white' : '#6B6660' }}>
              {r === 'customer' ? '🍽️ Order food' : '🛵 Earn money'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          <div>
            <label style={lbl}>Full name</label>
            <input style={inpNoIcon} type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Tunde Adeyemi" required onFocus={focus} onBlur={blur} />
            {fieldErrors.fullName && <p style={ferr}>{fieldErrors.fullName}</p>}
          </div>

          <div>
            <label style={lbl}>Phone number</label>
            <input style={inpNoIcon} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="08012345678" required onFocus={focus} onBlur={blur} />
            {fieldErrors.phone && <p style={ferr}>{fieldErrors.phone}</p>}
          </div>

          <div>
            <label style={lbl}>Email</label>
            <input style={inpNoIcon} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@rsu.edu.ng" required onFocus={focus} onBlur={blur} />
            {isCampusDomain && !fieldErrors.email && (
              <p style={{ fontSize: 11, color: '#1DB954', fontWeight: 800, margin: '5px 0 0', letterSpacing: '0.06em', textTransform: 'uppercase' }}>✓ Verified campus domain</p>
            )}
            {fieldErrors.email && <p style={ferr}>{fieldErrors.email}</p>}
          </div>

          <div>
            <label style={lbl}>Password</label>
            <div style={{ position: 'relative' }}>
              <input style={inp} type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters" required minLength={8} onFocus={focus} onBlur={blur} />
              <button type="button" onClick={() => setShowPass(v => !v)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#6B6660', display: 'flex', alignItems: 'center', padding: 0 }}>
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {fieldErrors.password && <p style={ferr}>{fieldErrors.password}</p>}
          </div>

          {role === 'runner' && (
            <>
              <div>
                <label style={lbl}>Department</label>
                <input style={inpNoIcon} type="text" value={department}
                  onChange={e => setDepartment(e.target.value)}
                  placeholder="e.g. Computer Science" required
                  onFocus={focus} onBlur={blur} />
                {fieldErrors.department && <p style={ferr}>{fieldErrors.department}</p>}
              </div>
              <div>
                <label style={lbl}>Matric number</label>
                <input style={inpNoIcon} type="text" value={matricNumber} onChange={e => setMatricNumber(e.target.value)} placeholder="RSU/2021/001234" required onFocus={focus} onBlur={blur} />
                {fieldErrors.matric && <p style={ferr}>{fieldErrors.matric}</p>}
              </div>
              <div style={{ background: 'rgba(255,107,43,0.08)', border: '1px solid rgba(255,107,43,0.2)', borderRadius: 12, padding: '12px 14px', fontSize: 13, fontWeight: 700, color: '#FF6B2B', lineHeight: 1.6 }}>
                ₦300/delivery &nbsp;·&nbsp; Cash out any time
              </div>
            </>
          )}

          {error && (
            <div style={{ background: 'rgba(255,59,48,0.08)', color: '#FF3B30', borderRadius: 12, padding: '12px 14px', fontSize: 13, fontWeight: 700, border: '1px solid rgba(255,59,48,0.2)' }}>{error}</div>
          )}

          <button type="submit" disabled={loading} className="press"
            style={{ width: '100%', background: '#FF6B2B', color: 'white', fontWeight: 900, fontSize: 16, padding: '16px', borderRadius: 14, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', marginTop: 4, fontFamily: 'inherit', opacity: loading ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {loading ? 'Creating account…' : <>Create account <span style={{ fontSize: 18 }}>→</span></>}
          </button>
        </form>

        <div style={{ marginTop: 18 }}>
          <GoogleSignInButton mode="signup" />
        </div>

        <p style={{ textAlign: 'center', fontSize: 13, color: '#3A3830', fontWeight: 600, marginTop: 24 }}>
          Already have an account?{' '}<Link href="/login" style={{ color: '#FF6B2B', fontWeight: 800 }}>Log in</Link>
        </p>
        <p style={{ textAlign: 'center', fontSize: 11, color: '#2A2825', fontWeight: 600, marginTop: 12, lineHeight: 1.6 }}>By signing up you agree to our terms.</p>
      </div>
    </div>
  )
}
