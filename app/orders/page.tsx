'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { OrderItemList } from '@/components/ui/OrderItemList'
import { monogram } from '@/lib/utils'
import { useCartStore } from '@/store/cart'
import { BottomNav } from '@/components/ui/BottomNav'
import type { Order } from '@/types'
import { Package, Search, X } from 'lucide-react'

// Encoding-safe constants
const N = '\u20A6'

const PILL: Record<string, { cls: string; label: string }> = {
  pending:         { cls: 'pill-warn',   label: 'Pending'         },
  confirmed:       { cls: 'pill-info',   label: 'Confirmed'       },
  awaiting_runner: { cls: 'pill-accent', label: 'Finding runner'  },
  runner_assigned: { cls: 'pill-accent', label: 'Runner assigned' },
  preparing:       { cls: 'pill-accent', label: 'Preparing'       },
  picked_up:       { cls: 'pill-ok',     label: 'On the way'      },
  delivered:       { cls: 'pill-ok',     label: 'Delivered'       },
  cancelled:       { cls: 'pill-mute',   label: 'Cancelled'       },
  needs_attention: { cls: 'pill-danger', label: 'Issue'           },
}

export default function OrdersPage() {
  const router   = useRouter()
  const supabase = createClient()
  const { addItem, clearCart } = useCartStore()

  const [orders,     setOrders]     = useState<Order[]>([])
  const [loading,    setLoading]    = useState(true)
  const [tab,        setTab]        = useState<'active' | 'past'>('active')
  const [reordering, setReordering] = useState<string | null>(null)
  const [ratingOrder, setRatingOrder] = useState<Order | null>(null)
  const [ratedIds, setRatedIds] = useState<Set<string>>(new Set())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  // ── search ──────────────────────────────────────────────
  const [query, setQuery] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const [{ data }, { data: rated }] = await Promise.all([
        supabase
          .from('orders')
          .select('*, restaurant:restaurants(name, emoji, id)')
          .eq('customer_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('ratings')
          .select('order_id')
          .eq('customer_id', user.id),
      ])
      setOrders(data ?? [])
      setRatedIds(new Set((rated ?? []).map(r => r.order_id as string)))
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── reorder ──────────────────────────────────────────────
  async function handleReorder(order: Order) {
    const restaurant = order.restaurant as { id: string; name: string; emoji: string } | null
    if (!restaurant || !order.items?.length) return

    setReordering(order.id)

    const itemIds = order.items.map((i: { menu_item_id: string }) => i.menu_item_id)
    const { data: menuItems } = await supabase
      .from('menu_items')
      .select('id, name, price, is_available')
      .in('id', itemIds)

    const available = (menuItems ?? []).filter(m => m.is_available)
    if (!available.length) {
      alert('Sorry, none of the items from this order are available anymore.')
      setReordering(null)
      return
    }

    clearCart()
    for (const prev of order.items) {
      const current = available.find(m => m.id === prev.menu_item_id)
      if (!current) continue
      for (let i = 0; i < prev.quantity; i++) {
        addItem(
          { id: current.id, name: current.name, price: current.price, is_available: true, restaurant_id: restaurant.id, category: '', description: '' },
          restaurant.id,
          restaurant.name
        )
      }
    }

    setReordering(null)
    router.push('/checkout')
  }

  // ── filtering ────────────────────────────────────────────
  const activeOrders = useMemo(() => orders.filter(o => !['delivered', 'cancelled'].includes(o.status)), [orders])
  const pastOrders   = useMemo(() => orders.filter(o =>  ['delivered', 'cancelled'].includes(o.status)), [orders])

  const base = tab === 'active' ? activeOrders : pastOrders

  const display = useMemo(() => {
    if (!query.trim()) return base
    const q = query.toLowerCase()
    return base.filter(o => {
      const rest = o.restaurant as { name: string } | null
      const matchRef  = o.order_ref?.toLowerCase().includes(q)
      const matchRest = rest?.name?.toLowerCase().includes(q)
      const matchItem = Array.isArray(o.items) && o.items.some((i: { name: string }) => i.name?.toLowerCase().includes(q))
      return matchRef || matchRest || matchItem
    })
  }, [base, query])

  if (loading) return (
    <div className="mobile-container" style={{ padding: '56px 16px' }}>
      <div style={{ height: 28, width: 120, background: 'var(--bg-1, #1A1917)', borderRadius: 8 }} />
      <div style={{ height: 12, width: 180, background: 'var(--bg-1, #1A1917)', borderRadius: 6, marginTop: 8 }} />
      <div style={{ height: 40, background: 'var(--bg-1, #1A1917)', borderRadius: 12, marginTop: 16 }} />
      {[1, 2, 3].map(i => <div key={i} style={{ height: 88, background: 'var(--bg-1, #1A1917)', borderRadius: 16, marginTop: 10 }} />)}
    </div>
  )

  return (
    <div className="mobile-container" style={{ display: 'flex', flexDirection: 'column', fontFamily: "'Nunito', system-ui, sans-serif" }}>

      {/* Header */}
      <div className="dot-texture" style={{ padding: '56px 20px 14px', borderBottom: '1px solid var(--line-soft, #1F1D1B)' }}>
        <p className="label-cap fade-up-1" style={{ color: 'var(--ink-3, #6B6660)', margin: 0, fontSize: 10 }}>Your orders</p>
        <h1 className="font-display fade-up-2" style={{ color: 'white', fontSize: 28, margin: '4px 0 12px' }}>History</h1>

        {/* ── Search bar ── */}
        <div className="fade-up-3" style={{ position: 'relative' }}>
          <Search size={14} strokeWidth={2.4} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3, #6B6660)', pointerEvents: 'none' }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by ref, restaurant, or item..."
            aria-label="Search orders"
            style={{
              width: '100%', boxSizing: 'border-box' as const,
              background: 'var(--bg-1, #1A1917)',
              border: query ? '1px solid var(--accent, #FF6B2B)' : '1px solid var(--line, #2A2825)',
              borderRadius: 12, padding: '10px 36px 10px 36px',
              color: 'white', fontSize: 13, fontWeight: 600,
              fontFamily: 'inherit', outline: 'none',
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear search"
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--ink-3, #6B6660)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2 }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="fade-up-3" style={{ display: 'flex', margin: '14px 16px 0', background: 'var(--bg-1, #1A1917)', borderRadius: 12, padding: 4, border: '1px solid var(--line, #2A2825)' }}>
        {(['active', 'past'] as const).map(t => {
          const on = tab === t
          return (
            <button
              key={t}
              onClick={() => { setTab(t); setQuery('') }}
              className="press"
              aria-pressed={on}
              style={{ flex: 1, padding: '9px', borderRadius: 9, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12, fontFamily: 'inherit', background: on ? 'white' : 'transparent', color: on ? 'var(--bg-0, #0C0B09)' : 'var(--ink-3, #6B6660)' }}
            >
              {t === 'active' ? `Active (${activeOrders.length})` : `Past (${pastOrders.length})`}
            </button>
          )
        })}
      </div>

      {/* Search results label */}
      {query && (
        <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', fontSize: 9, margin: '10px 16px 0' }}>
          {display.length} result{display.length !== 1 ? 's' : ''} for &quot;{query}&quot;
        </p>
      )}

      {/* Order list */}
      <div className="scroll-hide" style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 16px' }}>
        {display.length === 0 ? (
          query ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-3, #6B6660)', fontWeight: 600 }}>
              <Search size={32} style={{ marginBottom: 10, opacity: 0.4 }} />
              <p style={{ margin: 0 }}>No orders match &quot;{query}&quot;</p>
            </div>
          ) : (
            <EmptyState tab={tab} />
          )
        ) : display.map((order, i) => {
          const meta       = PILL[order.status] ?? { cls: 'pill-mute', label: order.status }
          const restaurant = order.restaurant as { name: string; emoji?: string; id: string } | null
          const isActive   = !['delivered', 'cancelled'].includes(order.status)
          const isDelivered = order.status === 'delivered'

          return (
            <div
              key={order.id}
              className={`press fade-up-${Math.min(i + 1, 5)}`}
              onClick={() => isActive && router.push(`/track/${order.id}`)}
              style={{ background: 'var(--bg-1, #1A1917)', border: '1px solid var(--line, #2A2825)', borderRadius: 16, padding: '14px 16px', marginBottom: 10, cursor: isActive ? 'pointer' : 'default' }}
            >
              {/* Card header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div className="stripe-placeholder-soft" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span className="font-display" style={{ color: 'var(--accent, #FF6B2B)', fontSize: 12 }}>{monogram(restaurant?.name)}</span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 800, fontSize: 14, color: 'white', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {restaurant?.name ?? '\u2014'}
                    </p>
                    <p className="font-mono" style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '2px 0 0', letterSpacing: '0.08em' }}>
                      {order.order_ref}
                    </p>
                  </div>
                </div>
                <span className={`pill ${meta.cls}`}>{meta.label}</span>
              </div>

              {/* Card footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={e => { e.stopPropagation(); toggleExpand(order.id) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 700 }}>
                      {Array.isArray(order.items) ? order.items.length : 0} item{Array.isArray(order.items) && order.items.length !== 1 ? 's' : ''}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--ink-3, #6B6660)', display: 'inline-block', transition: 'transform 0.15s', transform: expandedIds.has(order.id) ? 'rotate(180deg)' : 'none' }}>{'\u25BE'}</span>
                  </button>
                  <span style={{ fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 600 }}>{'\u00B7'} {N}{((order.food_total || 0) + (order.delivery_fee || 0)).toLocaleString()}</span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--ink-4, #444038)', fontWeight: 600, margin: 0 }}>
                  {new Date(order.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              {expandedIds.has(order.id) && Array.isArray(order.items) && order.items.length > 0 && (
                <div style={{ marginTop: 6, padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid var(--line-soft, #1F1D1B)' }}>
                  <OrderItemList items={order.items} theme="dark" showPrices={false} />
                </div>
              )}

              {/* Action row */}
              {isActive ? (
                <div style={{ marginTop: 10, background: 'var(--bg-0, #0C0B09)', borderRadius: 8, padding: '8px 12px' }}>
                  <span style={{ fontSize: 12, color: 'var(--accent, #FF6B2B)', fontWeight: 700 }}>Track order {'\u2192'}</span>
                </div>
              ) : (
                <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                  <button
                    onClick={e => { e.stopPropagation(); handleReorder(order) }}
                    disabled={reordering === order.id}
                    className="press"
                    style={{ flex: 1, background: reordering === order.id ? 'var(--bg-0)' : 'var(--accent-dim, #1A0D00)', border: '1px solid rgba(255,107,43,0.3)', borderRadius: 8, padding: '8px 12px', cursor: reordering === order.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit', textAlign: 'center' as const }}
                  >
                    <span style={{ fontSize: 12, color: 'var(--accent, #FF6B2B)', fontWeight: 700 }}>
                      {reordering === order.id ? '...' : '\uD83D\uDD01 Reorder'}
                    </span>
                  </button>
                  {isDelivered && !ratedIds.has(order.id) && (
                    <button
                      onClick={e => { e.stopPropagation(); setRatingOrder(order) }}
                      className="press"
                      style={{ flex: 1, background: 'var(--bg-0, #0C0B09)', border: '1px solid rgba(29,185,84,0.25)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' as const }}
                    >
                      <span style={{ fontSize: 12, color: 'var(--ok, #1DB954)', fontWeight: 700 }}>{'\u2605'} Rate runner</span>
                    </button>
                  )}
                  {isDelivered && ratedIds.has(order.id) && (
                    <div style={{ flex: 1, background: 'var(--bg-0, #0C0B09)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' as const, opacity: 0.6 }}>
                      <span style={{ fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 700 }}>Rated</span>
                    </div>
                  )}
                  <Link href={`/receipt/${order.id}`} onClick={e => e.stopPropagation()} className="press" style={{ flex: 1, background: 'var(--bg-0, #0C0B09)', borderRadius: 8, padding: '8px 12px', textDecoration: 'none', textAlign: 'center' as const }}>
                    <span style={{ fontSize: 12, color: 'var(--accent, #FF6B2B)', fontWeight: 700 }}>Receipt {'\u2192'}</span>
                  </Link>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {ratingOrder && (
        <RatingSheet
          order={ratingOrder}
          onClose={() => setRatingOrder(null)}
          onSubmitted={() => {
            setRatedIds(prev => new Set(prev).add(ratingOrder.id))
            setRatingOrder(null)
          }}
        />
      )}
      <BottomNav active="orders" />
    </div>
  )
}

function EmptyState({ tab }: { tab: 'active' | 'past' }) {
  return (
    <div style={{ textAlign: 'center', padding: '52px 16px' }}>
      <div className="stripe-placeholder-soft" style={{ width: 72, height: 72, borderRadius: 18, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Package size={28} color="var(--ink-3, #6B6660)" />
      </div>
      <p className="font-display" style={{ fontSize: 18, color: 'white', margin: 0 }}>
        {tab === 'active' ? 'No orders in flight' : 'No past orders yet'}
      </p>
      <p style={{ fontSize: 13, color: 'var(--ink-3, #6B6660)', fontWeight: 500, margin: '6px 0 18px', lineHeight: 1.5, maxWidth: 280, marginLeft: 'auto', marginRight: 'auto' }}>
        {tab === 'active' ? "Once you place an order, you\u2019ll track it live from here." : 'Your delivered and cancelled orders show up here.'}
      </p>
      {tab === 'active' && (
        <Link href="/home" className="press" style={{ display: 'inline-block', background: 'var(--accent, #FF6B2B)', color: 'white', fontWeight: 800, fontSize: 13, padding: '12px 24px', borderRadius: 12, textDecoration: 'none' }}>
          Browse restaurants
        </Link>
      )}
    </div>
  )
}

function RatingSheet({ order, onClose, onSubmitted }: {
  order: Order
  onClose: () => void
  onSubmitted: () => void
}) {
  const [runnerStars, setRunnerStars] = useState(0)
  const [restaurantStars, setRestaurantStars] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const runner = order.runner as { full_name?: string } | null
  const restaurant = order.restaurant as { name?: string } | null

  async function submit() {
    if (runnerStars < 1) { setError('Tap a star for your runner'); return }
    setSubmitting(true); setError('')
    const res = await fetch('/api/orders/rate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.id,
        stars: runnerStars,
        comment: comment.trim() || undefined,
        restaurantStars: restaurantStars || undefined,
      }),
    })
    const { error: err } = await res.json()
    setSubmitting(false)
    if (err) { setError(err); return }
    onSubmitted()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', maxWidth: 430, margin: '0 auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ width: '100%', background: 'var(--bg-1, #1A1917)', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: '20px 20px 32px', border: '1px solid var(--line, #2A2825)', borderBottom: 'none' }}>
        <div style={{ width: 36, height: 4, background: 'var(--line, #2A2825)', borderRadius: 2, margin: '0 auto 18px' }} />

        <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', fontSize: 10, margin: '0 0 4px' }}>How was it?</p>
        <h2 className="font-display" style={{ fontSize: 20, color: 'white', margin: '0 0 4px' }}>Rate your delivery</h2>
        <p style={{ fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '0 0 20px' }}>
          Order {order.order_ref}
        </p>

        {/* Runner stars */}
        <div style={{ marginBottom: 18 }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-2, #A09A8E)', margin: '0 0 4px' }}>
            Runner {runner?.full_name ? `· ${runner.full_name}` : ''}
          </p>
          <p style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '0 0 10px' }}>
            How was your delivery experience?
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => setRunnerStars(n)} className="press"
                style={{ flex: 1, height: 46, background: n <= runnerStars ? 'rgba(255,107,43,0.12)' : 'var(--bg-0, #0C0B09)', border: `1px solid ${n <= runnerStars ? 'var(--accent, #FF6B2B)' : 'var(--line, #2A2825)'}`, borderRadius: 12, fontSize: 22, cursor: 'pointer', color: n <= runnerStars ? 'var(--accent, #FF6B2B)' : 'var(--ink-3, #6B6660)', fontFamily: 'inherit' }}>
                {'★'}
              </button>
            ))}
          </div>
        </div>

        {/* Restaurant stars (optional) */}
        <div style={{ marginBottom: 18 }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-2, #A09A8E)', margin: '0 0 4px' }}>
            Restaurant {restaurant?.name ? `· ${restaurant.name}` : ''} <span style={{ color: 'var(--ink-3, #6B6660)', fontWeight: 600 }}>(optional)</span>
          </p>
          <p style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '0 0 10px' }}>
            How was the food?
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => setRestaurantStars(restaurantStars === n ? 0 : n)} className="press"
                style={{ flex: 1, height: 38, background: n <= restaurantStars ? 'rgba(255,107,43,0.12)' : 'var(--bg-0, #0C0B09)', border: `1px solid ${n <= restaurantStars ? 'var(--accent, #FF6B2B)' : 'var(--line, #2A2825)'}`, borderRadius: 10, fontSize: 16, cursor: 'pointer', color: n <= restaurantStars ? 'var(--accent, #FF6B2B)' : 'var(--ink-3, #6B6660)', fontFamily: 'inherit' }}>
                {'★'}
              </button>
            ))}
          </div>
        </div>

        {/* Comment */}
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-2, #A09A8E)', margin: '0 0 6px' }}>
            Comment <span style={{ color: 'var(--ink-3, #6B6660)', fontWeight: 600 }}>(optional)</span>
          </p>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value.slice(0, 200))}
            placeholder="What stood out?"
            rows={2}
            style={{ width: '100%', background: 'var(--bg-0, #0C0B09)', border: '1px solid var(--line, #2A2825)', borderRadius: 12, padding: '10px 12px', color: 'white', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', resize: 'none', outline: 'none', boxSizing: 'border-box' as const }}
          />
          <p style={{ fontSize: 10, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '4px 0 0', textAlign: 'right' as const }}>
            {comment.length}/200
          </p>
        </div>

        {error && (
          <p style={{ fontSize: 12, color: 'var(--danger, #FF3B30)', fontWeight: 700, margin: '0 0 10px', textAlign: 'center' as const }}>{error}</p>
        )}

        <button onClick={submit} disabled={submitting || runnerStars < 1} className="press"
          style={{ width: '100%', background: runnerStars > 0 ? 'var(--accent, #FF6B2B)' : 'var(--bg-2, #26241F)', color: runnerStars > 0 ? 'white' : 'var(--ink-3, #6B6660)', border: 'none', borderRadius: 14, padding: '13px', fontWeight: 900, fontSize: 15, cursor: runnerStars > 0 ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
          {submitting ? 'Submitting…' : 'Submit rating'}
        </button>
        <button onClick={onClose}
          style={{ width: '100%', marginTop: 6, background: 'transparent', border: 'none', color: 'var(--ink-3, #6B6660)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: '6px 0' }}>
          Maybe later
        </button>
      </div>
    </div>
  )
}
