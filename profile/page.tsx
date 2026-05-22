'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/types'
import { Bike, User } from 'lucide-react'

export default function ProfilePage() {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<{ id: string; full_name: string; email: string; phone: string; role: UserRole; matric_number?: string } | null>(null)
  const [runnerAppStatus, setRunnerAppStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) { router.push('/login'); return }
      const [{ data: userData }, { data: appData }] = await Promise.all([
        supabase.from('users').select('*').eq('id', authUser.id).single(),
        supabase.from('runner_applications').select('status').eq('user_id', authUser.id).order('applied_at', { ascending: false }).limit(1).single(),
      ])
      setUser(userData)
      setRunnerAppStatus(appData?.status ?? null)
      setLoading(false)
    }
    load()
  }, [])

  async function switchToCustomer() {
    if (!user || switching) return
    setSwitching(true)
    await supabase.from('users').update({ role: 'customer' }).eq('id', user.id)
    router.push('/home')
  }

  async function handleRunnerSwitch() {
    if (!user) return
    if (user.role === 'runner') { switchToCustomer(); return }
    if (runnerAppStatus === 'approved') {
      setSwitching(true)
      await supabase.from('users').update({ role: 'runner' }).eq('id', user.id)
      router.push('/dashboard')
      return
    }
    router.push('/apply-runner')
  }

  async function handleSignOut() { await supabase.auth.signOut(); router.push('/') }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0C0B09', fontSize: 40 }}><User size={40} color="#FF6B2B" /></div>
  if (!user) return null

  const isCustomer = user.role === 'customer'
  const isRunner = user.role === 'runner'
  const runnerBtnDisabled = runnerAppStatus === 'pending' || runnerAppStatus === 'rejected' || switching

  return (
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: '#0C0B09', fontFamily: "'Nunito', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>
      <div className="dot-texture" style={{ background: '#1A1917', padding: '56px 20px 32px', textAlign: 'center', borderBottom: '1px solid #2A2825' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#2A2825', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 12px' }}>
          {isRunner ? <Bike size={32} color="#FF6B2B" /> : <User size={32} color="#FF6B2B" />}
        </div>
        <h1 style={{ color: 'white', fontSize: 22, fontWeight: 900, margin: '0 0 4px' }}>{user.full_name}</h1>
        <p style={{ color: '#555', fontSize: 13, fontWeight: 600, margin: 0 }}>{user.email}</p>
        <div style={{ display: 'inline-block', background: '#2A2825', borderRadius: 20, padding: '4px 12px', marginTop: 8 }}>
          <span style={{ color: '#FF6B2B', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>{user.role} mode</span>
        </div>
      </div>

      <div style={{ flex: 1, padding: 16 }}>
        <div style={{ background: '#1A1917', borderRadius: 16, padding: 16, marginBottom: 12, border: '1px solid #2A2825' }}>
          <p style={{ fontWeight: 800, fontSize: 14, margin: '0 0 4px', color: 'white' }}>Switch mode</p>
          <p style={{ fontSize: 12, color: '#555', fontWeight: 600, margin: '0 0 14px' }}>Order food as a customer or earn money as a runner.</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => isRunner && switchToCustomer()} disabled={isCustomer || switching}
              style={{ flex: 1, padding: '14px 10px', borderRadius: 14, border: `2px solid ${isCustomer ? '#FF6B2B' : '#2A2825'}`, background: isCustomer ? '#1A1207' : '#1A1917', cursor: isCustomer ? 'default' : 'pointer', fontFamily: 'inherit' }}>
              <div style={{ fontSize: 28, marginBottom: 6, display:"flex",justifyContent:"center" }}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg></div>
              <p style={{ fontWeight: 800, fontSize: 13, color: isCustomer ? '#FF6B2B' : '#666', margin: '0 0 2px' }}>Customer</p>
              <p style={{ fontSize: 11, color: '#444', fontWeight: 600, margin: 0 }}>Order food</p>
              {isCustomer && <div style={{ marginTop: 6, background: '#FF6B2B', borderRadius: 6, padding: '2px 8px', display: 'inline-block' }}><span style={{ fontSize: 10, fontWeight: 800, color: 'white' }}>ACTIVE</span></div>}
            </button>
            <button onClick={handleRunnerSwitch} disabled={runnerBtnDisabled}
              style={{ flex: 1, padding: '14px 10px', borderRadius: 14, border: `2px solid ${isRunner ? '#1DB954' : '#2A2825'}`, background: isRunner ? '#0D2A1A' : '#1A1917', cursor: runnerBtnDisabled ? 'default' : 'pointer', fontFamily: 'inherit' }}>
              <div style={{ fontSize: 28, marginBottom: 6, display:"flex",justifyContent:"center" }}><Bike size={28} color="#666" /></div>
              <p style={{ fontWeight: 800, fontSize: 13, color: isRunner ? '#1DB954' : '#666', margin: '0 0 2px' }}>Runner</p>
              <p style={{ fontSize: 11, color: '#444', fontWeight: 600, margin: 0 }}>Earn ₦300/drop</p>
              {isRunner && <div style={{ marginTop: 6, background: '#1DB954', borderRadius: 6, padding: '2px 8px', display: 'inline-block' }}><span style={{ fontSize: 10, fontWeight: 800, color: 'white' }}>ACTIVE</span></div>}
              {!isRunner && runnerAppStatus === 'pending' && <div style={{ marginTop: 6, background: '#1A1600', borderRadius: 6, padding: '2px 8px', display: 'inline-block' }}><span style={{ fontSize: 10, fontWeight: 800, color: '#FFB800' }}>PENDING</span></div>}
            </button>
          </div>
          {!isRunner && !runnerAppStatus && <p style={{ fontSize: 12, color: '#444', fontWeight: 600, textAlign: 'center', marginTop: 10 }}>Tap Runner to apply</p>}
          {runnerAppStatus === 'rejected' && <p style={{ fontSize: 12, color: '#FF3B30', fontWeight: 600, textAlign: 'center', marginTop: 10 }}>Application rejected. Contact us on WhatsApp.</p>}
        </div>

        <div style={{ background: '#1A1917', borderRadius: 16, padding: 16, marginBottom: 12, border: '1px solid #2A2825' }}>
          <p style={{ fontWeight: 800, fontSize: 14, margin: '0 0 12px', color: 'white' }}>Account details</p>
          {[{ label: 'Full name', val: user.full_name }, { label: 'Email', val: user.email }, { label: 'Phone', val: user.phone }, { label: 'Matric number', val: user.matric_number || '—' }].map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #2A2825' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#555' }}>{item.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{item.val}</span>
            </div>
          ))}
        </div>

        <button onClick={handleSignOut} style={{ width: '100%', background: '#1A1917', color: '#FF3B30', fontWeight: 800, fontSize: 15, padding: '16px', borderRadius: 16, border: '1px solid #2A2825', cursor: 'pointer', fontFamily: 'inherit' }}>
          Sign Out
        </button>
      </div>
    </div>
  )
}
