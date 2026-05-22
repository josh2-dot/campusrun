'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const N = '\u20A6'

interface Transfer {
  id:         string
  order_ref:  string
  amount:     number
  status:     'pending' | 'paid'
  created_at: string
  paid_at:    string | null
  paid_ref:   string | null
}

interface RestaurantQueue {
  restaurant_id:   string
  restaurant_name: string
  bank_name:       string | null
  account_number:  string | null
  account_name:    string | null
  pendingAmount:   number
  pendingCount:    number
  transfers:       Transfer[]
}

export default function AdminPaymentsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [restaurants, setRestaurants] = useState<RestaurantQueue[]>([])
  const [totalPending, setTotalPending] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [tab, setTab] = useState<'pending' | 'history'>('pending')

  // Paying state: restaurant_id → { paidRef, paying, selected transfer IDs }
  const [paying, setPaying]           = useState<Record<string, boolean>>({})
  const [paidRef, setPaidRef]         = useState<Record<string, string>>({})
  const [selected, setSelected]       = useState<Record<string, Set<string>>>({})

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/restaurant-payments')
    if (res.status === 403) { router.push('/home'); return }
    const data = await res.json()
    setRestaurants(data.restaurants ?? [])
    setTotalPending(data.totalPending ?? 0)
    setLoading(false)
  }, [router])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      load()
    })
  }, [load, router, supabase])

  function toggleSelect(restaurantId: string, transferId: string) {
    setSelected(prev => {
      const cur = new Set(prev[restaurantId] ?? [])
      cur.has(transferId) ? cur.delete(transferId) : cur.add(transferId)
      return { ...prev, [restaurantId]: cur }
    })
  }

  function selectAllPending(r: RestaurantQueue) {
    const pendingIds = r.transfers.filter(t => t.status === 'pending').map(t => t.id)
    setSelected(prev => ({ ...prev, [r.restaurant_id]: new Set(pendingIds) }))
  }

  async function markPaid(r: RestaurantQueue) {
    const ids = [...(selected[r.restaurant_id] ?? [])]
    if (!ids.length) return
    setPaying(p => ({ ...p, [r.restaurant_id]: true }))
    await fetch('/api/admin/restaurant-payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transferIds: ids, paidRef: paidRef[r.restaurant_id] }),
    })
    setSelected(p => ({ ...p, [r.restaurant_id]: new Set() }))
    setPaidRef(p => ({ ...p, [r.restaurant_id]: '' }))
    setPaying(p => ({ ...p, [r.restaurant_id]: false }))
    await load()
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-0, #0C0B09)', fontSize: 40 }}>
      {'\uD83C\uDFE6'}
    </div>
  )

  const pendingRestaurants = restaurants.filter(r => r.pendingCount > 0)
  const paidRestaurants    = restaurants.filter(r => r.pendingCount === 0 && r.transfers.length > 0)

  return (
    <div
      className="mobile-container"
      style={{ display: 'flex', flexDirection: 'column', fontFamily: "'Nunito', system-ui, sans-serif" }}
    >
      {/* Header */}
      <div className="dot-texture" style={{ padding: '52px 20px 20px', borderBottom: '1px solid var(--line, #2A2825)' }}>
        <Link href="/admin/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--ink-2, #A09A8E)', textDecoration: 'none', marginBottom: 12 }}>
          {'\u2190'} Dashboard
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 className="font-display" style={{ color: 'white', fontSize: 24, margin: 0 }}>Restaurant Payments</h1>
            <p style={{ color: 'var(--ink-3, #6B6660)', fontSize: 12, fontWeight: 600, margin: '4px 0 0' }}>
              Float-based — pay from your account, track here
            </p>
          </div>
          {totalPending > 0 && (
            <div style={{ background: 'rgba(255,107,43,0.12)', border: '1px solid rgba(255,107,43,0.3)', borderRadius: 12, padding: '8px 12px', textAlign: 'right' }}>
              <p className="font-display" style={{ color: 'var(--accent, #FF6B2B)', fontSize: 18, margin: 0, lineHeight: 1 }}>
                {N}{totalPending.toLocaleString()}
              </p>
              <p style={{ color: 'var(--ink-3, #6B6660)', fontSize: 10, fontWeight: 700, margin: '2px 0 0' }}>owed total</p>
            </div>
          )}
        </div>
      </div>

      {/* Float tip */}
      <div style={{ margin: '12px 14px 0', background: 'rgba(74,158,255,0.07)', border: '1px solid rgba(74,158,255,0.2)', borderRadius: 12, padding: '10px 14px' }}>
        <p style={{ fontSize: 12, color: '#4A9EFF', fontWeight: 700, margin: 0, lineHeight: 1.5 }}>
          {'\uD83D\uDCA1'} Float model: Customer pays Paystack {'\u2192'} you pay restaurants from your account {'\u2192'} Paystack settles T+1 and replenishes float. Float needed = avg food cost {'\u00D7'} daily orders.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', margin: '12px 14px 0', background: 'var(--bg-1, #1A1917)', borderRadius: 12, padding: 4, border: '1px solid var(--line, #2A2825)' }}>
        {(['pending', 'history'] as const).map(t => {
          const on = tab === t
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="press"
              style={{ flex: 1, padding: '8px', borderRadius: 9, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12, fontFamily: 'inherit', background: on ? 'var(--accent, #FF6B2B)' : 'transparent', color: on ? 'white' : 'var(--ink-3, #6B6660)' }}
            >
              {t === 'pending' ? `Unpaid (${pendingRestaurants.length})` : `History (${paidRestaurants.length})`}
            </button>
          )
        })}
      </div>

      <div className="scroll-hide" style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 24px' }}>

        {/* PENDING TAB */}
        {tab === 'pending' && (
          pendingRestaurants.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>{'\u2705'}</div>
              <p className="font-display" style={{ color: 'white', fontSize: 18, margin: 0 }}>All restaurants paid up!</p>
            </div>
          ) : pendingRestaurants.map(r => {
            const selSet   = selected[r.restaurant_id] ?? new Set()
            const selCount = selSet.size
            const selTotal = r.transfers.filter(t => selSet.has(t.id)).reduce((s, t) => s + t.amount, 0)
            const isPaying = !!paying[r.restaurant_id]
            const hasBankDetails = r.bank_name && r.account_number && r.account_name
            const isExpanded = expanded === r.restaurant_id

            return (
              <div
                key={r.restaurant_id}
                style={{ background: 'var(--bg-1, #1A1917)', borderRadius: 16, marginBottom: 12, border: '1px solid rgba(255,107,43,0.2)', overflow: 'hidden' }}
              >
                {/* Restaurant header */}
                <button
                  onClick={() => setExpanded(isExpanded ? null : r.restaurant_id)}
                  style={{ width: '100%', background: 'none', border: 'none', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
                >
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,107,43,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                    {'\uD83C\uDFEA'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 800, fontSize: 14, color: 'white', margin: 0 }}>{r.restaurant_name}</p>
                    <p style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '2px 0 0' }}>
                      {r.pendingCount} order{r.pendingCount !== 1 ? 's' : ''} unpaid
                      {hasBankDetails
                        ? ` \u00B7 ${r.bank_name}`
                        : ' \u00B7 \u26A0\uFE0F No bank details'}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p className="font-display" style={{ fontSize: 18, color: 'var(--accent, #FF6B2B)', margin: 0 }}>
                      {N}{r.pendingAmount.toLocaleString()}
                    </p>
                    <span style={{ color: 'var(--ink-3, #6B6660)', fontSize: 11 }}>{isExpanded ? '\u25B2' : '\u25BC'}</span>
                  </div>
                </button>

                {/* Expanded */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--line, #2A2825)', padding: '12px 16px 16px' }}>

                    {/* Bank details card */}
                    {hasBankDetails ? (
                      <div style={{ background: 'var(--bg-0, #0C0B09)', borderRadius: 12, padding: '12px 14px', marginBottom: 12, border: '1px solid var(--line, #2A2825)' }}>
                        <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', fontSize: 9, margin: '0 0 8px' }}>Bank details — transfer from your account</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {[
                            { lbl: 'Bank',    val: r.bank_name!    },
                            { lbl: 'Account', val: r.account_number! },
                            { lbl: 'Name',    val: r.account_name!  },
                          ].map(row => (
                            <div key={row.lbl} style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 600 }}>{row.lbl}</span>
                              <span style={{ fontSize: 12, color: 'white', fontWeight: 700 }}>{row.val}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ background: 'rgba(255,184,0,0.08)', borderRadius: 12, padding: '10px 14px', marginBottom: 12, border: '1px solid rgba(255,184,0,0.2)' }}>
                        <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--warn, #FFB800)', margin: 0 }}>
                          {'\u26A0\uFE0F'} No bank details on file for this restaurant.
                        </p>
                        <Link href="/admin/restaurants" style={{ fontSize: 12, color: 'var(--accent, #FF6B2B)', fontWeight: 700, textDecoration: 'none' }}>
                          Add bank details in Restaurants {'\u2192'}
                        </Link>
                      </div>
                    )}

                    {/* Select all */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', fontSize: 9, margin: 0 }}>
                        Pending orders ({r.pendingCount})
                      </p>
                      <button
                        onClick={() => selectAllPending(r)}
                        style={{ background: 'none', border: 'none', color: 'var(--accent, #FF6B2B)', fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        Select all
                      </button>
                    </div>

                    {/* Transfer rows */}
                    {r.transfers.filter(t => t.status === 'pending').map(t => {
                      const isSel = selSet.has(t.id)
                      return (
                        <button
                          key={t.id}
                          onClick={() => toggleSelect(r.restaurant_id, t.id)}
                          style={{
                            width: '100%', background: isSel ? 'rgba(255,107,43,0.08)' : 'var(--bg-0, #0C0B09)',
                            border: `1px solid ${isSel ? 'rgba(255,107,43,0.4)' : 'var(--line, #2A2825)'}`,
                            borderRadius: 10, padding: '10px 12px', marginBottom: 6,
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 18, height: 18, borderRadius: 5, background: isSel ? 'var(--accent, #FF6B2B)' : 'var(--bg-2, #26241F)', border: `1.5px solid ${isSel ? 'var(--accent, #FF6B2B)' : 'var(--line, #2A2825)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {isSel && <span style={{ color: 'white', fontSize: 11, fontWeight: 900 }}>{'\u2713'}</span>}
                            </div>
                            <span className="font-mono" style={{ fontSize: 12, color: 'var(--ink-2, #A09A8E)', fontWeight: 600, letterSpacing: '0.06em' }}>{t.order_ref}</span>
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 800, color: isSel ? 'var(--accent, #FF6B2B)' : 'white' }}>
                            {N}{t.amount.toLocaleString()}
                          </span>
                        </button>
                      )
                    })}

                    {/* Pay selected */}
                    {selCount > 0 && (
                      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input
                          value={paidRef[r.restaurant_id] ?? ''}
                          onChange={e => setPaidRef(p => ({ ...p, [r.restaurant_id]: e.target.value }))}
                          placeholder="Transfer reference / narration (optional)"
                          style={{ width: '100%', background: 'var(--bg-0, #0C0B09)', border: '1px solid var(--line, #2A2825)', borderRadius: 10, padding: '10px 12px', color: 'white', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }}
                        />
                        <button
                          onClick={() => markPaid(r)}
                          disabled={isPaying}
                          className="press"
                          style={{ width: '100%', background: isPaying ? '#1a5c35' : 'var(--ok, #1DB954)', color: 'white', fontWeight: 900, fontSize: 15, padding: '13px', borderRadius: 12, border: 'none', cursor: isPaying ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: isPaying ? 0.7 : 1 }}
                        >
                          {isPaying
                            ? 'Marking...'
                            : `\u2713 Mark ${selCount} transfer${selCount !== 1 ? 's' : ''} paid \u00B7 ${N}${selTotal.toLocaleString()}`}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}

        {/* HISTORY TAB */}
        {tab === 'history' && (
          paidRestaurants.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--ink-3, #6B6660)', fontWeight: 600 }}>
              No paid history yet
            </div>
          ) : paidRestaurants.map(r => (
            <div key={r.restaurant_id} style={{ background: 'var(--bg-1, #1A1917)', borderRadius: 14, padding: 16, marginBottom: 10, border: '1px solid var(--line, #2A2825)' }}>
              <p style={{ fontWeight: 800, fontSize: 14, color: 'white', margin: '0 0 10px' }}>{r.restaurant_name}</p>
              {r.transfers.filter(t => t.status === 'paid').map(t => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--line-soft, #1F1D1B)' }}>
                  <div>
                    <span className="font-mono" style={{ fontSize: 12, color: 'var(--ink-2, #A09A8E)', fontWeight: 600, letterSpacing: '0.06em' }}>{t.order_ref}</span>
                    {t.paid_ref && <span style={{ fontSize: 10, color: 'var(--ink-3, #6B6660)', fontWeight: 600, marginLeft: 8 }}>{t.paid_ref}</span>}
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--ok, #1DB954)', fontWeight: 800 }}>{N}{t.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
