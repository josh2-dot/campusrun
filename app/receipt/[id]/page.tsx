'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Order } from '@/types'
import { ChevronLeft } from 'lucide-react'

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('orders')
      .select('*, restaurant_id, restaurant:restaurants(name, location, emoji), customer:users!customer_id(full_name, phone)')
      .eq('id', id)
      .single()
      .then(({ data }) => { setOrder(data); setLoading(false) })
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-0, #0C0B09)' }}>
      <div className="font-display" style={{ color: 'var(--accent, #FF6B2B)', fontSize: 14 }}>Loading…</div>
    </div>
  )
  if (!order) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3, #6B6660)', background: 'var(--bg-0, #0C0B09)', minHeight: '100vh' }}>
      Receipt not found
    </div>
  )

  const restaurant = order.restaurant as { name: string; location: string; emoji: string } | null
  const customer = order.customer as { full_name: string; phone: string } | null
  const isDelivered = order.status === 'delivered'
  const isCancelled = order.status === 'cancelled'
  const refundStatus = (order as Order & { refund_status?: string }).refund_status
  const total = (order.food_total ?? 0) + (order.delivery_fee ?? 0)
  const dateStr = new Date(order.created_at).toLocaleDateString('en-NG', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })

  const dashed = '1px dashed #C9C0B0'
  const mono = "'Courier New', ui-monospace, monospace"

  return (
    <div className="mobile-container" style={{ minHeight: '100vh', background: 'var(--bg-0, #0C0B09)', fontFamily: "'Nunito', system-ui, sans-serif" }}>

      {/* Top bar */}
      <div style={{ padding: '48px 16px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => router.back()} className="press"
          style={{ background: 'var(--bg-2, #26241F)', border: '1px solid var(--line, #2A2825)', color: 'white', fontSize: 12, fontWeight: 700, padding: '6px 12px 6px 8px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
          <ChevronLeft size={14} /> Back
        </button>
        <span className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', fontSize: 10 }}>Receipt</span>
      </div>

      {/* PAPER RECEIPT */}
      <div style={{ padding: '12px 16px 24px' }}>
        <div style={{
          background: '#FAF5E8',
          borderRadius: 6,
          padding: '28px 24px 24px',
          color: '#1A1917',
          boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
          position: 'relative',
        }}>
          {/* Header */}
          <div style={{ textAlign: 'center', borderBottom: dashed, paddingBottom: 14, marginBottom: 14 }}>
            <p className="font-display" style={{ color: '#FF6B2B', fontSize: 22, margin: 0, letterSpacing: '0.04em' }}>
              CAMPUSRUN
            </p>
            <p style={{ fontSize: 11, color: '#6B6660', fontWeight: 700, margin: '4px 0 0', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Campus food delivery
            </p>
          </div>

          {/* Order meta */}
          <div style={{ fontFamily: mono, fontSize: 12, color: '#3A3530', lineHeight: 1.8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8B857B' }}>REF</span>
              <span style={{ fontWeight: 700, letterSpacing: '0.04em' }}>{order.order_ref}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8B857B' }}>DATE</span>
              <span style={{ fontWeight: 700 }}>{dateStr}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8B857B' }}>NAME</span>
              <span style={{ fontWeight: 700 }}>{customer?.full_name ?? '\u2014'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8B857B' }}>FROM</span>
              <span style={{ fontWeight: 700 }}>{restaurant?.name ?? '\u2014'}</span>
            </div>
          </div>

          {/* Status pill */}
          <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0' }}>
            <span style={{
              fontSize: 10, fontWeight: 900, padding: '4px 10px', borderRadius: 999,
              background: isDelivered ? 'rgba(29,185,84,0.1)' : isCancelled ? 'rgba(255,59,48,0.1)' : 'rgba(255,107,43,0.1)',
              color: isDelivered ? '#0F6B30' : isCancelled ? '#B23A2E' : '#B14D17',
              letterSpacing: '0.12em', textTransform: 'uppercase',
              border: `1px solid ${isDelivered ? 'rgba(29,185,84,0.25)' : isCancelled ? 'rgba(255,59,48,0.25)' : 'rgba(255,107,43,0.25)'}`,
            }}>
              {isCancelled ? 'Cancelled' : isDelivered ? 'Delivered' : order.status.replace(/_/g, ' ')}
            </span>
          </div>

          <div style={{ borderTop: dashed, margin: '8px 0 14px' }} />

          {/* Items */}
          <div style={{ fontFamily: mono, fontSize: 12, color: '#1A1917' }}>
            {order.items?.map((item, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 700, fontSize: 13, flex: 1, marginRight: 8 }}>{item.name}</span>
                  <span style={{ fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap' }}>
                    {'\u20A6'}{(item.price * item.quantity).toLocaleString()}
                  </span>
                </div>
                <p style={{ color: '#8B857B', fontSize: 11, margin: '1px 0 0', fontWeight: 600 }}>
                  {item.quantity} {'\u00D7'} {'\u20A6'}{item.price.toLocaleString()}
                </p>
              </div>
            ))}
          </div>

          <div style={{ borderTop: dashed, margin: '12px 0' }} />

          {/* Totals */}
          <div style={{ fontFamily: mono, fontSize: 12, color: '#3A3530', lineHeight: 1.9 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8B857B' }}>Subtotal</span>
              <span style={{ fontWeight: 700 }}>{'\u20A6'}{(order.food_total ?? 0).toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8B857B' }}>Delivery</span>
              <span style={{ fontWeight: 700 }}>{'\u20A6'}{(order.delivery_fee ?? 0).toLocaleString()}</span>
            </div>
          </div>

          <div style={{ borderTop: '2px dashed #8B857B', margin: '12px 0 10px' }} />

          {/* Grand total */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="font-display" style={{ fontSize: 16, color: '#1A1917', letterSpacing: '0.02em' }}>TOTAL PAID</span>
            <span className="font-display" style={{ fontSize: 26, color: '#FF6B2B', lineHeight: 1 }}>
              {'\u20A6'}{total.toLocaleString()}
            </span>
          </div>

          <div style={{ borderTop: dashed, margin: '14px 0' }} />

          {/* Delivered to */}
          <div>
            <p style={{ fontSize: 10, color: '#8B857B', fontWeight: 800, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Delivered to</p>
            <p style={{ fontSize: 13, color: '#1A1917', fontWeight: 700, margin: 0, lineHeight: 1.4 }}>{order.delivery_address}</p>
          </div>

          {/* Refund banner */}
          {isCancelled && (
            <>
              <div style={{ borderTop: dashed, margin: '14px 0' }} />
              <div style={{
                background: refundStatus === 'processed' ? 'rgba(29,185,84,0.08)' : 'rgba(255,107,43,0.08)',
                borderRadius: 8, padding: '10px 12px',
                border: `1px solid ${refundStatus === 'processed' ? 'rgba(29,185,84,0.25)' : 'rgba(255,107,43,0.25)'}`,
              }}>
                <p style={{ fontWeight: 900, fontSize: 12, color: refundStatus === 'processed' ? '#0F6B30' : '#B14D17', margin: '0 0 2px' }}>
                  {refundStatus === 'processed' ? 'Refund processed' : 'Refund pending'}
                </p>
                <p style={{ fontSize: 11, color: '#6B6660', fontWeight: 600, margin: 0, lineHeight: 1.4 }}>
                  {refundStatus === 'processed'
                    ? 'Your refund has been processed. Contact support if not received.'
                    : 'Usually takes 1–3 business days.'}
                </p>
              </div>
            </>
          )}

          <div style={{ borderTop: dashed, margin: '16px 0 8px' }} />
          <p style={{ textAlign: 'center', fontSize: 10, color: '#8B857B', fontWeight: 700, letterSpacing: '0.08em', margin: 0, lineHeight: 1.6 }}>
            THANK YOU FOR ORDERING<br />
            <span style={{ fontWeight: 600, letterSpacing: 0 }}>Built for students, by students.</span>
          </p>

          {/* Torn paper bottom edge */}
          <div style={{
            position: 'absolute', bottom: -6, left: 0, right: 0, height: 12,
            background: 'radial-gradient(circle at 6px 0, transparent 6px, #FAF5E8 6px)',
            backgroundSize: '12px 12px', backgroundRepeat: 'repeat-x',
          }} />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 24 }}>
          <button onClick={() => router.push(order.restaurant_id ? `/restaurant/${order.restaurant_id}` : '/home')} className="press"
            style={{ width: '100%', background: 'var(--accent, #FF6B2B)', color: 'white', fontWeight: 900, fontSize: 15, padding: 14, borderRadius: 14, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            Order again
          </button>
          <button onClick={() => router.push('/orders')}
            style={{ width: '100%', background: 'transparent', color: 'var(--ink-3, #6B6660)', fontWeight: 700, fontSize: 13, padding: '10px', borderRadius: 12, border: '1px solid var(--line, #2A2825)', cursor: 'pointer', fontFamily: 'inherit' }}>
            View all orders
          </button>
        </div>
      </div>
    </div>
  )
}
