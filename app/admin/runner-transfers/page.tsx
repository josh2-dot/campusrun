'use client'

// Runner transfer queue — the mirror of /admin/payments (which handles
// restaurant transfers). Lymora reviews each row, sends the actual
// money manually from their bank/Paystack, then marks it here with the
// Paystack reference so the runner sees "funds sent" and the order
// advances to runner_funded_awaiting_pickup.

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const N = '\u20A6'

interface Transfer {
  id: string
  order_id: string
  order_ref: string
  amount: number
  status: 'pending' | 'sent' | 'failed' | 'cancelled'
  created_at: string
  paid_at: string | null
  paystack_ref: string | null
  bank_name: string | null
  account_number: string | null
  account_name: string | null
  restaurant_name: string
  delivery_address: string
}

interface RunnerGroup {
  runner_id: string
  runner_name: string
  runner_phone: string
  pendingAmount: number
  pendingCount: number
  transfers: Transfer[]
}

function initials(name?: string | null) {
  if (!name) return '?'
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (p[0][0] + p[1][0]).toUpperCase()
}

export default function AdminRunnerTransfersPage() {
  const router = useRouter()
  const supabase = createClient()

  const [runners, setRunners] = useState<RunnerGroup[]>([])
  const [totalPending, setTotalPending] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [tab, setTab] = useState<'pending' | 'history'>('pending')

  const [paying, setPaying] = useState<Record<string, boolean>>({})
  const [paystackRef, setPaystackRef] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<Record<string, Set<string>>>({})

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/runner-transfers')
    if (res.status === 401 || res.status === 403) { router.push('/home'); return }
    const data = await res.json()
    setRunners(data.runners ?? [])
    setTotalPending(data.totalPending ?? 0)
    setLoading(false)
  }, [router])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      load()
    })
  }, [load, router, supabase])

  function toggleSelect(runnerId: string, transferId: string) {
    setSelected(prev => {
      const cur = new Set(prev[runnerId] ?? [])
      if (cur.has(transferId)) cur.delete(transferId)
      else cur.add(transferId)
      return { ...prev, [runnerId]: cur }
    })
  }

  function selectAllPending(r: RunnerGroup) {
    const ids = r.transfers.filter(t => t.status === 'pending').map(t => t.id)
    setSelected(prev => ({ ...prev, [r.runner_id]: new Set(ids) }))
  }

  async function markPaid(r: RunnerGroup) {
    const ids = [...(selected[r.runner_id] ?? [])]
    if (!ids.length) return
    setPaying(p => ({ ...p, [r.runner_id]: true }))
    await fetch('/api/admin/runner-transfers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transferIds: ids, paystackRef: paystackRef[r.runner_id] }),
    })
    setSelected(p => ({ ...p, [r.runner_id]: new Set() }))
    setPaystackRef(p => ({ ...p, [r.runner_id]: '' }))
    setPaying(p => ({ ...p, [r.runner_id]: false }))
    await load()
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).catch(() => {})
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0C0B09', fontSize: 40 }}>
      💸
    </div>
  )

  const pending = runners.filter(r => r.pendingCount > 0)
  const history = runners.filter(r => r.pendingCount === 0 && r.transfers.length > 0)
  const list = tab === 'pending' ? pending : history

  return (
    <div className="mobile-container" style={{ display: 'flex', flexDirection: 'column', fontFamily: "'Nunito', system-ui, sans-serif" }}>
      {/* ── HEADER ────────────────────────────────────────────── */}
      <div className="dot-texture" style={{ padding: '52px 20px 20px', borderBottom: '1px solid #2A2825' }}>
        <Link
          href="/admin/payments"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: '#A09A8E', textDecoration: 'none', marginBottom: 12 }}
        >
          ← Restaurant transfers
        </Link>
        <div>
          <p className="label-cap" style={{ color: '#FF6B2B', margin: 0, fontSize: 10 }}>
            Runner-funded flow
          </p>
          <h1 className="font-display" style={{ color: 'white', fontSize: 24, margin: '2px 0 0' }}>
            Runner transfers
          </h1>
          <p style={{ color: '#6B6660', fontSize: 12, fontWeight: 600, margin: '4px 0 0' }}>
            Pay runners so they can buy from unregistered restaurants
          </p>
        </div>

        {totalPending > 0 && (
          <div style={{ marginTop: 14, background: 'rgba(255,107,43,0.08)', border: '1px solid rgba(255,107,43,0.25)', borderRadius: 14, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p className="label-cap" style={{ color: '#FF6B2B', margin: 0, fontSize: 9 }}>Pending payout</p>
              <p className="font-display" style={{ fontSize: 26, color: 'white', margin: '2px 0 0', lineHeight: 1 }}>
                {N}{totalPending.toLocaleString()}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 11, color: '#A09A8E', fontWeight: 700, margin: 0 }}>
                {pending.length} runner{pending.length === 1 ? '' : 's'}
              </p>
              <p style={{ fontSize: 11, color: '#A09A8E', fontWeight: 700, margin: '2px 0 0' }}>
                {pending.reduce((s, r) => s + r.pendingCount, 0)} order{pending.reduce((s, r) => s + r.pendingCount, 0) === 1 ? '' : 's'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── TABS ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, padding: '14px 14px 0' }}>
        {(['pending', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="press"
            style={{ flex: 1, background: tab === t ? '#FF6B2B' : 'transparent', color: tab === t ? 'white' : '#A09A8E', border: `1px solid ${tab === t ? '#FF6B2B' : '#2A2825'}`, fontWeight: 800, fontSize: 13, padding: 10, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize', minHeight: 40 }}
          >
            {t} {t === 'pending' && pending.length > 0 && `(${pending.length})`}
          </button>
        ))}
      </div>

      {/* ── LIST ──────────────────────────────────────────────── */}
      <div style={{ padding: '14px', flex: 1, overflowY: 'auto' }}>
        {list.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6B6660', fontSize: 13, fontWeight: 600 }}>
            {tab === 'pending' ? 'No pending transfers. Everyone paid up!' : 'No history yet.'}
          </div>
        ) : (
          list.map((r) => {
            const isExpanded = expanded === r.runner_id
            const sel = selected[r.runner_id] ?? new Set<string>()
            const selCount = sel.size
            const selAmount = r.transfers.filter(t => sel.has(t.id)).reduce((s, t) => s + t.amount, 0)
            return (
              <div key={r.runner_id} style={{ background: '#1A1917', border: '1px solid #2A2825', borderRadius: 16, marginBottom: 10, overflow: 'hidden' }}>
                {/* Runner header — tap to expand */}
                <button
                  onClick={() => setExpanded(isExpanded ? null : r.runner_id)}
                  className="press"
                  style={{ width: '100%', background: 'transparent', border: 'none', padding: 14, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', minHeight: 60 }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,107,43,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span className="font-display" style={{ color: '#FF6B2B', fontSize: 13 }}>{initials(r.runner_name)}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 800, fontSize: 14, color: 'white', margin: 0 }}>{r.runner_name}</p>
                    <p style={{ fontSize: 11, color: '#6B6660', fontWeight: 700, margin: '2px 0 0' }}>
                      {r.pendingCount > 0 ? `${r.pendingCount} pending · ${N}${r.pendingAmount.toLocaleString()}` : `${r.transfers.length} paid`}
                    </p>
                  </div>
                  <span style={{ color: '#6B6660', fontSize: 18, transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>→</span>
                </button>

                {isExpanded && (
                  <div style={{ padding: '0 14px 14px' }}>
                    {/* Bank details */}
                    <div style={{ background: '#0C0B09', border: '1px solid #2A2825', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                      <p className="label-cap" style={{ color: '#A09A8E', margin: 0, fontSize: 9 }}>Pay to</p>
                      {r.transfers[0]?.bank_name ? (
                        <div style={{ marginTop: 6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ color: 'white', fontWeight: 800, fontSize: 13 }}>{r.transfers[0].bank_name}</span>
                            <button onClick={() => copy(r.transfers[0].account_number ?? '')} className="press" style={{ background: 'rgba(255,107,43,0.15)', color: '#FF6B2B', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', minHeight: 28 }}>
                              Copy
                            </button>
                          </div>
                          <p style={{ fontFamily: 'monospace', fontSize: 15, color: 'white', fontWeight: 800, margin: 0, letterSpacing: '0.05em' }}>
                            {r.transfers[0].account_number}
                          </p>
                          <p style={{ color: '#A09A8E', fontSize: 11, fontWeight: 700, margin: '4px 0 0' }}>
                            {r.transfers[0].account_name}
                          </p>
                        </div>
                      ) : (
                        <p style={{ color: '#FFB800', fontSize: 12, fontWeight: 700, margin: '4px 0 0' }}>
                          ⚠ Bank details missing. Contact runner.
                        </p>
                      )}
                    </div>

                    {/* Pending transfers */}
                    {r.pendingCount > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <p className="label-cap" style={{ color: '#A09A8E', margin: 0, fontSize: 9 }}>
                            Pending ({r.pendingCount})
                          </p>
                          <button onClick={() => selectAllPending(r)} className="press" style={{ background: 'transparent', color: '#FF6B2B', border: 'none', fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', padding: 4, minHeight: 28 }}>
                            Select all
                          </button>
                        </div>
                        {r.transfers.filter(t => t.status === 'pending').map(t => {
                          const isSel = sel.has(t.id)
                          return (
                            <button
                              key={t.id}
                              onClick={() => toggleSelect(r.runner_id, t.id)}
                              className="press"
                              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: isSel ? 'rgba(255,107,43,0.1)' : '#0C0B09', border: `1px solid ${isSel ? '#FF6B2B' : '#2A2825'}`, borderRadius: 10, padding: 10, marginBottom: 6, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', minHeight: 52 }}
                            >
                              <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${isSel ? '#FF6B2B' : '#2A2825'}`, background: isSel ? '#FF6B2B' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'white', fontSize: 11, fontWeight: 900 }}>
                                {isSel ? '✓' : ''}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontWeight: 800, fontSize: 13, color: 'white', margin: 0, fontFamily: 'monospace' }}>{t.order_ref}</p>
                                <p style={{ fontSize: 10, color: '#6B6660', fontWeight: 600, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {t.restaurant_name} · {t.delivery_address}
                                </p>
                              </div>
                              <p style={{ fontWeight: 900, fontSize: 14, color: '#FF6B2B', margin: 0, fontFamily: 'monospace' }}>
                                {N}{t.amount.toLocaleString()}
                              </p>
                            </button>
                          )
                        })}

                        {selCount > 0 && (
                          <div style={{ marginTop: 12, padding: 12, background: '#0C0B09', border: '1px solid #FF6B2B', borderRadius: 10 }}>
                            <p className="label-cap" style={{ color: '#FF6B2B', margin: 0, fontSize: 9 }}>
                              Selected — {selCount} order{selCount === 1 ? '' : 's'}
                            </p>
                            <p className="font-display" style={{ fontSize: 22, color: 'white', margin: '2px 0 10px', lineHeight: 1 }}>
                              {N}{selAmount.toLocaleString()}
                            </p>
                            <input
                              value={paystackRef[r.runner_id] ?? ''}
                              onChange={e => setPaystackRef(p => ({ ...p, [r.runner_id]: e.target.value }))}
                              placeholder="Paystack ref (optional)"
                              style={{ width: '100%', background: '#1A1917', border: '1px solid #2A2825', borderRadius: 8, padding: 10, fontSize: 12, fontWeight: 700, color: 'white', fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box', marginBottom: 8, minHeight: 40 }}
                            />
                            <button
                              onClick={() => markPaid(r)}
                              disabled={paying[r.runner_id]}
                              className="press"
                              style={{ width: '100%', background: paying[r.runner_id] ? '#cc5522' : '#FF6B2B', color: 'white', fontWeight: 900, fontSize: 14, padding: 12, borderRadius: 10, border: 'none', cursor: paying[r.runner_id] ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: paying[r.runner_id] ? 0.7 : 1, minHeight: 44 }}
                            >
                              {paying[r.runner_id] ? 'Marking...' : `Mark ${N}${selAmount.toLocaleString()} as sent →`}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* History section */}
                    {r.transfers.filter(t => t.status === 'sent').length > 0 && (
                      <div>
                        <p className="label-cap" style={{ color: '#A09A8E', margin: '0 0 6px', fontSize: 9 }}>
                          Paid ({r.transfers.filter(t => t.status === 'sent').length})
                        </p>
                        {r.transfers.filter(t => t.status === 'sent').slice(0, 5).map(t => (
                          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#0C0B09', borderRadius: 8, padding: '8px 10px', marginBottom: 4 }}>
                            <span style={{ color: '#1DB954', fontSize: 12 }}>✓</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontWeight: 700, fontSize: 12, color: '#A09A8E', margin: 0, fontFamily: 'monospace' }}>{t.order_ref}</p>
                              <p style={{ fontSize: 10, color: '#6B6660', fontWeight: 600, margin: '1px 0 0' }}>
                                {t.paid_at && new Date(t.paid_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                              </p>
                            </div>
                            <p style={{ fontWeight: 800, fontSize: 12, color: '#6B6660', margin: 0, fontFamily: 'monospace' }}>
                              {N}{t.amount.toLocaleString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
