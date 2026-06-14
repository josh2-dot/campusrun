// components/ui/AdminDeliveriesWidget.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bike, Package, CheckCircle2, Clock } from 'lucide-react'

type DeliveryOrder = {
  id:                string
  order_ref:         string
  status:            string
  total:             number
  delivery_fee:      number
  delivery_address:  string
  delivery_code?:    string | null
  admin_delivered:   boolean
  runner_id:         string | null
  customer:          { full_name: string; phone: string | null } | null
  restaurant:        { name: string; emoji: string | null } | null
}

export function AdminDeliveriesWidget({ adminId }: { adminId: string }) {
  const supabase = createClient()
  const [available, setAvailable] = useState<DeliveryOrder[]>([])
  const [active,    setActive]    = useState<DeliveryOrder[]>([])
  const [loading,   setLoading]   = useState(true)
  const [actionId,  setActionId]  = useState<string | null>(null)
  const [feedback,  setFeedback]  = useState('')

  const load = useCallback(async () => {
    // Available: status awaiting_runner OR confirmed, no runner assigned
    const { data: avail } = await supabase
      .from('orders')
      .select('id, order_ref, status, total, delivery_fee, delivery_address, delivery_code, admin_delivered, runner_id, customer:users!customer_id(full_name, phone), restaurant:restaurants(name, emoji)')
      .in('status', ['awaiting_runner', 'confirmed'])
      .is('runner_id', null)
      .order('created_at', { ascending: true })
      .limit(8)

    // Active for this admin
    const { data: mine } = await supabase
      .from('orders')
      .select('id, order_ref, status, total, delivery_fee, delivery_address, delivery_code, admin_delivered, runner_id, customer:users!customer_id(full_name, phone), restaurant:restaurants(name, emoji)')
      .eq('runner_id', adminId)
      .in('status', ['runner_assigned', 'picked_up'])
      .order('runner_assigned_at', { ascending: false })

    setAvailable((avail ?? []) as unknown as DeliveryOrder[])
    setActive((mine ?? []) as unknown as DeliveryOrder[])
    setLoading(false)
  }, [supabase, adminId])

  useEffect(() => {
    load()
    const channel = supabase.channel('admin-deliveries-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .subscribe()
    const poll = setInterval(load, 30000)
    return () => { supabase.removeChannel(channel); clearInterval(poll) }
  }, [supabase, load])

  async function accept(orderId: string) {
    setActionId(orderId); setFeedback('')
    try {
      const res = await fetch('/api/runner/accept', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ orderId }),
      })
      const data = await res.json()
      if (!res.ok) { setFeedback(data.error || 'Could not accept'); return }
      setFeedback('Accepted — you are the runner now')
      await load()
    } catch {
      setFeedback('Network error')
    } finally {
      setActionId(null)
      setTimeout(() => setFeedback(''), 4000)
    }
  }

  async function markPickedUp(orderId: string) {
    setActionId(orderId); setFeedback('')
    try {
      const res = await fetch('/api/runner/update-status', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ orderId, status: 'picked_up' }),
      })
      const data = await res.json()
      if (!res.ok) { setFeedback(data.error || 'Could not mark picked up'); return }
      await load()
    } catch {
      setFeedback('Network error')
    } finally {
      setActionId(null)
    }
  }

  async function markDelivered(orderId: string, deliveryCode: string | null | undefined) {
    if (!deliveryCode) {
      // Ask admin for the customer's code
      const code = window.prompt('Enter the delivery code from the customer:')
      if (!code) return
      deliveryCode = code
    } else if (!window.confirm(`Confirm delivery with code ${deliveryCode}?`)) {
      return
    }

    setActionId(orderId); setFeedback('')
    try {
      const res = await fetch('/api/runner/confirm-delivery', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ orderId, code: deliveryCode }),
      })
      const data = await res.json()
      if (!res.ok) { setFeedback(data.error || 'Could not confirm'); return }
      setFeedback('✓ Delivered — ₦500 platform earnings')
      await load()
    } catch {
      setFeedback('Network error')
    } finally {
      setActionId(null)
      setTimeout(() => setFeedback(''), 4000)
    }
  }

  if (loading) return null

  return (
    <div style={{ padding: '16px 16px 0', fontFamily: "'Nunito', system-ui, sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <p style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.3)', letterSpacing: 2, textTransform: 'uppercase', margin: 0 }}>
          Your Deliveries
        </p>
        {feedback && (
          <span style={{ fontSize: 11, fontWeight: 700, color: feedback.startsWith('✓') ? '#1DB954' : '#FF6B2B' }}>
            {feedback}
          </span>
        )}
      </div>

      {/* Active deliveries */}
      {active.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#FF6B2B', margin: '0 0 6px' }}>
            Active ({active.length})
          </p>
          {active.map(o => (
            <div key={o.id} style={{ background: 'rgba(255,107,43,0.08)', border: '1px solid rgba(255,107,43,0.3)', borderRadius: 12, padding: 12, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ color: 'white', fontWeight: 800, fontSize: 13, margin: 0 }}>
                    {o.order_ref} · {o.restaurant?.emoji} {o.restaurant?.name}
                  </p>
                  <p style={{ color: '#A09A8E', fontSize: 11, fontWeight: 600, margin: '2px 0 0' }}>
                    {o.customer?.full_name} · {o.delivery_address}
                  </p>
                </div>
                <span style={{ color: '#FF6B2B', fontWeight: 900, fontSize: 14, flexShrink: 0, marginLeft: 8 }}>
                  ₦{o.total.toLocaleString()}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                {o.status === 'runner_assigned' && (
                  <button
                    onClick={() => markPickedUp(o.id)}
                    disabled={actionId === o.id}
                    style={{ flex: 1, background: '#FF6B2B', color: 'white', border: 'none', borderRadius: 10, padding: '10px', fontWeight: 800, fontSize: 12, cursor: actionId === o.id ? 'wait' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Package size={13} /> {actionId === o.id ? '…' : 'Picked up'}
                  </button>
                )}
                {o.status === 'picked_up' && (
                  <button
                    onClick={() => markDelivered(o.id, o.delivery_code)}
                    disabled={actionId === o.id}
                    style={{ flex: 1, background: '#1DB954', color: 'white', border: 'none', borderRadius: 10, padding: '10px', fontWeight: 800, fontSize: 12, cursor: actionId === o.id ? 'wait' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <CheckCircle2 size={13} /> {actionId === o.id ? '…' : 'Delivered'}
                  </button>
                )}
                {o.customer?.phone && (
                  <a href={`https://wa.me/${o.customer.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer"
                    style={{ background: '#25D366', color: 'white', textDecoration: 'none', borderRadius: 10, padding: '10px 12px', fontWeight: 800, fontSize: 12, fontFamily: 'inherit' }}>
                    WA
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Available orders */}
      {available.length > 0 ? (
        <div>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#4A9EFF', margin: '0 0 6px' }}>
            Available — tap to take ({available.length})
          </p>
          {available.map(o => (
            <div key={o.id} style={{ background: '#1A1917', border: '1px solid #2A2825', borderRadius: 12, padding: 12, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ color: 'white', fontWeight: 800, fontSize: 13, margin: 0 }}>
                    {o.order_ref} · {o.restaurant?.emoji} {o.restaurant?.name}
                  </p>
                  <p style={{ color: '#A09A8E', fontSize: 11, fontWeight: 600, margin: '2px 0 0' }}>
                    {o.customer?.full_name} · {o.delivery_address}
                  </p>
                </div>
                <span style={{ color: '#FF6B2B', fontWeight: 900, fontSize: 14, flexShrink: 0, marginLeft: 8 }}>
                  ₦{o.total.toLocaleString()}
                </span>
              </div>
              <button
                onClick={() => accept(o.id)}
                disabled={actionId === o.id}
                style={{ width: '100%', background: '#4A9EFF', color: 'white', border: 'none', borderRadius: 10, padding: '10px', fontWeight: 800, fontSize: 12, cursor: actionId === o.id ? 'wait' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Bike size={13} /> {actionId === o.id ? '…' : "I'll take this — ₦500 platform"}
              </button>
            </div>
          ))}
        </div>
      ) : active.length === 0 && (
        <div style={{ background: '#1A1917', border: '1px solid #2A2825', borderRadius: 12, padding: 16, textAlign: 'center' }}>
          <Clock size={20} color="#6B6660" style={{ margin: '0 auto 6px', display: 'block' }} />
          <p style={{ color: '#6B6660', fontSize: 12, fontWeight: 700, margin: 0 }}>
            No orders waiting. Check back when one comes in.
          </p>
        </div>
      )}
    </div>
  )
}
