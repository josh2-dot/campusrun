'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Order } from '@/types'
import { Home, Package, Truck, User } from 'lucide-react'

const STATUS_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  pending:          { color: '#FFB800', bg: '#1A1600', label: 'Pending' },
  confirmed:        { color: '#4A9EFF', bg: '#001A2A', label: 'Confirmed' },
  awaiting_runner:  { color: '#FF6B2B', bg: '#1A0D00', label: 'Finding runner...' },
  runner_assigned:  { color: '#FF6B2B', bg: '#1A0D00', label: 'Runner assigned' },
  preparing:        { color: '#FF6B2B', bg: '#1A0D00', label: 'Preparing' },
  picked_up:        { color: '#1DB954', bg: '#001A0D', label: 'On the way' },
  delivered:        { color: '#1DB954', bg: '#001A0D', label: 'Delivered' },
  cancelled:        { color: '#555', bg: '#1A1917', label: 'Cancelled' },
  needs_attention:  { color: '#FF3B30', bg: '#2A0A0A', label: 'Issue' },
}

export default function OrdersPage() {
  const router = useRouter()
  const supabase = createClient()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'active' | 'past'>('active')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase
        .from('orders')
        .select('*, restaurant:restaurants(name, emoji)')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false })
      setOrders(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0C0B09', fontSize: 40 }}><Package size={40} color="#FF6B2B" /></div>
  )

  const activeOrders = orders.filter(o => !['delivered', 'cancelled'].includes(o.status))
  const pastOrders = orders.filter(o => ['delivered', 'cancelled'].includes(o.status))
  const displayOrders = tab === 'active' ? activeOrders : pastOrders

  return (
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: '#0C0B09', fontFamily: "'Nunito', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>
      <div className="dot-texture" style={{ padding: '56px 20px 20px', borderBottom: '1px solid #1A1917' }}>
        <h1 className="font-brand fade-up-1" style={{ color: 'white', fontSize: 28, fontWeight: 900, margin: '0 0 4px' }}>Orders</h1>
        <p className="fade-up-2" style={{ color: '#444', fontSize: 13, fontWeight: 600, margin: 0 }}>Your order history</p>
      </div>

      <div className="fade-up-3" style={{ display: 'flex', gap: 0, margin: '16px 16px 0', background: '#1A1917', borderRadius: 12, padding: 4, border: '1px solid #2A2825' }}>
        {(['active', 'past'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '8px', borderRadius: 9, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13, fontFamily: 'inherit', background: tab === t ? '#FF6B2B' : 'transparent', color: tab === t ? 'white' : '#444' }}>
            {t === 'active' ? `Active (${activeOrders.length})` : `Past (${pastOrders.length})`}
          </button>
        ))}
      </div>

      <div className="scroll-hide" style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {displayOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 56, marginBottom: 16, display:"flex",justifyContent:"center" }}><Package size={56} color="#444" /></div>
            <p style={{ color: '#444', fontWeight: 700, fontSize: 16 }}>
              {tab === 'active' ? 'No active orders' : 'No past orders yet'}
            </p>
            {tab === 'active' && (
              <Link href="/home" className="jitter-btn" style={{ display: 'inline-block', marginTop: 16, background: '#FF6B2B', color: 'white', fontWeight: 800, fontSize: 14, padding: '12px 24px', borderRadius: 12, textDecoration: 'none' }}>
                Order now
              </Link>
            )}
          </div>
        ) : displayOrders.map((order, i) => {
          const sc = STATUS_COLORS[order.status] ?? { color: '#555', bg: '#1A1917', label: order.status }
          const restaurant = order.restaurant as { name: string; emoji: string } | null
          const isActive = !['delivered', 'cancelled'].includes(order.status)
          return (
            <div key={order.id} className={`jitter-btn fade-up-${Math.min(i + 1, 5)}`}
              onClick={() => isActive && router.push(`/track/${order.id}`)}
              style={{ background: '#1A1917', border: '1px solid #2A2825', borderRadius: 16, padding: '14px 16px', marginBottom: 10, cursor: isActive ? 'pointer' : 'default' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 40, height: 40, background: '#222', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                    {restaurant?.emoji || '🍽️'}
                  </div>
                  <div>
                    <p style={{ fontWeight: 800, fontSize: 14, color: 'white', margin: 0 }}>{restaurant?.name}</p>
                    <p style={{ fontSize: 11, color: '#444', fontWeight: 600, margin: '2px 0 0' }}>{order.order_ref}</p>
                  </div>
                </div>
                <span style={{ background: sc.bg, color: sc.color, fontSize: 10, fontWeight: 800, padding: '4px 8px', borderRadius: 8, border: `1px solid ${sc.color}30` }}>
                  {sc.label}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: 12, color: '#444', fontWeight: 600, margin: 0 }}>
                  {Array.isArray(order.items) ? order.items.length : 0} items · ₦{((order.food_total || 0) + (order.delivery_fee || 0)).toLocaleString()}
                </p>
                <p style={{ fontSize: 11, color: '#333', fontWeight: 600, margin: 0 }}>
                  {new Date(order.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              {isActive && (
                <div style={{ marginTop: 10, background: '#0C0B09', borderRadius: 8, padding: '8px 12px' }}>
                  <span style={{ fontSize: 12, color: sc.color, fontWeight: 700 }}>Track order →</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <nav style={{ display: 'flex', borderTop: '1px solid #1A1917', background: '#0C0B09' }}>
        { ([
          { Icon: Home, label: 'Home', href: '/home', active: false },
          { Icon: Package, label: 'Orders', href: '/orders', active: true },
          { Icon: User, label: 'Profile', href: '/profile', active: false },
        ] as const).map(({ Icon, label, href, active }) => (
          <Link key={label} href={href} className="jitter-btn" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '10px 0', textDecoration: 'none' }}>
            <Icon size={22} color={active ? '#FF6B2B' : '#333'} />
            <span style={{ fontSize: 10, fontWeight: 800, color: active ? '#FF6B2B' : '#333' }}>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
