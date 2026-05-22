'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { OrderItemList } from '@/components/ui/OrderItemList'
import type { CartItem } from '@/types'

interface Pool {
  id: string
  restaurant_id: string
  pool_date: string
  peak_time: string
  status: 'open' | 'closed' | 'dispatched' | 'completed'
  total_orders: number
  total_amount: number
  closed_at?: string
  restaurant?: { name: string; location?: string; bank_name?: string; account_number?: string; account_name?: string }
}

interface SubOrder {
  id: string
  order_ref: string
  status: string
  food_total: number
  delivery_address: string
  items: Array<{ name: string; quantity: number; price: number }>
  pre_order_pool_id: string
  customer?: { full_name?: string; phone?: string }
}

const N = '\u20A6'

export default function AdminPreOrdersPage() {
  const router = useRouter()
  const [pools, setPools] = useState<Pool[]>([])
  const [orders, setOrders] = useState<SubOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const r = await fetch('/api/admin/pre-orders')
    const d = await r.json()
    setPools(d.pools ?? [])
    setOrders(d.orders ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function setStatus(poolId: string, action: 'mark_dispatched' | 'mark_completed') {
    setBusy(poolId)
    await fetch('/api/admin/pre-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, poolId }),
    })
    await load()
    setBusy(null)
  }

  const STATUS_META: Record<string, { bg: string; color: string; label: string }> = {
    open:       { bg: 'rgba(255,184,0,0.12)',  color: '#FFB800',  label: 'Open · accepting' },
    closed:     { bg: 'rgba(255,107,43,0.15)', color: '#FF6B2B',  label: 'Closed · ready to pick up' },
    dispatched: { bg: 'rgba(13,107,191,0.12)', color: '#3B82F6',  label: 'Dispatched · runner on it' },
    completed:  { bg: 'rgba(29,185,84,0.12)',  color: '#1DB954',  label: 'Completed' },
  }

  return (
    <div className="mobile-container" style={{ minHeight: '100vh', background: 'var(--bg-0, #0C0B09)', fontFamily: "'Nunito', system-ui, sans-serif" }}>
      <div style={{ padding: '48px 16px 18px', borderBottom: '1px solid var(--line, #2A2825)' }}>
        <button onClick={() => router.push('/admin/dashboard')} className="press"
          style={{ background: 'var(--bg-2, #26241F)', border: '1px solid var(--line, #2A2825)', color: 'white', fontSize: 12, fontWeight: 700, padding: '6px 12px 6px 8px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
          <ChevronLeft size={14} /> Dashboard
        </button>
        <h1 className="font-display" style={{ fontSize: 22, color: 'white', margin: 0 }}>Pre-orders</h1>
        <p style={{ fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '4px 0 0' }}>
          Bulk pickups grouped by restaurant and peak window.
        </p>
      </div>

      <div style={{ padding: 16 }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--ink-3, #6B6660)', fontWeight: 700, fontSize: 13, padding: '40px 0' }}>Loading…</p>
        ) : pools.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <p style={{ fontSize: 14, color: 'var(--ink-3, #6B6660)', fontWeight: 700, margin: 0 }}>No pre-orders yet</p>
            <p style={{ fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '6px 0 0' }}>
              Enable pre-order windows on restaurants from the <a onClick={() => router.push('/admin/restaurants')} style={{ color: 'var(--accent, #FF6B2B)', cursor: 'pointer', textDecoration: 'underline' }}>Restaurants & Menu</a> page.
            </p>
          </div>
        ) : (
          pools.map(pool => {
            const meta = STATUS_META[pool.status] ?? STATUS_META.open
            const subs = orders.filter(o => o.pre_order_pool_id === pool.id)
            const peakLabel = new Date(pool.peak_time).toLocaleString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
            const open = expanded === pool.id

            return (
              <div key={pool.id} style={{ background: 'var(--bg-1, #1A1917)', borderRadius: 16, marginBottom: 12, border: '1px solid var(--line, #2A2825)', overflow: 'hidden' }}>

                {/* Pool header */}
                <button onClick={() => setExpanded(open ? null : pool.id)}
                  style={{ width: '100%', background: 'transparent', border: 'none', padding: '14px 16px', textAlign: 'left' as const, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="font-display" style={{ fontSize: 16, color: 'white', margin: 0 }}>{pool.restaurant?.name ?? 'Unknown restaurant'}</p>
                      <p style={{ fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '3px 0 0' }}>
                        Peak: {peakLabel}
                      </p>
                      <span style={{ display: 'inline-block', marginTop: 6, padding: '3px 9px', borderRadius: 6, background: meta.bg, color: meta.color, fontSize: 10, fontWeight: 800, letterSpacing: '0.04em' }}>
                        {meta.label}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                      <p className="font-display" style={{ fontSize: 22, color: 'var(--accent, #FF6B2B)', margin: 0, lineHeight: 1 }}>{pool.total_orders}</p>
                      <p style={{ fontSize: 10, color: 'var(--ink-3, #6B6660)', fontWeight: 700, margin: '2px 0 0', letterSpacing: '0.08em' }}>ORDERS</p>
                      <p style={{ fontSize: 13, color: 'white', fontWeight: 800, margin: '6px 0 0' }}>{N}{(pool.total_amount ?? 0).toLocaleString()}</p>
                    </div>
                  </div>
                </button>

                {open && (
                  <div style={{ borderTop: '1px solid var(--line, #2A2825)', padding: '12px 16px 16px' }}>
                    {/* Bank for paying the restaurant */}
                    {pool.restaurant?.bank_name && (
                      <div style={{ background: 'var(--bg-0, #0C0B09)', border: '1px solid var(--line, #2A2825)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
                        <p style={{ fontSize: 10, color: 'var(--ink-3, #6B6660)', fontWeight: 800, margin: '0 0 4px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Restaurant bank</p>
                        <p style={{ fontSize: 12, color: 'white', fontWeight: 700, margin: 0 }}>
                          {pool.restaurant.bank_name} · {pool.restaurant.account_number} · {pool.restaurant.account_name}
                        </p>
                      </div>
                    )}

                    {/* Sub-orders list — kitchen printout style */}
                    <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', fontSize: 10, margin: '0 0 8px' }}>Customers ({subs.length})</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {subs.map((o, i) => (
                        <div key={o.id} style={{ background: 'var(--bg-0, #0C0B09)', borderRadius: 10, padding: 12, border: '1px solid var(--line, #2A2825)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontWeight: 900, fontSize: 13, color: 'white', margin: 0 }}>
                                #{i + 1} · {o.customer?.full_name ?? 'Customer'}
                              </p>
                              {o.customer?.phone && (
                                <a href={`tel:${o.customer.phone}`} style={{ fontSize: 12, color: 'var(--accent, #FF6B2B)', fontWeight: 700, textDecoration: 'none' }}>
                                  {o.customer.phone}
                                </a>
                              )}
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 700 }}>{o.order_ref}</span>
                          </div>

                          {/* Items */}
                          <div style={{ marginTop: 6, paddingLeft: 0 }}>
              {Array.isArray(o.items) && o.items.length > 0 && (
                <OrderItemList items={o.items as CartItem[]} theme="admin" showPrices={false} />
              )}
                          </div>

                          {/* Drop address */}
                          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line, #2A2825)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                            <p style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: 0, flex: 1 }}>
                              {'📍'} {o.delivery_address}
                            </p>
                            <span style={{ fontSize: 12, color: 'white', fontWeight: 800, flexShrink: 0 }}>
                              {N}{(o.food_total ?? 0).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                      {pool.status === 'closed' && (
                        <button onClick={() => setStatus(pool.id, 'mark_dispatched')} disabled={busy === pool.id} className="press"
                          style={{ flex: 1, background: 'var(--accent, #FF6B2B)', color: 'white', border: 'none', borderRadius: 10, padding: '10px', fontWeight: 900, fontSize: 13, cursor: busy === pool.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: busy === pool.id ? 0.6 : 1 }}>
                          {busy === pool.id ? 'Saving…' : 'Mark dispatched'}
                        </button>
                      )}
                      {pool.status === 'dispatched' && (
                        <button onClick={() => setStatus(pool.id, 'mark_completed')} disabled={busy === pool.id} className="press"
                          style={{ flex: 1, background: 'var(--ok, #1DB954)', color: 'white', border: 'none', borderRadius: 10, padding: '10px', fontWeight: 900, fontSize: 13, cursor: busy === pool.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: busy === pool.id ? 0.6 : 1 }}>
                          {busy === pool.id ? 'Saving…' : 'Mark completed'}
                        </button>
                      )}
                      {pool.status === 'open' && (
                        <p style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: 0, padding: '8px 0' }}>
                          Pool is still accepting orders. Closes at {new Date(pool.peak_time).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit', hour12: true })}.
                        </p>
                      )}
                    </div>
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
