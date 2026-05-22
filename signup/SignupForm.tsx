'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/types'
import { Bike, Utensils, Zap } from 'lucide-react'

export default function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [role, setRole] = useState<UserRole>((searchParams.get('role') as UserRole) || 'customer')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [matricNumber, setMatricNumber] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password })
    if (authError) { setError(authError.message); setLoading(false); return }
    if (!authData.user) { setError('Something went wrong.'); setLoading(false); return }
    const { error: profileError } = await supabase.from('users').insert({ id: authData.user.id, email, phone, full_name: fullName, role, matric_number: matricNumber, is_active: true })
    if (profileError) { setError(profileError.message); setLoading(false); return }
    if (role === 'runner') await supabase.from('runner_profiles').insert({ user_id: authData.user.id, is_available: false, total_deliveries: 0, total_earnings: 0, rating: 5.0 })
    router.push(role === 'runner' ? '/dashboard' : role === 'admin' ? '/admin/dashboard' : '/home')
  }

  const input = { display: 'block', width: '100%', border: '1.5px solid #2A2825', borderRadius: 12, padding: '14px 16px', fontSize: 15, fontWeight: 600, fontFamily: 'inherit', outline: 'none', background: '#1A1917', color: 'white', boxSizing: 'border-box' as const }

  return (
    <div className="scanline" style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: '#0C0B09', fontFamily: "'Nunito', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>
      <div className="dot-texture" style={{ background: '#1A1917', padding: '64px 24px 40px', borderBottom: '1px solid #2A2825' }}>
        <div className="fade-up-1 jitter" style={{ fontSize: 40, marginBottom: 12, display: 'inline-block' }}><Zap size={40} color="#FF6B2B" /></div>
        <h1 className="font-brand fade-up-2" style={{ fontSize: 32, fontWeight: 900, color: 'white', margin: 0 }}>Create account</h1>
        <p className="fade-up-3" style={{ fontSize: 14, color: '#555', marginTop: 4, fontWeight: 600 }}>Join CampusRun today</p>
      </div>
      <div style={{ flex: 1, padding: '24px 24px 40px', overflowY: 'auto' }}>
        <div className="fade-up-4" style={{ display: 'flex', gap: 8, background: '#1A1917', padding: 6, borderRadius: 16, marginBottom: 24, border: '1px solid #2A2825' }}>
          {(['customer', 'runner'] as UserRole[]).map(r => (
            <button key={r} type="button" onClick={() => setRole(r)} className="jitter-btn" style={{ flex: 1, padding: '10px', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 14, fontFamily: 'inherit', background: role === r ? '#FF6B2B' : 'transparent', color: role === r ? 'white' : '#444' }}>
              {r === 'customer' ? <><Utensils size={14} style={{marginRight:6,verticalAlign:'middle'}} />Customer</> : <><Bike size={14} style={{marginRight:6,verticalAlign:'middle'}} />Runner</>}
            </button>
          ))}
        </div>
        <form onSubmit={handleSignup} className="fade-up-5" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            { label: 'Full name', type: 'text', val: fullName, set: setFullName, ph: 'Tunde Adeyemi', req: true },
            { label: 'Phone number', type: 'tel', val: phone, set: setPhone, ph: '08012345678', req: true },
            { label: 'Email', type: 'email', val: email, set: setEmail, ph: 'you@rsu.edu.ng', req: true },
            { label: 'Matric number', type: 'text', val: matricNumber, set: setMatricNumber, ph: 'RSU/2021/001234', req: false },
            { label: 'Password', type: 'password', val: password, set: setPassword, ph: 'Min. 8 characters', req: true },
          ].map(f => (
            <div key={f.label}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#555', marginBottom: 6 }}>{f.label}</label>
              <input style={input} type={f.type} value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph} required={f.req} minLength={f.label === 'Password' ? 8 : undefined}
                onFocus={e => { e.target.style.borderColor = '#FF6B2B'; e.target.style.boxShadow = '0 0 0 3px rgba(255,107,43,0.12)' }}
                onBlur={e => { e.target.style.borderColor = '#2A2825'; e.target.style.boxShadow = 'none' }} />
            </div>
          ))}
          {role === 'runner' && <div style={{ background: '#1A1207', color: '#FF6B2B', borderRadius: 12, padding: '12px 16px', fontSize: 14, fontWeight: 600, border: '1px solid #2A2010' }}><Bike size={14} style={{marginRight:6,verticalAlign:'middle'}} /> Earn <strong>₦300 per delivery</strong>. Toggle availability anytime.</div>}
          {error && <div style={{ background: '#2A0A0A', color: '#FF5555', borderRadius: 12, padding: '12px 16px', fontSize: 14, fontWeight: 600 }}>{error}</div>}
          <button type="submit" disabled={loading} className="jitter-btn" style={{ width: '100%', background: '#FF6B2B', color: 'white', fontWeight: 900, fontSize: 17, padding: '16px', borderRadius: 16, border: 'none', cursor: 'pointer', marginTop: 8, fontFamily: 'inherit', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>
        <p style={{ textAlign: 'center', fontSize: 14, color: '#444', fontWeight: 600, marginTop: 16 }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: '#FF6B2B', fontWeight: 700 }}>Log in</Link>
        </p>
      </div>
    </div>
  )
}
