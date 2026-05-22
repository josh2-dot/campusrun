'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft } from 'lucide-react'

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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleApply(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    await supabase.from('users').update({ matric_number: matricNumber }).eq('id', user.id)
    const { error: appError } = await supabase.from('runner_applications').insert({
      user_id: user.id, matric_number: matricNumber, department,
    })
    if (appError) { setError("Couldn't submit your application. Please try again."); setLoading(false); return }
    const { data: userData } = await supabase.from('users').select('full_name, matric_number').eq('id', user.id).single()
    fetch('/api/admin/notify-application', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicantName: userData?.full_name, matricNumber, department }),
    }).catch(() => {})
    setExistingApp({ status: 'pending' })
    setLoading(false)
  }

  const input = {
    display: 'block', width: '100%',
    border: '1.5px solid var(--line, #2A2825)', borderRadius: 12,
    padding: '14px 16px', fontSize: 15, fontWeight: 600, fontFamily: 'inherit',
    outline: 'none', background: 'var(--bg-0, #0C0B09)', color: 'white',
    boxSizing: 'border-box' as const, transition: 'border-color 0.15s',
  }

  if (checking) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-0, #0C0B09)' }}>
      <div className="font-display" style={{ color: 'var(--accent, #FF6B2B)', fontSize: 14 }}>Checking…</div>
    </div>
  )

  return (
    <div className="mobile-container" style={{ display: 'flex', flexDirection: 'column', fontFamily: "'Nunito', system-ui, sans-serif", minHeight: '100vh', background: 'var(--bg-0, #0C0B09)' }}>

      {/* ─── HERO ─── */}
      <div className="dot-texture" style={{ background: 'linear-gradient(180deg, var(--bg-1, #1A1917), var(--bg-0, #0C0B09))', padding: '52px 20px 28px', borderBottom: '1px solid var(--line, #2A2825)', position: 'relative' }}>
        <button onClick={() => router.push('/profile')} className="press"
          style={{ position: 'absolute', top: 48, left: 16, background: 'var(--bg-2, #26241F)', border: '1px solid var(--line, #2A2825)', color: 'white', fontSize: 12, fontWeight: 700, padding: '6px 12px 6px 8px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
          <ChevronLeft size={14} /> Profile
        </button>
        <p className="label-cap" style={{ color: 'var(--accent, #FF6B2B)', margin: '8px 0 6px', fontSize: 10 }}>Become a runner</p>
        <h1 className="font-display" style={{ fontSize: 30, color: 'white', margin: '0 0 6px', lineHeight: 1.05 }}>
          Earn between classes.
        </h1>
        <p style={{ fontSize: 14, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: 0 }}>
          ₦300 per delivery · Cash out whenever you want.
        </p>
      </div>

      <div style={{ flex: 1, padding: '20px 16px 32px' }}>

        {existingApp ? (
          <div>
            {existingApp.status === 'pending' && (
              <div style={{ background: 'var(--bg-1, #1A1917)', border: '1px solid rgba(255,184,0,0.25)', borderRadius: 16, padding: '24px 20px', textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,184,0,0.12)', border: '2px solid rgba(255,184,0,0.3)', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>⏳</div>
                <p className="label-cap" style={{ color: 'var(--warn, #FFB800)', margin: '0 0 6px', fontSize: 10 }}>Status</p>
                <h2 style={{ color: 'white', fontWeight: 900, fontSize: 18, margin: '0 0 8px' }}>Under review</h2>
                <p style={{ color: 'var(--ink-3, #6B6660)', fontSize: 13, fontWeight: 600, margin: 0, lineHeight: 1.5 }}>We&apos;ll text you within 24–48 hours. You can close this app — we&apos;ll find you.</p>
              </div>
            )}
            {existingApp.status === 'approved' && (
              <div style={{ background: 'var(--bg-1, #1A1917)', border: '1px solid rgba(29,185,84,0.3)', borderRadius: 16, padding: '24px 20px', textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(29,185,84,0.12)', border: '2px solid rgba(29,185,84,0.3)', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>✓</div>
                <p className="label-cap" style={{ color: 'var(--ok, #1DB954)', margin: '0 0 6px', fontSize: 10 }}>Approved</p>
                <h2 style={{ color: 'white', fontWeight: 900, fontSize: 18, margin: '0 0 8px' }}>You&apos;re in.</h2>
                <p style={{ color: 'var(--ink-3, #6B6660)', fontSize: 13, fontWeight: 600, margin: '0 0 18px' }}>Switch to runner mode and start earning.</p>
                <button onClick={() => router.push('/profile')} className="press"
                  style={{ background: 'var(--ok, #1DB954)', color: 'white', fontWeight: 900, fontSize: 14, padding: '12px 22px', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Go to Profile →
                </button>
              </div>
            )}
            {existingApp.status === 'rejected' && (
              <div style={{ background: 'var(--bg-1, #1A1917)', border: '1px solid rgba(255,59,48,0.25)', borderRadius: 16, padding: '24px 20px', textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,59,48,0.12)', border: '2px solid rgba(255,59,48,0.3)', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>×</div>
                <p className="label-cap" style={{ color: 'var(--danger, #FF3B30)', margin: '0 0 6px', fontSize: 10 }}>Not approved</p>
                <h2 style={{ color: 'white', fontWeight: 900, fontSize: 18, margin: '0 0 8px' }}>Application not approved</h2>
                {existingApp.rejection_reason && (
                  <p style={{ color: 'var(--ink-3, #6B6660)', fontSize: 13, fontWeight: 600, margin: '0 0 10px' }}>{existingApp.rejection_reason}</p>
                )}
                <p style={{ color: 'var(--ink-3, #6B6660)', fontSize: 12, fontWeight: 600, margin: 0 }}>Reach out on WhatsApp if you think this is a mistake.</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* ─── HOW IT WORKS — 3 step explainer ─── */}
            <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', margin: '0 0 10px', fontSize: 10 }}>How it works</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {[
                { n: '1', title: 'Apply',            body: 'Fill the form below. Takes under 30 seconds.' },
                { n: '2', title: 'Get approved',     body: 'We text you in 24–48 hours after a quick check.' },
                { n: '3', title: 'Go online & earn', body: 'Switch to runner mode, accept orders, get paid.' },
              ].map((s, i) => (
                <div key={s.n} className="fade-up-1" style={{ animationDelay: `${i * 0.06}s`, display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--bg-1, #1A1917)', borderRadius: 14, padding: '14px 16px', border: '1px solid var(--line, #2A2825)' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,107,43,0.12)', border: '1px solid rgba(255,107,43,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span className="font-display" style={{ color: 'var(--accent, #FF6B2B)', fontSize: 13 }}>{s.n}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 800, fontSize: 14, color: 'white', margin: '0 0 2px' }}>{s.title}</p>
                    <p style={{ fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: 0, lineHeight: 1.5 }}>{s.body}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* ─── WHAT YOU GET ─── */}
            <div style={{ background: 'var(--bg-1, #1A1917)', borderRadius: 14, padding: '14px 16px', marginBottom: 20, border: '1px solid var(--line, #2A2825)' }}>
              <p className="label-cap" style={{ color: 'var(--accent, #FF6B2B)', fontSize: 10, margin: '0 0 8px' }}>What you get</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {['₦300 minimum per delivery', '+₦100 during 10am–1pm peak', 'Run as much or as little as you want', 'Payouts on request, no minimum'].map(b => (
                  <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'var(--ok, #1DB954)', fontWeight: 900, fontSize: 12 }}>✓</span>
                    <span style={{ fontSize: 13, color: 'var(--ink-2, #A09A8E)', fontWeight: 600 }}>{b}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ─── FORM ─── */}
            <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', margin: '0 0 10px', fontSize: 10 }}>Your details</p>
            <form onSubmit={handleApply} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: 'var(--ink-3, #6B6660)', marginBottom: 6, letterSpacing: '0.04em' }}>MATRIC NUMBER</label>
                <input style={input} type="text" value={matricNumber} onChange={e => setMatricNumber(e.target.value)} placeholder="RSU/2021/001234" required
                  onFocus={e => { e.target.style.borderColor = 'var(--accent, #FF6B2B)' }}
                  onBlur={e => { e.target.style.borderColor = 'var(--line, #2A2825)' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: 'var(--ink-3, #6B6660)', marginBottom: 6, letterSpacing: '0.04em' }}>DEPARTMENT</label>
                <input style={input} type="text" value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g. Computer Science" required
                  onFocus={e => { e.target.style.borderColor = 'var(--accent, #FF6B2B)' }}
                  onBlur={e => { e.target.style.borderColor = 'var(--line, #2A2825)' }} />
              </div>

              {error && (
                <div style={{ background: 'rgba(255,59,48,0.08)', color: 'var(--danger, #FF3B30)', borderRadius: 12, padding: '12px 14px', fontSize: 13, fontWeight: 700, border: '1px solid rgba(255,59,48,0.2)' }}>{error}</div>
              )}

              <button type="submit" disabled={loading} className="press"
                style={{ width: '100%', background: 'var(--accent, #FF6B2B)', color: 'white', fontWeight: 900, fontSize: 16, padding: '15px', borderRadius: 14, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: loading ? 0.6 : 1, marginTop: 4 }}>
                {loading ? 'Submitting…' : 'Submit application'}
              </button>
              <p style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: 0, textAlign: 'center', lineHeight: 1.4 }}>
                Applications reviewed manually. You&apos;ll get a notification once approved.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
