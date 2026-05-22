'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Order } from '@/types'
import { AlertTriangle, Bike, Check, MapPin, Phone, Sparkles, Star, Zap } from 'lucide-react'

const STATUS_STEPS = [
  { key: 'confirmed', label: 'Order Confirmed', icon: <Check size={14} />, sub: 'Payment received' },
  { key: 'runner_assigned', label: 'Runner Assigned', icon: <Bike size={14} />, sub: 'A runner is heading over' },
  { key: 'picked_up', label: 'On the way', icon: <Zap size={14} />, sub: 'Picked up from restaurant' },
  { key: 'delivered', label: 'Delivered!', icon: <Sparkles size={14} />, sub: 'Enjoy your meal' },
]
const STATUS_ORDER = ['pending','confirmed','awaiting_runner','runner_assigned','preparing','picked_up','delivered']

function getStepState(stepKey: string, currentStatus: string): 'done'|'active'|'pending' {
  const curr = STATUS_ORDER.indexOf(currentStatus), step = STATUS_ORDER.indexOf(stepKey)
  return curr > step ? 'done' : curr === step ? 'active' : 'pending'
}

export default function TrackingPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('orders').select('*, restaurant:restaurants(name), runner:users!runner_id(full_name, phone)').eq('id', id).single()
      .then(({ data }) => { setOrder(data); setLoading(false) })
    const channel = supabase.channel('order-' + id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` },
        (payload) => setOrder(prev => prev ? { ...prev, ...payload.new } : null))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontSize: 40, background: '#0C0B09' }}><MapPin size={40} color="#FF6B2B" /></div>
  if (!order) return <div style={{ padding: 40, textAlign: 'center', color: '#666', background: '#0C0B09', minHeight: '100vh' }}>Order not found</div>

  const isDelivered = order.status === 'delivered'
  const isCancelled = order.status === 'cancelled'
  const needsAttention = order.status === 'needs_attention'
  const awaitingRunner = order.status === 'awaiting_runner'
  const runner = order.runner as { full_name: string; phone: string } | null
  const restaurant = order.restaurant as { name: string } | null
  const headerBg = isDelivered ? '#0D2A1A' : needsAttention || isCancelled ? '#2A0A0A' : '#1A1917'
  const accentColor = isDelivered ? '#1DB954' : needsAttention ? '#FF3B30' : '#FF6B2B'

  return (
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: '#0C0B09', fontFamily: "'Nunito', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: headerBg, padding: '56px 20px 20px', borderBottom: '1px solid #2A2825', position: 'relative' }}>
        <button onClick={() => router.push('/orders')} style={{ position: 'absolute', top: 52, left: 20, background: 'rgba(255,255,255,0.08)', border: 'none', color: 'white', fontSize: 14, fontWeight: 700, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>← Orders</button>
        <h2 style={{ color: 'white', fontSize: 22, fontWeight: 900, margin: '0 0 4px' }}>
          {isDelivered ? 'Delivered!' : needsAttention ? 'Issue with order' : isCancelled ? 'Cancelled' : 'Order on the way!'}
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 600, margin: 0 }}>
          {isDelivered ? 'Enjoy your meal!' : 'Live updates below'}
        </p>
        <div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: '3px 10px', color: accentColor, fontSize: 12, fontWeight: 800, marginTop: 8 }}>
          {order.order_ref}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {/* Steps */}
        {!isCancelled && !needsAttention && (
          <div style={{ background: '#1A1917', borderRadius: 16, padding: 16, marginBottom: 12, border: '1px solid #2A2825' }}>
            {STATUS_STEPS.map((step, i) => {
              const state = getStepState(step.key, order.status)
              return (
                <div key={step.key} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, background: state === 'done' ? '#1DB954' : state === 'active' ? '#FF6B2B' : '#2A2825', color: state === 'pending' ? '#444' : 'white' }}>
                      {step.icon}
                    </div>
                    {i < STATUS_STEPS.length - 1 && <div style={{ width: 2, height: 28, margin: '4px 0', background: state === 'done' ? '#1DB954' : '#2A2825' }} />}
                  </div>
                  <div style={{ paddingTop: 6, opacity: state === 'pending' ? 0.3 : 1 }}>
                    <p style={{ fontWeight: 800, fontSize: 14, margin: 0, color: 'white' }}>{step.label}</p>
                    <p style={{ fontSize: 12, color: '#555', fontWeight: 600, margin: '2px 0 0' }}>{step.sub}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {awaitingRunner && (
          <div style={{ background: '#1A1207', borderRadius: 16, padding: 16, marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center', border: '1px solid #2A2010' }}>
            <span style={{ fontSize: 28 }}>⏳</span>
            <div>
              <p style={{ fontWeight: 800, fontSize: 14, color: '#FF6B2B', margin: 0 }}>Finding a runner...</p>
              <p style={{ fontSize: 12, color: '#666', fontWeight: 600, margin: '2px 0 0' }}>Usually takes less than 5 minutes</p>
            </div>
          </div>
        )}

        {runner && ['runner_assigned','preparing','picked_up'].includes(order.status) && (
          <div style={{ background: '#1A1917', borderRadius: 16, padding: 16, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, border: '1px solid #2A2825' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#FF6B2B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>😊</div>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 800, fontSize: 14, margin: 0, color: 'white' }}>{runner.full_name}</p>
              <p style={{ fontSize: 12, color: '#666', fontWeight: 600, margin: '2px 0 0' }}><Star size={12} fill="#FFB800" color="#FFB800" style={{marginRight:3,verticalAlign:'middle'}} /> Your runner</p>
            </div>
            <a href={`tel:${runner.phone}`} style={{ background: '#0D2A1A', color: '#1DB954', width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, textDecoration: 'none' }}>📞</a>
          </div>
        )}

        <div style={{ background: '#1A1917', borderRadius: 16, padding: 16, border: '1px solid #2A2825' }}>
          <p style={{ fontWeight: 800, fontSize: 14, margin: '0 0 10px', color: 'white' }}>From {restaurant?.name}</p>
          {order.items?.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: '#666', padding: '5px 0' }}>
              <span>{item.name} ×{item.quantity}</span>
              <span>₦{(item.price * item.quantity).toLocaleString()}</span>
            </div>
          ))}
          <div style={{ borderTop: '1px solid #2A2825', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 14, color: 'white' }}>
            <span>Total paid</span>
            <span>₦{((order.food_total || 0) + (order.delivery_fee || 0)).toLocaleString()}</span>
          </div>
        </div>

        {isDelivered && (
          <button onClick={() => router.push('/home')} style={{ width: '100%', background: '#1DB954', color: 'white', fontWeight: 900, fontSize: 16, padding: 16, borderRadius: 16, border: 'none', cursor: 'pointer', marginTop: 12, fontFamily: 'inherit' }}>
            Order again 🍽️
          </button>
        )}
      </div>
    </div>
  )
}
