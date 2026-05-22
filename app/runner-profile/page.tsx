'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { RunnerProfile } from '@/types'

interface PayoutRequest {
  id: string
  amount: number
  bank_name: string
  account_number: string
  account_name: string
  status: 'pending' | 'paid' | 'rejected'
  created_at: string
  note?: string
}

const BANK_NAMES = [
  'Access Bank', 'First Bank', 'GTBank', 'UBA', 'Zenith Bank',
  'Sterling Bank', 'Fidelity Bank', 'Polaris Bank', 'Stanbic IBTC',
  'Union Bank', 'Wema Bank', 'FCMB', 'Ecobank', 'Heritage Bank',
  'Keystone Bank', 'Opay', 'Kuda Bank', 'PalmPay', 'Moniepoint',
]

export default function RunnerProfilePage() {
  const router = useRouter()
  const supabase = createClient()

  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState('')
  const [userPhone, setUserPhone] = useState('')
  const [profile, setProfile] = useState<RunnerProfile | null>(null)
  const [strikes, setStrikes] = useState<{ reason: string; created_at: string }[]>([])
  const [payoutRequests, setPayoutRequests] = useState<PayoutRequest[]>([])
  const [ratings, setRatings] = useState<{ stars: number; comment?: string; created_at: string }[]>([])
  const [loading, setLoading] = useState(true)

  // Payout sheet
  const [showPayoutSheet, setShowPayoutSheet] = useState(false)
  const [form, setForm] = useState({ bankName: '', accountNumber: '', accountName: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitDone, setSubmitDone] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)

      const [{ data: userData }, { data: runnerData }, { data: strikeData }, { data: payoutData }, { data: ratingsData }] = await Promise.all([
        supabase.from('users').select('full_name, phone').eq('id', user.id).single(),
        supabase.from('runner_profiles').select('*').eq('user_id', user.id).single(),
        supabase.from('runner_strikes').select('reason, created_at').eq('runner_id', user.id).gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()).order('created_at', { ascending: false }),
        supabase.from('payout_requests').select('*').eq('runner_id', user.id).order('created_at', { ascending: false }).limit(10),
        supabase.from('ratings').select('stars, comment, created_at').eq('runner_id', user.id).order('created_at', { ascending: false }).limit(20),
      ])

      setUserName(userData?.full_name ?? '')
      setUserPhone(userData?.phone ?? '')
      setProfile(runnerData)
      setStrikes(strikeData ?? [])
      setPayoutRequests(payoutData ?? [])
      setRatings(ratingsData ?? [])
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function submitPayoutRequest() {
    if (!form.bankName || !form.accountNumber || !form.accountName) return
    setSubmitting(true)
    const res = await fetch('/api/runner/request-payout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bankName: form.bankName,
        accountNumber: form.accountNumber,
        accountName: form.accountName,
        amount: profile?.total_earnings ?? 0,
      }),
    })
    const { success, error } = await res.json()
    setSubmitting(false)
    if (success) {
      setSubmitDone(true)
      setTimeout(() => { setShowPayoutSheet(false); setSubmitDone(false); router.refresh() }, 2000)
    } else {
      alert(error || 'Failed to submit. Try again.')
    }
  }

  const pendingRequest = payoutRequests.find(p => p.status === 'pending')
  const strikeColor = strikes.length >= 3 ? '#FF3B30' : strikes.length === 2 ? '#FF9500' : strikes.length === 1 ? '#FFB800' : '#1DB954'

  const LABEL = {
    food_not_available: 'Food not available', restaurant_closed: 'Restaurant closed',
    order_taking_too_long: 'Order taking too long', unable_to_locate: 'Unable to locate customer',
    personal_emergency: 'Personal emergency',
  } as Record<string, string>

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#F5F0E8', fontSize: 40 }}>🛵</div>
  )

  return (
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: '#F5F0E8', fontFamily: "'Nunito', system-ui, sans-serif" }}>

      {/* Payout request sheet */}
      {showPayoutSheet && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 430, background: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: '20px 20px 32px' }}>
            <div style={{ width: 36, height: 4, background: '#E0DACE', borderRadius: 2, margin: '0 auto 18px' }} />
            {submitDone ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <p style={{ fontSize: 40, margin: '0 0 12px' }}>✅</p>
                <p style={{ fontSize: 20, fontWeight: 900, color: '#15130F', margin: 0 }}>Request sent!</p>
                <p style={{ fontSize: 13, color: '#8B857B', fontWeight: 600, margin: '6px 0 0' }}>Admin will process your payout shortly.</p>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 10, fontWeight: 800, color: '#FF6B2B', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 4px' }}>Payout request</p>
                <p style={{ fontSize: 22, fontWeight: 900, color: '#15130F', margin: '0 0 4px' }}>₦{(profile?.total_earnings ?? 0).toLocaleString()}</p>
                <p style={{ fontSize: 13, color: '#8B857B', fontWeight: 600, margin: '0 0 18px' }}>Enter your bank details below</p>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#8B857B', marginBottom: 4 }}>Bank name</label>
                  <select
                    value={form.bankName}
                    onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))}
                    style={{ width: '100%', border: '1.5px solid #E0DACE', borderRadius: 12, padding: '12px 14px', fontSize: 14, fontWeight: 600, fontFamily: "'Nunito', sans-serif", outline: 'none', background: '#FAFAF8', color: form.bankName ? '#15130F' : '#999', boxSizing: 'border-box' as const }}
                  >
                    <option value="">Select bank...</option>
                    {BANK_NAMES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                {[
                  { key: 'accountNumber', label: 'Account number', ph: '10-digit account number', type: 'tel' },
                  { key: 'accountName', label: 'Account name', ph: 'Name on account', type: 'text' },
                ].map(f => (
                  <div key={f.key} style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#8B857B', marginBottom: 4 }}>{f.label}</label>
                    <input
                      type={f.type}
                      value={form[f.key as keyof typeof form]}
                      onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.ph}
                      maxLength={f.key === 'accountNumber' ? 10 : 60}
                      style={{ width: '100%', border: '1.5px solid #E0DACE', borderRadius: 12, padding: '12px 14px', fontSize: 14, fontWeight: 600, fontFamily: "'Nunito', sans-serif", outline: 'none', background: '#FAFAF8', color: '#15130F', boxSizing: 'border-box' as const }}
                    />
                  </div>
                ))}

                <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                  <button onClick={() => setShowPayoutSheet(false)} style={{ flex: 1, background: '#F0EBE0', color: '#4A463F', fontWeight: 700, fontSize: 14, padding: '13px', borderRadius: 14, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                  <button
                    onClick={submitPayoutRequest}
                    disabled={submitting || !form.bankName || !form.accountNumber || !form.accountName}
                    style={{ flex: 2, background: form.bankName && form.accountNumber && form.accountName ? '#FF6B2B' : '#E0DACE', color: 'white', fontWeight: 900, fontSize: 15, padding: '13px', borderRadius: 14, border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: submitting ? 0.7 : 1 }}
                  >
                    {submitting ? 'Sending...' : 'Request Payout'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background: '#15130F', padding: '56px 20px 24px' }}>
        <button onClick={() => router.push('/dashboard')} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'white', fontSize: 13, fontWeight: 700, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 16 }}>← Dashboard</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,107,43,0.15)', border: '2px solid rgba(255,107,43,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>🛵</div>
          <div>
            <h1 style={{ color: 'white', fontSize: 20, fontWeight: 900, margin: 0 }}>{userName}</h1>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 600, margin: '2px 0 0' }}>{userPhone} · Runner</p>
          </div>
        </div>
      </div>

      {/* Switch to customer */}
      <div style={{ margin: '12px 16px 0', padding: '10px 14px', background: 'rgba(255,107,43,0.06)', borderRadius: 12, border: '1px solid rgba(255,107,43,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontWeight: 800, fontSize: 12, color: '#FF6B2B', margin: 0 }}>Currently in Runner mode</p>
          <p style={{ fontSize: 11, color: '#8B857B', fontWeight: 600, margin: '2px 0 0' }}>Tap to switch and order food as a customer</p>
        </div>
        <button onClick={async () => {
          const { createClient } = await import('@/lib/supabase/client')
          const sb = createClient()
          const { data: { user } } = await sb.auth.getUser()
          if (user) await sb.from('users').update({ role: 'customer' }).eq('id', user.id)
          window.location.href = '/home'
        }} className="press" style={{ background: '#FF6B2B', color: 'white', fontWeight: 800, fontSize: 12, padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
          Customer mode
        </button>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* ── Payable-now hero ───────────────────────────── */}
        <div style={{ background: 'linear-gradient(135deg, #FF6B2B 0%, #FF8A4F 100%)', borderRadius: 18, padding: 20, color: 'white', boxShadow: '0 8px 24px rgba(255,107,43,0.18)' }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.7)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Available to cash out
          </p>
          <p className="font-display" style={{ fontSize: 38, color: 'white', margin: '4px 0 0', lineHeight: 1 }}>
            ₦{(profile?.total_earnings ?? 0).toLocaleString()}
          </p>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 600, margin: '6px 0 14px' }}>
            From {profile?.total_deliveries ?? 0} {(profile?.total_deliveries ?? 0) === 1 ? 'delivery' : 'deliveries'} · {(profile?.rating ?? 5).toFixed(1)}★ rating
          </p>
          {pendingRequest ? (
            <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.15)' }}>
              <p style={{ fontWeight: 800, fontSize: 13, color: 'white', margin: 0 }}>Payout request pending</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 600, margin: '3px 0 0' }}>
                ₦{pendingRequest.amount.toLocaleString()} · {pendingRequest.bank_name} · {pendingRequest.account_number}
              </p>
            </div>
          ) : (profile?.total_earnings ?? 0) > 0 ? (
            <button onClick={() => setShowPayoutSheet(true)} className="press"
              style={{ width: '100%', background: 'white', color: '#15130F', fontWeight: 900, fontSize: 15, padding: '13px', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              Request payout {'→'}
            </button>
          ) : (
            <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 12, padding: '11px 14px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.15)' }}>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 700, margin: 0 }}>Complete your first delivery to unlock payouts</p>
            </div>
          )}
        </div>

        {/* ── Performance stats ───────────────────────────── */}
        <div style={{ background: 'white', borderRadius: 16, padding: 14, border: '1px solid #E8E2D8' }}>
          <p className="label-cap" style={{ fontSize: 10, color: '#8B857B', margin: '0 0 10px' }}>Performance</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { val: String(profile?.total_deliveries ?? 0), lbl: 'Deliveries' },
              { val: `${(profile?.rating ?? 5).toFixed(1)}★`, lbl: 'Rating' },
              { val: `${strikes.length}`, lbl: 'Strikes' },
            ].map(s => (
              <div key={s.lbl} style={{ background: '#FAF7F0', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
                <p className="font-display" style={{ fontSize: 18, color: '#15130F', margin: 0 }}>{s.val}</p>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#8B857B', margin: '3px 0 0', textTransform: 'uppercase', letterSpacing: 0.3 }}>{s.lbl}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Payout history */}
        {payoutRequests.length > 0 && (
          <div style={{ background: 'white', borderRadius: 16, padding: 16, border: '1px solid #E8E2D8' }}>
            <p style={{ fontWeight: 800, fontSize: 14, color: '#15130F', margin: '0 0 12px' }}>Payout history</p>
            {payoutRequests.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #F5F0E8' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: p.status === 'paid' ? 'rgba(29,185,84,0.1)' : p.status === 'rejected' ? 'rgba(255,59,48,0.1)' : 'rgba(255,184,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                  {p.status === 'paid' ? '✅' : p.status === 'rejected' ? '❌' : '⏳'}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 800, fontSize: 13, color: '#15130F', margin: 0 }}>₦{p.amount.toLocaleString()} · {p.bank_name}</p>
                  <p style={{ fontSize: 11, color: '#8B857B', fontWeight: 600, margin: '2px 0 0' }}>
                    {new Date(p.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {p.note && ` · ${p.note}`}
                  </p>
                </div>
                <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: p.status === 'paid' ? 'rgba(29,185,84,0.1)' : p.status === 'rejected' ? 'rgba(255,59,48,0.1)' : 'rgba(255,184,0,0.1)', color: p.status === 'paid' ? '#1B7F3A' : p.status === 'rejected' ? '#B23A2E' : '#B28000', textTransform: 'uppercase' as const }}>
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Strikes */}
        <div style={{ background: 'white', borderRadius: 16, padding: 16, border: '1px solid #E8E2D8' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ fontWeight: 800, fontSize: 14, color: '#15130F', margin: 0 }}>Strikes (30 days)</p>
            <span style={{ fontSize: 12, fontWeight: 900, color: strikeColor, background: `${strikeColor}18`, padding: '3px 10px', borderRadius: 8 }}>{strikes.length}/3</span>
          </div>
          {strikes.length === 0 ? (
            <div style={{ background: 'rgba(29,185,84,0.08)', borderRadius: 12, padding: '10px 14px', border: '1px solid rgba(29,185,84,0.2)' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#1B7F3A', margin: 0 }}>✓ No strikes — keep it up!</p>
            </div>
          ) : strikes.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid #F5F0E8', alignItems: 'center' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,59,48,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, color: '#FF3B30', flexShrink: 0 }}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#15130F', margin: 0 }}>{LABEL[s.reason] ?? s.reason}</p>
                <p style={{ fontSize: 11, color: '#8B857B', fontWeight: 600, margin: '2px 0 0' }}>
                  {new Date(s.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
          {strikes.length > 0 && strikes.length < 3 && (
            <p style={{ fontSize: 12, color: '#8B857B', fontWeight: 600, margin: '10px 0 0' }}>
              3 cancellations in 30 days results in a 30-day suspension.
            </p>
          )}
        </div>

        {/* Sign out */}
        <button onClick={async () => { await supabase.auth.signOut(); router.push('/') }} style={{ width: '100%', background: 'white', color: '#FF3B30', fontWeight: 800, fontSize: 15, padding: '16px', borderRadius: 16, border: '1px solid #E8E2D8', cursor: 'pointer', fontFamily: 'inherit' }}>
          Sign Out
        </button>

        {/* Customer feedback */}
        {ratings.some(r => r.comment) && (
          <div style={{ background: 'white', borderRadius: 16, padding: 16, marginTop: 12 }}>
            <p style={{ fontWeight: 900, fontSize: 14, color: '#15130F', margin: '0 0 12px' }}>Customer feedback</p>
            {ratings.filter(r => r.comment).map((r, i) => (
              <div key={i} style={{ borderBottom: i < ratings.filter(x => x.comment).length - 1 ? '1px solid #E0DACE' : 'none', paddingBottom: i < ratings.filter(x => x.comment).length - 1 ? 10 : 0, marginBottom: i < ratings.filter(x => x.comment).length - 1 ? 10 : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: '#FFB800', fontWeight: 800 }}>{'\u2605'.repeat(r.stars)}{'\u2606'.repeat(5 - r.stars)}</span>
                  <span style={{ fontSize: 11, color: '#8B857B', fontWeight: 600 }}>{new Date(r.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}</span>
                </div>
                <p style={{ fontSize: 13, color: '#4A463F', fontWeight: 600, margin: 0, lineHeight: 1.5 }}>{r.comment}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
