'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Mail } from 'lucide-react'
import { friendlyAuthError } from '@/lib/auth-errors'
import { GoogleSignInButton } from '@/components/ui/GoogleSignInButton'

function LoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const supabase     = createClient()
  const submitting   = useRef(false)

  const [email,        setEmail]        = useState('')
  const [password,     setPassword]     = useState('')
  const [showPass,     setShowPass]     = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [magicLoading, setMagicLoading] = useState(false)
  const [magicSent,    setMagicSent]    = useState(false)
  const [error,        setError]        = useState(
    searchParams.get('error') === 'auth_failed' ? 'Sign-in link expired or invalid. Please try again.' : ''
  )
  const [mode, setMode]                 = useState<'login' | 'forgot'>('login')
  const [forgotSent,   setForgotSent]   = useState(false)

  // Redirect already-authenticated users
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/home')
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const campusDomains = ['rsu.edu.ng', 'babcock.edu.ng', 'abuad.edu.ng', 'covenantuniversity.edu.ng']
  const isCampusDomain = campusDomains.some(d => email.toLowerCase().endsWith('@' + d))

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setLoading(true); setError('')
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError(friendlyAuthError(authError.message))
      setLoading(false); submitting.current = false; return
    }
    if (data.user) {
      const { data: profile } = await supabase.from('users').select('role').eq('id', data.user.id).single()
      const map: Record<string, string> = { customer: '/home', runner: '/dashboard', admin: '/admin/dashboard' }
      router.push(map[profile?.role ?? 'customer'])
    }
  }

  async function handleMagicLink() {
    if (!email) { setError('Enter your email address first.'); return }
    if (submitting.current) return
    submitting.current = true
    setMagicLoading(true); setError('')
    const { error: magicError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
    })
    setMagicLoading(false); submitting.current = false
    if (magicError) { setError(friendlyAuthError(magicError.message)); return }
    setMagicSent(true)
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setLoading(true); setError('')
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false); submitting.current = false
    if (resetError) { setError(friendlyAuthError(resetError.message)); return }
    setForgotSent(true)
  }

  const inputStyle: React.CSSProperties = {
    display: 'block', width: '100%',
    background: '#111110', border: '1.5px solid #2A2825',
    borderRadius: 14, padding: '16px 48px 16px 16px',
    fontSize: 15, fontWeight: 600, fontFamily: 'inherit',
    outline: 'none', color: 'white', boxSizing: 'border-box',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  }
  const lbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 800, color: '#6B6660',
    textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 7,
  }
  const focus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = '#FF6B2B'; e.target.style.boxShadow = '0 0 0 3px rgba(255,107,43,0.1)'
  }
  const blur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = '#2A2825'; e.target.style.boxShadow = 'none'
  }

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
      <div className="dot-texture" style={{ padding: '32px 28px 36px' }}>
        {mode === 'forgot' ? (
          <>
            <p className="label-cap fade-up-1" style={{ color: '#FF6B2B', fontSize: 10, margin: '0 0 10px', letterSpacing: '0.15em' }}>RESET</p>
            <h1 className="font-display fade-up-2" style={{ fontSize: 40, color: 'white', lineHeight: 1.0, margin: '0 0 10px', letterSpacing: '-0.02em' }}>Forgot your<br />password?</h1>
            <p className="fade-up-3" style={{ fontSize: 14, color: '#6B6660', fontWeight: 600, margin: 0 }}>We'll send a reset link to your email.</p>
          </>
        ) : (
          <>
            <p className="label-cap fade-up-1" style={{ color: '#FF6B2B', fontSize: 10, margin: '0 0 10px', letterSpacing: '0.15em' }}>HEY AGAIN</p>
            <h1 className="font-display fade-up-2" style={{ fontSize: 48, color: 'white', lineHeight: 1.0, margin: '0 0 10px', letterSpacing: '-0.02em' }}>Pick up where<br />you left off.</h1>
            <p className="fade-up-3" style={{ fontSize: 14, color: isCampusDomain && email ? '#1DB954' : '#6B6660', fontWeight: isCampusDomain && email ? 800 : 600, margin: 0 }}>
              {isCampusDomain && email ? '✓ Verified campus domain' : 'Log in to order, track, or earn.'}
            </p>
          </>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '0 28px 48px' }}>
        {mode === 'forgot' && forgotSent ? (
          <div className="fade-up-1" style={{ background: 'rgba(29,185,84,0.08)', border: '1px solid rgba(29,185,84,0.2)', borderRadius: 16, padding: '28px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>📬</div>
            <p style={{ fontWeight: 900, fontSize: 17, color: '#1DB954', margin: '0 0 8px' }}>Check your inbox</p>
            <p style={{ fontSize: 13, color: '#6B6660', fontWeight: 600, margin: '0 0 20px', lineHeight: 1.5 }}>Reset link sent to <b style={{ color: 'white' }}>{email}</b></p>
            <button onClick={() => { setMode('login'); setForgotSent(false) }} style={{ background: 'none', border: 'none', color: '#FF6B2B', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>← Back to login</button>
          </div>

        ) : mode === 'forgot' ? (
          <form onSubmit={handleForgot} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={lbl}>Email</label>
              <input style={{ ...inputStyle, paddingRight: 16 }} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@rsu.edu.ng" required onFocus={focus} onBlur={blur} />
            </div>
            {error && <div style={{ background: 'rgba(255,59,48,0.08)', color: '#FF3B30', borderRadius: 12, padding: '12px 14px', fontSize: 13, fontWeight: 700, border: '1px solid rgba(255,59,48,0.2)' }}>{error}</div>}
            <button type="submit" disabled={loading} className="press" style={{ width: '100%', background: '#FF6B2B', color: 'white', fontWeight: 900, fontSize: 16, padding: '16px', borderRadius: 14, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
            <button type="button" onClick={() => { setMode('login'); setError('') }} style={{ background: 'none', border: 'none', color: '#6B6660', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0' }}>← Back to login</button>
          </form>

        ) : magicSent ? (
          <div className="fade-up-1" style={{ background: 'rgba(29,185,84,0.08)', border: '1px solid rgba(29,185,84,0.2)', borderRadius: 16, padding: '28px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>✉️</div>
            <p style={{ fontWeight: 900, fontSize: 17, color: '#1DB954', margin: '0 0 8px' }}>Magic link sent</p>
            <p style={{ fontSize: 13, color: '#6B6660', fontWeight: 600, margin: '0 0 20px', lineHeight: 1.5 }}>Check <b style={{ color: 'white' }}>{email}</b> — tap the link to sign in.</p>
            <button onClick={() => { setMagicSent(false); submitting.current = false }} style={{ background: 'none', border: 'none', color: '#FF6B2B', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Use password instead</button>
          </div>

        ) : (
          <>
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lbl}>Email</label>
                <input style={{ ...inputStyle, paddingRight: 16 }} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@rsu.edu.ng" required onFocus={focus} onBlur={blur} />
                {isCampusDomain && email && (
                  <p style={{ fontSize: 11, color: '#1DB954', fontWeight: 800, margin: '5px 0 0', letterSpacing: '0.06em', textTransform: 'uppercase' }}>✓ Verified campus domain</p>
                )}
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
                  <label style={{ ...lbl, marginBottom: 0 }}>Password</label>
                  <button type="button" onClick={() => { setMode('forgot'); setError('') }} style={{ background: 'none', border: 'none', color: '#FF6B2B', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Forgot?</button>
                </div>
                <div style={{ position: 'relative' }}>
                  <input style={inputStyle} type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required onFocus={focus} onBlur={blur} />
                  <button type="button" onClick={() => setShowPass(v => !v)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#6B6660', display: 'flex', alignItems: 'center', padding: 0 }}>
                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              {error && <div style={{ background: 'rgba(255,59,48,0.08)', color: '#FF3B30', borderRadius: 12, padding: '12px 14px', fontSize: 13, fontWeight: 700, border: '1px solid rgba(255,59,48,0.2)' }}>{error}</div>}
              <button type="submit" disabled={loading} className="press" style={{ width: '100%', background: '#FF6B2B', color: 'white', fontWeight: 900, fontSize: 16, padding: '16px', borderRadius: 14, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: loading ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {loading ? 'Logging in…' : <>Log in <span style={{ fontSize: 18 }}>→</span></>}
              </button>
            </form>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
              <div style={{ flex: 1, height: 1, background: '#2A2825' }} />
              <span style={{ fontSize: 12, color: '#3A3830', fontWeight: 700 }}>OR</span>
              <div style={{ flex: 1, height: 1, background: '#2A2825' }} />
            </div>

            <button onClick={handleMagicLink} disabled={magicLoading} className="press" style={{ width: '100%', background: '#1A1917', color: '#A09A8E', fontWeight: 800, fontSize: 15, padding: '15px', borderRadius: 14, border: '1px solid #2A2825', cursor: magicLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: magicLoading ? 0.6 : 1 }}>
              <Mail size={18} />
              {magicLoading ? 'Sending…' : 'Email me a magic link'}
            </button>

            <div style={{ marginTop: 8 }}>
              <GoogleSignInButton mode="signin" />
            </div>
          </>
        )}

        <p style={{ textAlign: 'center', fontSize: 13, color: '#3A3830', fontWeight: 600, marginTop: 28 }}>
          New here?{' '}<Link href="/signup" style={{ color: '#FF6B2B', fontWeight: 800 }}>Create account</Link>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0C0B09', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="font-display" style={{ color: '#FF6B2B', fontSize: 14 }}>Loading…</span></div>}>
      <LoginForm />
    </Suspense>
  )
}
