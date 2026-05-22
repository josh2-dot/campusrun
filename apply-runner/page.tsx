'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle, Bike, Check, CheckCircle, XCircle } from 'lucide-react'

export default function ApplyRunnerPage() {
  const router = useRouter()
  const supabase = createClient()
  const [matricNumber, setMatricNumber] = useState('')
  const [department, setDepartment] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [existingApp, setExistingApp] = useState<{ status: string; rejection_reason?: string } | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase
        .from('runner_applications')
        .select('status, rejection_reason')
        .eq('user_id', user.id)
        .order('applied_at', { ascending: false })
        .limit(1)
        .single()
      if (data) setExistingApp(data)
      setChecking(false)
    }
    check()
  }, [])

  async function handleApply(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    await supabase.from('users').update({ matric_number: matricNumber }).eq('id', user.id)
    const { error: appError } = await supabase.from('runner_applications').insert({
      user_id: user.id, matric_number: matricNumber, department,
    })
    if (appError) { setError(appError.message); setLoading(false); return }
    setExistingApp({ status: 'pending' })
    setLoading(false)
  }

  const input = { display: 'block', width: '100%', border: '1.5px solid #2A2825', borderRadius: 12, padding: '14px 16px', fontSize: 15, fontWeight: 600, fontFamily: 'inherit', outline: 'none', background: '#1A1917', color: 'white', boxSizing: 'border-box' as const }

  if (checking) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0C0B09', fontSize: 40 }}><Bike size={40} color="#FF6B2B" /></div>

  return (
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: '#0C0B09', fontFamily: "'Nunito', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>
      <div className="dot-texture" style={{ background: '#1A1917', padding: '56px 20px 32px', borderBottom: '1px solid #2A2825', position: 'relative' }}>
        <button onClick={() => router.push('/profile')} style={{ position: 'absolute', top: 52, left: 20, background: 'rgba(255,255,255,0.08)', border: 'none', color: 'white', fontSize: 14, fontWeight: 700, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>
        <div className="jitter" style={{ fontSize: 40, marginBottom: 12, display: 'inline-block' }}><Bike size={40} color="#FF6B2B" /></div>
        <h1 className="font-brand" style={{ fontSize: 28, fontWeight: 900, color: 'white', margin: '0 0 4px' }}>Become a Runner</h1>
        <p style={{ fontSize: 14, color: '#555', fontWeight: 600, margin: 0 }}>Earn ₦300 per delivery on campus</p>
      </div>

      <div style={{ flex: 1, padding: 20 }}>
        {existingApp ? (
          <div>
            {existingApp.status === 'pending' && (
              <div style={{ background: '#1A1600', border: '1px solid #2A2800', borderRadius: 16, padding: 20, textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
                <h2 style={{ color: '#FFB800', fontWeight: 900, fontSize: 18, margin: '0 0 8px' }}>Application under review</h2>
                <p style={{ color: '#666', fontSize: 14, fontWeight: 600, margin: 0 }}>We'll notify you once your application is reviewed. This usually takes 24–48 hours.</p>
              </div>
            )}
            {existingApp.status === 'approved' && (
              <div style={{ background: '#001A0D', border: '1px solid #1A3A25', borderRadius: 16, padding: 20, textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 12, display:"flex",justifyContent:"center" }}><CheckCircle size={48} color="#1DB954" /></div>
                <h2 style={{ color: '#1DB954', fontWeight: 900, fontSize: 18, margin: '0 0 8px' }}>You&apos;re approved!</h2>
                <p style={{ color: '#666', fontSize: 14, fontWeight: 600, margin: '0 0 16px' }}>Your runner account is active. Switch to runner mode to start earning.</p>
                <button onClick={() => router.push('/profile')} className="jitter-btn" style={{ background: '#1DB954', color: 'white', fontWeight: 900, fontSize: 15, padding: '14px 24px', borderRadius: 14, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Go to Profile →
                </button>
              </div>
            )}
            {existingApp.status === 'rejected' && (
              <div style={{ background: '#2A0A0A', border: '1px solid #3A1A1A', borderRadius: 16, padding: 20, textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 12, display:"flex",justifyContent:"center" }}><XCircle size={48} color="#FF3B30" /></div>
                <h2 style={{ color: '#FF3B30', fontWeight: 900, fontSize: 18, margin: '0 0 8px' }}>Application rejected</h2>
                {existingApp.rejection_reason && <p style={{ color: '#666', fontSize: 14, fontWeight: 600, margin: '0 0 16px' }}>Reason: {existingApp.rejection_reason}</p>}
                <p style={{ color: '#555', fontSize: 13, fontWeight: 600, margin: 0 }}>Contact us on WhatsApp if you think this is a mistake.</p>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div style={{ background: '#1A1917', borderRadius: 16, padding: 16, marginBottom: 20, border: '1px solid #2A2825' }}>
              <p style={{ fontWeight: 800, fontSize: 14, color: '#FF6B2B', margin: '0 0 8px' }}>What you get</p>
              {['₦300 per delivery', 'Work on your own schedule', 'Earn between classes', 'Instant earnings tracking'].map(item => (
                <p key={item} style={{ fontSize: 13, color: '#666', fontWeight: 600, margin: '4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Check size={14} color="#1DB954" style={{marginRight:6,flexShrink:0}} /> {item}
                </p>
              ))}
            </div>

            <form onSubmit={handleApply} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#555', marginBottom: 6 }}>Matric number</label>
                <input style={input} type="text" value={matricNumber} onChange={e => setMatricNumber(e.target.value)} placeholder="RSU/2021/001234" required
                  onFocus={e => { e.target.style.borderColor = '#FF6B2B' }}
                  onBlur={e => { e.target.style.borderColor = '#2A2825' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#555', marginBottom: 6 }}>Department</label>
                <input style={input} type="text" value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g. Computer Science" required
                  onFocus={e => { e.target.style.borderColor = '#FF6B2B' }}
                  onBlur={e => { e.target.style.borderColor = '#2A2825' }} />
              </div>

              <div style={{ background: '#1A1207', borderRadius: 12, padding: '12px 16px', border: '1px solid #2A2010' }}>
                <p style={{ fontSize: 13, color: '#FF6B2B', fontWeight: 600, margin: 0 }}><AlertTriangle size={14} style={{marginRight:6,verticalAlign:'middle'}} /> Applications are reviewed manually. You can go online once approved.</p>
              </div>

              {error && <div style={{ background: '#2A0A0A', color: '#FF5555', borderRadius: 12, padding: '12px 16px', fontSize: 14, fontWeight: 600 }}>{error}</div>}

              <button type="submit" disabled={loading} className="jitter-btn" style={{ width: '100%', background: '#FF6B2B', color: 'white', fontWeight: 900, fontSize: 17, padding: '16px', borderRadius: 16, border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: loading ? 0.6 : 1 }}>
                {loading ? 'Submitting...' : 'Submit Application'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
