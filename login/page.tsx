'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LogIn } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) { setError(authError.message); setLoading(false); return }
    if (data.user) {
      const { data: profile } = await supabase.from('users').select('role').eq('id', data.user.id).single()
      const map: Record<string, string> = { customer: '/home', runner: '/dashboard', admin: '/admin/dashboard' }
      router.push(map[profile?.role ?? 'customer'])
    }
  }

  const input = { display: 'block', width: '100%', border: '1.5px solid #2A2825', borderRadius: 12, padding: '14px 16px', fontSize: 15, fontWeight: 600, fontFamily: 'inherit', outline: 'none', background: '#1A1917', color: 'white', boxSizing: 'border-box' as const }

  return (
    <div className="scanline" style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: '#0C0B09', fontFamily: "'Nunito', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>
      <div className="dot-texture" style={{ background: '#1A1917', padding: '64px 24px 40px', borderBottom: '1px solid #2A2825' }}>
        <div className="fade-up-1 jitter" style={{ fontSize: 40, marginBottom: 12, display: 'inline-block' }}><LogIn size={40} color="#FF6B2B" /></div>
        <h1 className="font-brand fade-up-2" style={{ fontSize: 32, fontWeight: 900, color: 'white', margin: 0 }}>Welcome back!</h1>
        <p className="fade-up-3" style={{ fontSize: 14, color: '#555', marginTop: 4, fontWeight: 600 }}>Log in to continue</p>
      </div>
      <div style={{ flex: 1, padding: '32px 24px 40px' }}>
        <form onSubmit={handleLogin} className="fade-up-4" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#555', marginBottom: 6 }}>Email</label>
            <input style={input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@rsu.edu.ng" required
              onFocus={e => { e.target.style.borderColor = '#FF6B2B'; e.target.style.boxShadow = '0 0 0 3px rgba(255,107,43,0.12)' }}
              onBlur={e => { e.target.style.borderColor = '#2A2825'; e.target.style.boxShadow = 'none' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#555', marginBottom: 6 }}>Password</label>
            <input style={input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required
              onFocus={e => { e.target.style.borderColor = '#FF6B2B'; e.target.style.boxShadow = '0 0 0 3px rgba(255,107,43,0.12)' }}
              onBlur={e => { e.target.style.borderColor = '#2A2825'; e.target.style.boxShadow = 'none' }} />
          </div>
          {error && <div style={{ background: '#2A0A0A', color: '#FF5555', borderRadius: 12, padding: '12px 16px', fontSize: 14, fontWeight: 600 }}>{error}</div>}
          <button type="submit" disabled={loading} className="jitter-btn" style={{ width: '100%', background: '#FF6B2B', color: 'white', fontWeight: 900, fontSize: 17, padding: '16px', borderRadius: 16, border: 'none', cursor: 'pointer', marginTop: 8, fontFamily: 'inherit', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Logging in...' : 'Log In'}
          </button>
        </form>
        <p style={{ textAlign: 'center', fontSize: 14, color: '#444', fontWeight: 600, marginTop: 24 }}>
          Don&apos;t have an account?{' '}
          <Link href="/signup" style={{ color: '#FF6B2B', fontWeight: 700 }}>Sign up</Link>
        </p>
      </div>
    </div>
  )
}
