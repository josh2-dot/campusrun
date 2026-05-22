'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Order, RunnerProfile } from '@/types'
import { Bell, Bike, Check, Home, MapPin, Package, Star, Store, Timer, User, X } from 'lucide-react'

const S = {
  page: { maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: '#0C0B09', fontFamily: "'Nunito', system-ui, sans-serif", display: 'flex', flexDirection: 'column' as const },
  header: { background: '#0C0B09', padding: '56px 20px 20px' },
  greeting: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 600, margin: 0 },
  name: { color: 'white', fontSize: 22, fontWeight: 900, margin: '2px 0 16px', fontFamily: "'Syne', sans-serif" },
  toggleCard: { background: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { color: 'white', fontSize: 14, fontWeight: 800 },
  toggleSub: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 600, marginTop: 2 },
  statsRow: { display: 'flex', gap: 10, padding: '16px 16px 0' },
  statCard: { flex: 1, background: 'white', borderRadius: 14, padding: '12px', textAlign: 'center' as const, border: '1px solid #E8E8E0' },
  statVal: { fontSize: 18, fontWeight: 900, color: '#FF6B2B', margin: 0 },
  statLbl: { fontSize: 10, fontWeight: 800, color: '#555', margin: '2px 0 0', textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  body: { flex: 1, overflowY: 'auto' as const, padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: 800, margin: '0 0 12px' },
  orderCard: { background: 'white', borderRadius: 14, padding: '14px 16px', marginBottom: 10, border: '1px solid #E8E8E0', display: 'flex', alignItems: 'center', gap: 12 },
  dot: (color: string) => ({ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }),
  orderRef: { fontWeight: 800, fontSize: 14, margin: 0 },
  orderSub: { fontSize: 12, color: '#555', fontWeight: 600, margin: '2px 0 0' },
  pill: (bg: string, color: string) => ({ marginLeft: 'auto', background: bg, color, fontSize: 10, fontWeight: 800, padding: '4px 8px', borderRadius: 8, whiteSpace: 'nowrap' as const }),
  empty: { textAlign: 'center' as const, padding: '40px 0', color: '#555', fontWeight: 600 },
  nav: { display: 'flex', borderTop: '1px solid #E8E8E0', background: 'white' },
  navItem: { flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 2, padding: '8px 0', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: "'Nunito', system-ui, sans-serif" },
  // Incoming order overlay
  overlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 50, display: 'flex', flexDirection: 'column' as const, justifyContent: 'flex-end', maxWidth: 430, margin: '0 auto' },
  alertSheet: { background: 'white', borderRadius: '24px 24px 0 0', padding: '24px 20px 36px', border: '2px solid #FF6B2B' },
  alertHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  timer: { background: '#FFF0EA', color: '#FF6B2B', fontWeight: 800, fontSize: 14, padding: '6px 12px', borderRadius: 10 },
  alertCard: { background: '#0C0B09', borderRadius: 14, padding: 14, marginBottom: 16 },
  alertOrderRef: { fontWeight: 800, fontSize: 14, color: '#FF6B2B', margin: '0 0 6px' },
  alertRoute: { fontWeight: 700, fontSize: 14, margin: '0 0 4px' },
  alertMeta: { fontSize: 12, color: '#555', fontWeight: 600, margin: 0 },
  alertActions: { display: 'flex', gap: 10 },
  btnDecline: { flex: 1, background: '#0C0B09', color: '#666', fontWeight: 700, fontSize: 16, padding: '16px', borderRadius: 14, border: 'none', cursor: 'pointer', fontFamily: "'Nunito', system-ui, sans-serif" },
}

function Toggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={on ? 'pulse-orange' : ''}
      style={{ width: 52, height: 28, borderRadius: 14, background: on ? '#1DB954' : 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}
    >
      <div style={{ position: 'absolute', top: 3, width: 22, height: 22, background: 'white', borderRadius: '50%', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 0.2s', left: on ? 27 : 3 }} />
    </button>
  )
}

function IncomingAlert({ order, onAccept, onDecline }: { order: Order; onAccept: () => void; onDecline: () => void }) {
  const [seconds, setSeconds] = useState(30)

  useEffect(() => {
    const t = setInterval(() => {
      setSeconds(s => {
        if (s <= 1) { onDecline(); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [])

  const restaurant = order.restaurant as { name: string } | null

  return (
    <div style={S.overlay}>
      <div style={S.alertSheet}>
        <div style={S.alertHeader}>
          {/* "New order!" heading in font-brand orange */}
          <h3 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>
            <span className="font-brand text-[#FF6B2B]">New Order!</span> <Bell size={18} color="#FF6B2B" style={{verticalAlign:"middle",marginLeft:4}} />
          </h3>
          <span style={S.timer}><Timer size={14} style={{marginRight:4,verticalAlign:'middle'}} />{seconds}s</span>
        </div>
        <div style={S.alertCard}>
          <p style={S.alertOrderRef}>{order.order_ref} · Earn ₦300</p>
          <p style={S.alertRoute}><MapPin size={13} style={{marginRight:4,verticalAlign:'middle'}} /> Drop: {order.delivery_address}</p>
          {restaurant && <p style={{ ...S.alertRoute, color: '#666' }}><Store size={13} style={{marginRight:4,verticalAlign:'middle'}} /> From: {restaurant.name}</p>}
          <p style={S.alertMeta}>{Array.isArray(order.items) ? order.items.length : 0} items</p>
        </div>
        <div style={S.alertActions}>
          <button style={S.btnDecline} onClick={onDecline}><X size={15} style={{marginRight:4,verticalAlign:'middle'}} /> Decline</button>
          {/* Accept button: orange with jitter-on-hover */}
          <button
            className="jitter-on-hover"
            style={{ flex: 1, background: '#FF6B2B', color: 'white', fontWeight: 900, fontSize: 16, padding: '16px', borderRadius: 14, border: '2px solid #FF6B2B', cursor: 'pointer', fontFamily: "'Nunito', system-ui, sans-serif" }}
            onClick={onAccept}
          ><Check size={15} style={{marginRight:4,verticalAlign:'middle'}} /> Accept
          </button>
        </div>
      </div>
    </div>
  )
}

export default function RunnerDashboard() {
  const router = useRouter()
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<RunnerProfile | null>(null)
  const [userName, setUserName] = useState('')
  const [recentOrders, setRecentOrders] = useState<Order[]>([])
  const [incomingOrder, setIncomingOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)

      const [{ data: userData }, { data: runnerData }, { data: orders }] = await Promise.all([
        supabase.from('users').select('full_name').eq('id', user.id).single(),
        supabase.from('runner_profiles').select('*').eq('user_id', user.id).single(),
        supabase.from('orders').select('*, restaurant:restaurants(name)').eq('runner_id', user.id).order('created_at', { ascending: false }).limit(10),
      ])

      setUserName(userData?.full_name?.split(' ')[0] ?? 'Runner')
      setProfile(runnerData)
      setRecentOrders(orders ?? [])
      setLoading(false)

      // Subscribe to new awaiting_runner orders
      if (runnerData?.is_available) {
        const channel = supabase.channel('new-orders')
          .on('postgres_changes', {
            event: 'UPDATE', schema: 'public', table: 'orders',
            filter: `status=eq.awaiting_runner`,
          }, (payload) => {
            if (!payload.new.runner_id) {
              supabase.from('orders').select('*, restaurant:restaurants(name)').eq('id', payload.new.id).single()
                .then(({ data }) => { if (data) setIncomingOrder(data) })
            }
          }).subscribe()
        return () => { supabase.removeChannel(channel) }
      }
    }
    load()
  }, [])

  async function toggleAvailability() {
    if (!profile || !userId) return
    setToggling(true)
    const next = !profile.is_available

    setProfile({ ...profile, is_available: next }) // optimistic

    const { data, error } = await supabase
      .from('runner_profiles')
      .update({ is_available: next })
      .eq('user_id', userId)
      .select()
      .single()

    if (error || !data) {
      setProfile({ ...profile, is_available: !next }) // rollback
      console.error('Toggle failed:', error?.message)
    } else {
      setProfile(data)
    }
    setToggling(false)
  }

  async function acceptOrder(orderId: string) {
    const res = await fetch('/api/runner/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    })
    const { success, error } = await res.json()
    setIncomingOrder(null)
    if (success) router.push(`/order/${orderId}`)
    else alert(error || 'Order already taken')
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontSize: 40 }}><Bike size={40} color="#FF6B2B" /></div>

  return (
    <div style={S.page}>
      {incomingOrder && (
        <IncomingAlert
          order={incomingOrder}
          onAccept={() => acceptOrder(incomingOrder.id)}
          onDecline={() => setIncomingOrder(null)}
        />
      )}

      {/* Header */}
      <div style={S.header}>
        <p style={S.greeting}>Hey {userName}!</p>
        {/* Earnings in font-display orange */}
        <p style={S.name}>
          Total earned:{' '}
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 30, fontWeight: 700, color: '#FF6B2B' }}>
            ₦{(profile?.total_earnings ?? 0).toLocaleString()}
          </span>
        </p>
        <div style={S.toggleCard}>
          <div>
            <p style={S.toggleLabel}>{profile?.is_available ? <><span style={{width:8,height:8,borderRadius:'50%',background:'#1FE87A',display:'inline-block',marginRight:6}} />Available for orders</> : <><span style={{width:8,height:8,borderRadius:'50%',background:'#FF3B30',display:'inline-block',marginRight:6}} />Offline</>}</p>
            <p style={S.toggleSub}>{profile?.is_available ? "You'll receive order alerts" : 'Go online to start earning'}</p>
          </div>
          <Toggle on={!!profile?.is_available} onToggle={toggleAvailability} disabled={toggling} />
        </div>
      </div>

      {/* Stats */}
      <div style={S.statsRow}>
        <div style={S.statCard}>
          <p style={S.statVal}>₦{(profile?.total_earnings ?? 0).toLocaleString()}</p>
          <p style={S.statLbl}>Total Earned</p>
        </div>
        <div style={S.statCard}>
          <p style={S.statVal}>{profile?.total_deliveries ?? 0}</p>
          <p style={S.statLbl}>Deliveries</p>
        </div>
        <div style={S.statCard}>
          <p style={S.statVal}><>{(profile?.rating ?? 5.0).toFixed(1)} <Star size={14} fill="#FFB800" color="#FFB800" style={{verticalAlign:'middle'}} /></></p>
          <p style={S.statLbl}>Rating</p>
        </div>
      </div>

      {/* Recent orders */}
      <div style={S.body}>
        <p style={S.sectionTitle}>Recent deliveries</p>
        {recentOrders.length === 0 ? (
          <div style={S.empty}>
            <div style={{ fontSize: 40, marginBottom: 12, display:"flex",justifyContent:"center" }}><Package size={40} color="#555" /></div>
            No deliveries yet. Go online to start!
          </div>
        ) : recentOrders.map(order => {
          const restaurant = order.restaurant as { name: string } | null
          const isActive = !['delivered', 'cancelled'].includes(order.status)
          return (
            <div key={order.id} style={{ ...S.orderCard, cursor: isActive ? 'pointer' : 'default' }}
              onClick={() => isActive && router.push(`/order/${order.id}`)}>
              <div style={S.dot(order.status === 'delivered' ? '#1DB954' : '#FF6B2B')} />
              <div style={{ flex: 1 }}>
                <p style={S.orderRef}>{order.order_ref}</p>
                <p style={S.orderSub}>{restaurant?.name} · ₦300</p>
              </div>
              <span style={S.pill(order.status === 'delivered' ? '#E8FAF0' : '#FFF0EA', order.status === 'delivered' ? '#1DB954' : '#FF6B2B')}>
                {order.status === 'delivered' ? 'Done' : 'Active'}
              </span>
            </div>
          )
        })}
      </div>

      {/* Bottom nav */}
      <nav style={S.nav}>
        { ([
          { Icon: Home, label: 'Home', href: '/dashboard', active: true },
          { Icon: Package, label: 'Orders', href: '/dashboard', active: false },
          { Icon: User, label: 'Profile', href: '/profile', active: false },
        ] as const).map(({ Icon, label, href, active }) => (
          <button key={label} onClick={() => router.push(href)} style={S.navItem}>
            <Icon size={22} color={active ? '#FF6B2B' : '#999'} />
            <span style={{ fontSize: 10, fontWeight: 800, color: active ? '#FF6B2B' : '#999' }}>{label}</span>
            {active && <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#FF6B2B', display: 'block', marginTop: 1 }} />}
          </button>
        ))}
      </nav>
    </div>
  )
}
