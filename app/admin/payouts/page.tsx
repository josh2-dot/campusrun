'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface UnpaidOrder {
  id: string
  order_ref: string
  runner_earnings: number
  delivered_at: string
}

interface RunnerSummary {
  user_id: string
  users: { full_name: string; phone: string }
  unpaidOrders: UnpaidOrder[]
  unpaidAmount: number
  unpaidCount: number
}

interface Payout {
  id: string
  runner_id: string
  amount: number
  delivery_count: number
  marked_paid_at: string
  marked_by: { full_name: string } | null
}

interface PayoutRequest {
  id: string
  runner_id: string
  amount: number
  bank_name: string
  account_number: string
  account_name: string
  status: 'pending' | 'paid' | 'rejected'
  created_at: string
  note?: string
  runner: { full_name: string; phone: string } | null
}

export default function AdminPayoutsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [runners, setRunners] = useState<RunnerSummary[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [tab, setTab] = useState<'requests' | 'unpaid' | 'history'>('requests')
  const [requests, setRequests] = useState<PayoutRequest[]>([])
  const [resolving, setResolving] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/payouts')
    if (res.status === 401 || res.status === 403) { router.push('/home'); return }
    const data = await res.json()
    setRunners(data.runners ?? [])
    setPayouts(data.payouts ?? [])
    setRequests(data.requests ?? [])
    setLoading(false)
  }, [router])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      load()
    })
  }, [load, router, supabase])

  async function resolveRequest(requestId: string, status: 'paid' | 'rejected', note?: string) {
    setResolving(requestId)
    await fetch('/api/admin/payouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resolve_request', requestId, status, note }),
    })
    await load()
    setResolving(null)
  }

  async function markPaid(runner: RunnerSummary) {
    setPaying(runner.user_id)
    await fetch('/api/admin/payouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'mark_paid',
        runnerId: runner.user_id,
        orderIds: runner.unpaidOrders.map(o => o.id),
        amount: runner.unpaidAmount,
      }),
    })
    await load()
    setPaying(null)
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0C0B09', fontSize: 40 }}>💰</div>

  const unpaidRunners = runners.filter(r => r.unpaidCount > 0)
  const totalUnpaid = unpaidRunners.reduce((sum, r) => sum + r.unpaidAmount, 0)

  return (
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: '#0C0B09', fontFamily: "'Nunito', system-ui, sans-serif" }}>
      <div style={{ background: '#0C0B09', padding: '56px 20px 20px', borderBottom: '1px solid #2A2825' }}>
        <button onClick={() => router.push('/admin/dashboard')} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'white', fontSize: 14, fontWeight: 700, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 12 }}>← Dashboard</button>
        <h1 style={{ color: 'white', fontSize: 22, fontWeight: 900, margin: '0 0 4px', fontFamily: "'Syne', sans-serif" }}>Runner Payouts</h1>
        {unpaidRunners.length > 0 && (
          <div style={{ background: 'rgba(255,107,43,0.1)', borderRadius: 12, padding: '10px 14px', marginTop: 10, border: '1px solid rgba(255,107,43,0.2)', display: 'inline-block' }}>
            <p style={{ color: '#FF6B2B', fontWeight: 900, fontSize: 14, margin: 0 }}>₦{totalUnpaid.toLocaleString()} owed to {unpaidRunners.length} runner{unpaidRunners.length !== 1 ? 's' : ''}</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', margin: '12px 16px 0', background: '#1A1917', borderRadius: 12, padding: 4, border: '1px solid #2A2825' }}>
        {(['requests', 'unpaid', 'history'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '8px', borderRadius: 9, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12, fontFamily: "'Nunito', sans-serif", background: tab === t ? '#FF6B2B' : 'transparent', color: tab === t ? 'white' : 'rgba(255,255,255,0.3)' }}>
            {t === 'requests' ? `Requests (${requests.filter(r => r.status === 'pending').length})` : t === 'unpaid' ? `Unpaid (${unpaidRunners.length})` : `History (${payouts.length})`}
          </button>
        ))}
      </div>

      <div style={{ padding: 16 }}>
        {tab === 'requests' && (
          requests.filter(r => r.status === 'pending').length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.2)', fontWeight: 600 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <p style={{ margin: 0 }}>No pending payout requests</p>
            </div>
          ) : requests.filter(r => r.status === 'pending').map(req => (
            <div key={req.id} style={{ background: '#1A1917', borderRadius: 16, marginBottom: 10, border: '1px solid rgba(255,107,43,0.3)', padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <p style={{ fontWeight: 900, fontSize: 16, color: '#FF6B2B', margin: 0 }}>₦{req.amount.toLocaleString()}</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'white', margin: '3px 0 0' }}>{req.runner?.full_name}</p>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 600, margin: '2px 0 0' }}>{req.runner?.phone}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 600, margin: 0 }}>
                    {new Date(req.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
              </div>
              <div style={{ background: '#0C0B09', borderRadius: 12, padding: '10px 12px', marginBottom: 12, border: '1px solid #2A2825' }}>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10 }}>Bank details</p>
                <p style={{ fontWeight: 800, fontSize: 13, color: 'white', margin: 0 }}>{req.bank_name}</p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 700, margin: '2px 0 0' }}>{req.account_number} · {req.account_name}</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => resolveRequest(req.id, 'rejected', 'Rejected by admin')}
                  disabled={resolving === req.id}
                  style={{ flex: 1, background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.3)', color: '#FF3B30', fontWeight: 800, fontSize: 13, padding: '11px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', opacity: resolving === req.id ? 0.6 : 1 }}
                >
                  ✗ Reject
                </button>
                <button
                  onClick={() => resolveRequest(req.id, 'paid')}
                  disabled={resolving === req.id}
                  style={{ flex: 2, background: resolving === req.id ? '#1a5c35' : '#1DB954', color: 'white', fontWeight: 900, fontSize: 13, padding: '11px', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: resolving === req.id ? 0.7 : 1 }}
                >
                  {resolving === req.id ? 'Processing...' : '✓ Mark as Paid'}
                </button>
              </div>
            </div>
          ))
        )}

        {tab === 'unpaid' && (
          unpaidRunners.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.2)', fontWeight: 600 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <p style={{ margin: 0 }}>All runners are paid up!</p>
            </div>
          ) : unpaidRunners.map(r => (
            <div key={r.user_id} style={{ background: '#1A1917', borderRadius: 16, marginBottom: 10, border: '1px solid rgba(255,107,43,0.2)', overflow: 'hidden' }}>
              <button onClick={() => setExpanded(expanded === r.user_id ? null : r.user_id)} style={{ width: '100%', background: 'none', border: 'none', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(255,107,43,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>😊</div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 800, fontSize: 14, margin: 0, color: 'white' }}>{r.users?.full_name}</p>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 600, margin: '2px 0 0' }}>{r.unpaidCount} deliveries · {r.users?.phone}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontWeight: 900, fontSize: 16, color: '#FF6B2B', margin: 0 }}>₦{r.unpaidAmount.toLocaleString()}</p>
                  <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, margin: '4px 0 0' }}>{expanded === r.user_id ? '▲' : '▼'}</p>
                </div>
              </button>

              {expanded === r.user_id && (
                <div style={{ padding: '0 16px 16px', borderTop: '1px solid #2A2825' }}>
                  <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: 800, margin: '12px 0 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Unpaid deliveries</p>
                  {r.unpaidOrders.map(o => (
                    <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #2A2825' }}>
                      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 700, margin: 0 }}>{o.order_ref}</p>
                      <p style={{ fontSize: 13, color: '#1DB954', fontWeight: 800, margin: 0 }}>₦{(o.runner_earnings ?? 300).toLocaleString()}</p>
                    </div>
                  ))}
                  <button
                    onClick={() => markPaid(r)}
                    disabled={paying === r.user_id}
                    style={{ width: '100%', background: paying === r.user_id ? '#1a5c35' : '#1DB954', color: 'white', fontWeight: 900, fontSize: 15, padding: '13px', borderRadius: 12, border: 'none', cursor: paying === r.user_id ? 'not-allowed' : 'pointer', fontFamily: "'Nunito', sans-serif", marginTop: 12, opacity: paying === r.user_id ? 0.7 : 1 }}
                  >
                    {paying === r.user_id ? 'Marking...' : `✓ Mark ₦${r.unpaidAmount.toLocaleString()} as Paid`}
                  </button>
                </div>
              )}
            </div>
          ))
        )}

        {tab === 'history' && (
          payouts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.2)', fontWeight: 600 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <p style={{ margin: 0 }}>No payouts yet</p>
            </div>
          ) : payouts.map(p => (
            <div key={p.id} style={{ background: '#1A1917', borderRadius: 14, padding: '14px 16px', marginBottom: 10, border: '1px solid #2A2825', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(29,185,84,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>✅</div>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 800, fontSize: 14, color: 'white', margin: 0 }}>₦{p.amount.toLocaleString()}</p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 600, margin: '2px 0 0' }}>
                  {p.delivery_count} drops · {new Date(p.marked_paid_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div style={{ background: 'rgba(29,185,84,0.15)', color: '#1DB954', fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 8 }}>Paid</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
