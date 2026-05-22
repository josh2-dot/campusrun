'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Mail } from 'lucide-react'

function LoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const supabase     = createClient()

  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [showPass,    setShowPass]    = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [magicLoading,setMagicLoading]= useState(false)
  const [magicSent,   setMagicSent]   = useState(false)
  const [error,       setError]       = useState(
    searchParams.get('error') === 'oauth_failed' ? 'Sign-in failed. Please try again.' : ''
  )
  const [mode, setMode]               = useState<'login' | 'forgot'>('login')
  const [forgotSent,  setForgotSent]  = useState(false)

  // Campus domain detection
  const campusDomains = ['rsu.edu.ng', 'babcock.edu.ng', 'abuad.edu.ng', 'covenantuniversity.edu.ng']
  const isCampusDomain = campusDomains.some(d => email.toLowerCase().endsWith('@' + d))

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError(authError.message === 'Invalid login credentials'
        ? 'Wrong email or password. Try again.'
        : authError.message)
      setLoading(false); return
    }
    if (data.user) {
      const { data: profile } = await supabase.from('users').select('role').eq('id', data.user.id).single()
      const map: Record<string, string> = { customer: '/home', runner: '/dashboard', admin: '/admin/dashboard' }
      router.push(map[profile?.role ?? 'customer'])
    }
  }

  async function handleMagicLink() {
    if (!email) { setError('Enter your email first.'); return }
    setMagicLoading(true); setError('')
    const { error: magicError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
    })
    setMagicLoading(false)
    if (magicError) { setError(magicError.message); return }
    setMagicSent(true)
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (resetError) { setError(resetError.message); return }
    setForgotSent(true)
  }

  const inputWrap: React.CSSProperties = {
    position: 'relative',
  }
  const inputStyle: React.CSSProperties = {
    display: 'block', width: '100%',
    background: '#111110',
    border: '1.5px solid #2A2825',
    borderRadius: 14, padding: '16px 48px 16px 16px',
    fontSize: 15, fontWeight: 600, fontFamily: 'inherit',
    outline: 'none', color: 'white',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  }

  return (
    <div style={{
      maxWidth: 430, margin: '0 auto', minHeight: '100vh',
      background: '#0C0B09',
      fontFamily: "'Nunito', system-ui, sans-serif",
      display: 'flex', flexDirection: 'column',
    }}>

      {/* Top bar — logo */}
      <div style={{ padding: '52px 28px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: '#FF6B2B',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>⚡</span>
        </div>
        <span className="font-display" style={{ fontSize: 18, color: 'white', letterSpacing: '-0.01em' }}>
          CampusRun
        </span>
      </div>

      {/* Hero heading */}
      <div className="dot-texture" style={{ padding: '32px 28px 36px' }}>
        {mode === 'forgot' ? (
          <>
            <p className="label-cap fade-up-1" style={{ color: '#FF6B2B', fontSize: 10, margin: '0 0 10px', letterSpacing: '0.15em' }}>
              RESET
            </p>
            <h1 className="font-display fade-up-2" style={{
              fontSize: 42, color: 'white', lineHeight: 1.0,
              margin: '0 0 10px', letterSpacing: '-0.02em',
            }}>
              Forgot your password?
            </h1>
            <p className="fade-up-3" style={{ fontSize: 14, color: '#6B6660', fontWeight: 600, margin: 0 }}>
              We&apos;ll send a reset link to your email.
            </p>
          </>
        ) : (
          <>
            <p className="label-cap fade-up-1" style={{ color: '#FF6B2B', fontSize: 10, margin: '0 0 10px', letterSpacing: '0.15em' }}>
              HEY AGAIN
            </p>
            <h1 className="font-display fade-up-2" style={{
              fontSize: 48, color: 'white', lineHeight: 1.0,
              margin: '0 0 10px', letterSpacing: '-0.02em',
            }}>
              Pick up where<br />you left off.
            </h1>
            <p className="fade-up-3" style={{ fontSize: 14, color: '#6B6660', fontWeight: 600, margin: 0 }}>
              {isCampusDomain && email
                ? <span style={{ color: '#1DB954', fontWeight: 800 }}>✓ Verified campus domain</span>
                : 'Log in to order, track, or earn.'
              }
            </p>
          </>
        )}
      </div>

      {/* Form */}
      <div style={{ flex: 1, padding: '0 28px 48px' }}>

        {/* Forgot — success */}
        {mode === 'forgot' && forgotSent ? (
          <div className="fade-up-1" style={{
            background: 'rgba(29,185,84,0.08)', border: '1px solid rgba(29,185,84,0.2)',
            borderRadius: 16, padding: '28px 20px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>📬</div>
            <p style={{ fontWeight: 900, fontSize: 17, color: '#1DB954', margin: '0 0 8px' }}>Check your inbox</p>
            <p style={{ fontSize: 13, color: '#6B6660', fontWeight: 600, margin: '0 0 20px', lineHeight: 1.5 }}>
              Reset link sent to <b style={{ color: 'white' }}>{email}</b>
            </p>
            <button onClick={() => { setMode('login'); setForgotSent(false) }}
              style={{ background: 'none', border: 'none', color: '#FF6B2B', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
              ← Back to login
            </button>
          </div>

        ) : mode === 'forgot' ? (
          <form onSubmit={handleForgot} className="fade-up-1" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#6B6660', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Email</label>
              <div style={inputWrap}>
                <input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@rsu.edu.ng" required
                  onFocus={e => { e.target.style.borderColor = '#FF6B2B'; e.target.style.boxShadow = '0 0 0 3px rgba(255,107,43,0.1)' }}
                  onBlur={e => { e.target.style.borderColor = '#2A2825'; e.target.style.boxShadow = 'none' }} />
              </div>
            </div>
            {error && <div style={{ background: 'rgba(255,59,48,0.08)', color: '#FF3B30', borderRadius: 12, padding: '12px 14px', fontSize: 13, fontWeight: 700, border: '1px solid rgba(255,59,48,0.2)' }}>{error}</div>}
            <button type="submit" disabled={loading} className="press"
              style={{ width: '100%', background: '#FF6B2B', color: 'white', fontWeight: 900, fontSize: 16, padding: '16px', borderRadius: 14, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
            <button type="button" onClick={() => { setMode('login'); setError('') }}
              style={{ background: 'none', border: 'none', color: '#6B6660', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0' }}>
              ← Back to login
            </button>
          </form>

        ) : magicSent ? (
          <div className="fade-up-1" style={{
            background: 'rgba(29,185,84,0.08)', border: '1px solid rgba(29,185,84,0.2)',
            borderRadius: 16, padding: '28px 20px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>✉️</div>
            <p style={{ fontWeight: 900, fontSize: 17, color: '#1DB954', margin: '0 0 8px' }}>Magic link sent</p>
            <p style={{ fontSize: 13, color: '#6B6660', fontWeight: 600, margin: '0 0 20px', lineHeight: 1.5 }}>
              Check <b style={{ color: 'white' }}>{email}</b> — tap the link to sign in instantly.
            </p>
            <button onClick={() => setMagicSent(false)}
              style={{ background: 'none', border: 'none', color: '#FF6B2B', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
              Use password instead
            </button>
          </div>

        ) : (
          <>
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Email */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#6B6660', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Email</label>
                <div style={inputWrap}>
                  <input style={{ ...inputStyle, paddingRight: 16 }} type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@rsu.edu.ng" required
                    onFocus={e => { e.target.style.borderColor = '#FF6B2B'; e.target.style.boxShadow = '0 0 0 3px rgba(255,107,43,0.1)' }}
                    onBlur={e => { e.target.style.borderColor = '#2A2825'; e.target.style.boxShadow = 'none' }} />
                </div>
                {isCampusDomain && (
                  <p style={{ fontSize: 11, color: '#1DB954', fontWeight: 800, margin: '5px 0 0', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    ✓ Verified campus domain
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
                  <label style={{ fontSize: 11, fontWeight: 800, color: '#6B6660', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Password</label>
                  <button type="button" onClick={() => { setMode('forgot'); setError('') }}
                    style={{ background: 'none', border: 'none', color: '#FF6B2B', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                    Forgot?
                  </button>
                </div>
                <div style={{ ...inputWrap }}>
                  <input
                    style={inputStyle}
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" required
                    onFocus={e => { e.target.style.borderColor = '#FF6B2B'; e.target.style.boxShadow = '0 0 0 3px rgba(255,107,43,0.1)' }}
                    onBlur={e => { e.target.style.borderColor = '#2A2825'; e.target.style.boxShadow = 'none' }}
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#6B6660', display: 'flex', alignItems: 'center', padding: 0 }}>
                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <div style={{ background: 'rgba(255,59,48,0.08)', color: '#FF3B30', borderRadius: 12, padding: '12px 14px', fontSize: 13, fontWeight: 700, border: '1px solid rgba(255,59,48,0.2)' }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="press"
                style={{ width: '100%', background: '#FF6B2B', color: 'white', fontWeight: 900, fontSize: 16, padding: '16px', borderRadius: 14, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: loading ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {loading ? 'Logging in…' : <>Log in <span style={{ fontSize: 18 }}>→</span></>}
              </button>
            </form>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
              <div style={{ flex: 1, height: 1, background: '#2A2825' }} />
              <span style={{ fontSize: 12, color: '#3A3830', fontWeight: 700 }}>OR</span>
              <div style={{ flex: 1, height: 1, background: '#2A2825' }} />
            </div>

            {/* Magic link */}
            <button onClick={handleMagicLink} disabled={magicLoading} className="press"
              style={{ width: '100%', background: '#1A1917', color: '#A09A8E', fontWeight: 800, fontSize: 15, padding: '15px', borderRadius: 14, border: '1px solid #2A2825', cursor: magicLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: magicLoading ? 0.6 : 1 }}>
              <Mail size={18} />
              {magicLoading ? 'Sending…' : 'Email me a magic link'}
            </button>
          </>
        )}

        <p style={{ textAlign: 'center', fontSize: 13, color: '#3A3830', fontWeight: 600, marginTop: 28 }}>
          New here?{' '}
          <Link href="/signup" style={{ color: '#FF6B2B', fontWeight: 800 }}>Create account</Link>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#0C0B09', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="font-display" style={{ color: '#FF6B2B', fontSize: 14 }}>Loading…</span>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
