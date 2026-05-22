'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { OrderItemList } from '@/components/ui/OrderItemList'
import { createClient } from '@/lib/supabase/client'
import { initPush } from '@/lib/push'
import type { Order } from '@/types'

const N = '\u20A6'   // Naira sign

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending:          { bg: 'rgba(183,134,13,0.15)',  color: '#FFB800' },
  confirmed:        { bg: 'rgba(0,122,255,0.15)',    color: '#4DA3FF' },
  awaiting_runner:  { bg: 'rgba(255,107,43,0.15)',   color: '#FF6B2B' },
  runner_assigned:  { bg: 'rgba(255,107,43,0.15)',   color: '#FF6B2B' },
  preparing:        { bg: 'rgba(255,107,43,0.15)',   color: '#FF6B2B' },
  picked_up:        { bg: 'rgba(29,185,84,0.15)',    color: '#1DB954' },
  delivered:        { bg: 'rgba(29,185,84,0.15)',    color: '#1DB954' },
  cancelled:        { bg: 'rgba(255,255,255,0.06)',  color: '#555'    },
  needs_attention:  { bg: 'rgba(255,59,48,0.15)',    color: '#FF3B30' },
}

interface RunnerOption { id: string; name: string }

interface Analytics {
  repurchaseRate:       number
  repurchaseTotal:      number
  repurchaseRepeaters:  number
  paymentHealth:        number
  unpaidDelivered:      number
  clusterRate:          number
  clusteredOrders:      number
  totalRecentDelivered: number
}

export default function AdminDashboard() {
  const router   = useRouter()
  const supabase = createClient()
  const [orders,           setOrders]           = useState<Order[]>([])
  const [todayRevenue,     setTodayRevenue]     = useState(0)
  const [onlineRunners,    setOnlineRunners]    = useState(0)
  const [pendingApps,      setPendingApps]      = useState(0)
  const [pendingRefunds,   setPendingRefunds]   = useState(0)
  const [analytics,        setAnalytics]        = useState<Analytics | null>(null)
  const [loading,          setLoading]          = useState(true)
  const [dailyCap,         setDailyCap]         = useState(0)
  const [todayCount,       setTodayCount]       = useState(0)
  const [savingCap,        setSavingCap]        = useState(false)
  const [tab,              setTab]              = useState<'active' | 'all'>('active')
  const [markingRefund,    setMarkingRefund]    = useState<string | null>(null)
  const [assigningOrder,   setAssigningOrder]   = useState<Order | null>(null)
  const [availableRunners, setAvailableRunners] = useState<RunnerOption[]>([])
  const [selectedRunner,   setSelectedRunner]   = useState('')
  const [assigning,        setAssigning]        = useState(false)

  const load = useCallback(async () => {
    const today         = new Date().toISOString().split('T')[0]
    const sevenDaysAgo  = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000).toISOString()
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const [
      { data: allOrders },
      { data: todayDelivered },
      { count: runnerCount },
      { count: appsCount },
      { count: refundCount },
      { data: allDeliveredOrders },
      { data: recentOrders7d },
      { data: recentOrders30d },
    ] = await Promise.all([
      supabase.from('orders').select('*, is_pre_order, pre_order_pool_id, scheduled_for, restaurant:restaurants(name), customer:users!customer_id(full_name, phone), runner:users!runner_id(full_name)').order('created_at', { ascending: false }).limit(50),
      supabase.from('orders').select('platform_cut').eq('status', 'delivered').gte('created_at', today),
      supabase.from('runner_profiles').select('*', { count: 'exact', head: true }).eq('is_available', true),
      supabase.from('runner_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'cancelled').eq('refund_status', 'pending'),
      supabase.from('orders').select('customer_id, created_at').eq('status', 'delivered').order('customer_id').order('created_at'),
      supabase.from('orders').select('status, restaurant_paid').gte('created_at', sevenDaysAgo),
      supabase.from('orders').select('status, delivery_address').gte('created_at', thirtyDaysAgo),
    ])

    setOrders(allOrders ?? [])
    setTodayRevenue(todayDelivered?.reduce((sum, o) => sum + (o.platform_cut ?? 0), 0) ?? 0)
    setOnlineRunners(runnerCount ?? 0)
    setPendingApps(appsCount ?? 0)
    setPendingRefunds(refundCount ?? 0)

    // 1. Repurchase rate
    const customerFirstOrder: Record<string, number>  = {}
    const customerHasRepeat:  Record<string, boolean> = {}
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
    for (const order of allDeliveredOrders ?? []) {
      const cid = order.customer_id
      const ts  = new Date(order.created_at).getTime()
      if (!(cid in customerFirstOrder)) {
        customerFirstOrder[cid] = ts
      } else if (!customerHasRepeat[cid] && ts - customerFirstOrder[cid] <= SEVEN_DAYS_MS) {
        customerHasRepeat[cid] = true
      }
    }
    const repurchaseTotal     = Object.keys(customerFirstOrder).length
    const repurchaseRepeaters = Object.values(customerHasRepeat).filter(Boolean).length
    const repurchaseRate      = repurchaseTotal > 0 ? Math.round(repurchaseRepeaters / repurchaseTotal * 100) : 0

    // 2. Payment health
    const recentDelivered = recentOrders7d?.filter(o => o.status === 'delivered') ?? []
    const unpaidDelivered = recentDelivered.filter(o => !o.restaurant_paid).length
    const paymentHealth   = recentDelivered.length > 0
      ? Math.round((recentDelivered.length - unpaidDelivered) / recentDelivered.length * 100)
      : 100

    // 3. Address clustering
    const delivered30d = recentOrders30d?.filter(o => o.status === 'delivered') ?? []
    const addrCounts: Record<string, number> = {}
    for (const o of delivered30d) {
      if (o.delivery_address) addrCounts[o.delivery_address] = (addrCounts[o.delivery_address] || 0) + 1
    }
    const clusteredOrders      = delivered30d.filter(o => (addrCounts[o.delivery_address] || 0) > 1).length
    const clusterRate          = delivered30d.length > 0 ? Math.round(clusteredOrders / delivered30d.length * 100) : 0
    const totalRecentDelivered = delivered30d.length

    setAnalytics({ repurchaseRate, repurchaseTotal, repurchaseRepeaters, paymentHealth, unpaidDelivered, clusterRate, clusteredOrders, totalRecentDelivered })
    // Daily cap
    try {
      const { data: capRow } = await supabase.from('app_config').select('value').eq('key', 'daily_order_cap').single()
      const cap = parseInt(capRow?.value ?? '0')
      setDailyCap(cap)
      if (cap > 0) {
        const todayStart = new Date(); todayStart.setHours(0,0,0,0)
        const { count } = await supabase.from('orders').select('*', { count: 'exact', head: true }).neq('status', 'cancelled').gte('created_at', todayStart.toISOString())
        setTodayCount(count ?? 0)
      }
    } catch { /* app_config may not exist yet */ }
    setLoading(false)
  }, [supabase]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') { router.push('/home'); return }
      await load()
      initPush().catch(() => {})
    }
    init()
    const channel = supabase.channel('admin-orders-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .subscribe()
    const poll = setInterval(load, 15000)
    return () => { supabase.removeChannel(channel); clearInterval(poll) }
  }, [load]) // eslint-disable-line react-hooks/exhaustive-deps

  // Save daily cap to database
  const saveDailyCap = async (value: number) => {
    setSavingCap(true)
    try {
      const { error } = await supabase
        .from('app_config')
        .upsert({ 
          key: 'daily_order_cap', 
          value: value.toString(),
          updated_at: new Date().toISOString()
        })
      
      if (error) throw error
      
      // Update today's count if cap was set
      if (value > 0) {
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        const { count } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .neq('status', 'cancelled')
          .gte('created_at', todayStart.toISOString())
        setTodayCount(count ?? 0)
      }
    } catch (error) {
      console.error('Failed to save daily cap:', error)
      // Revert to previous value on error
      const { data: capRow } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'daily_order_cap')
        .single()
      setDailyCap(parseInt(capRow?.value ?? '0'))
    } finally {
      setSavingCap(false)
    }
  }

  async function openAssignModal(order: Order) {
    const { data: runners } = await supabase
      .from('runner_profiles').select('user_id, users(full_name)')
      .eq('is_available', true).eq('is_suspended', false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opts: RunnerOption[] = (runners ?? []).map((r: any) => ({
      id:   r.user_id,
      name: Array.isArray(r.users) ? r.users[0]?.full_name : r.users?.full_name ?? 'Unknown',
    }))
    setAvailableRunners(opts)
    setSelectedRunner(opts[0]?.id ?? '')
    setAssigningOrder(order)
  }

  async function confirmAssign() {
    if (!assigningOrder || !selectedRunner) return
    setAssigning(true)
    const res = await fetch('/api/admin/assign-runner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: assigningOrder.id, runnerId: selectedRunner }),
    })
    const { success, error } = await res.json()
    setAssigning(false); setAssigningOrder(null)
    if (!success) alert(error || 'Failed to assign runner')
    await load()
  }

  async function markRefund(orderId: string) {
    setMarkingRefund(orderId)
    await fetch('/api/admin/refunds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    })
    await load()
    setMarkingRefund(null)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0C0B09', fontSize: 40 }}>
      {'\uD83D\uDCCA'}
    </div>
  )

  const activeOrders   = orders.filter(o => !['delivered', 'cancelled'].includes(o.status))
  const needsAttention = orders.filter(o => o.status === 'needs_attention')
  const displayOrders  = tab === 'active' ? activeOrders : orders

  function signal(value: number, lo: number, hi: number) {
    if (value >= hi) return { color: '#1DB954', bg: 'rgba(29,185,84,0.12)',  label: 'GOOD'  }
    if (value >= lo) return { color: '#FFB800', bg: 'rgba(255,184,0,0.12)',  label: 'WATCH' }
    return                  { color: '#FF3B30', bg: 'rgba(255,59,48,0.12)',  label: 'ACT'   }
  }

  const rSig = signal(analytics?.repurchaseRate ?? 0,   40, 60)
  const pSig = signal(analytics?.paymentHealth  ?? 100, 85, 95)
  const cSig = signal(analytics?.clusterRate    ?? 0,   10, 20)

  const NAV = [
    { href: '/admin/applications', icon: '\uD83D\uDEF5', label: 'Runner Applications', sub: pendingApps > 0 ? `${pendingApps} pending review` : 'No pending applications', urgent: pendingApps > 0 },
    { href: '/admin/runners',      icon: '\u2B50',       label: 'Runners & Strikes',   sub: 'Ratings, suspensions, history',    urgent: false },
    { href: '/admin/restaurants',  icon: '\uD83C\uDF7D\uFE0F', label: 'Restaurants & Menu', sub: 'Toggle open/closed, edit items', urgent: false },
    { href: '/admin/pre-orders',   icon: '\u26A1',       label: 'Pre-orders',          sub: 'Bulk pickups by peak window',     urgent: false },
    { href: '/admin/payouts',      icon: '\uD83D\uDCB0', label: 'Runner Payouts',      sub: 'Track and mark earnings as paid',  urgent: false },
    { href: '/admin/payments',     icon: '\uD83C\uDFE6', label: 'Restaurant Pay',      sub: 'Float queue \u2014 pay restaurants', urgent: false },
    { href: '/admin/analytics',    icon: '\uD83D\uDCCA', label: 'Analytics',           sub: 'Revenue, orders, leaderboard',     urgent: false },
  ]

  return (
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: '#0C0B09', fontFamily: "'Nunito', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>

      {/* Assign runner modal */}
      {assigningOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', maxWidth: 430, margin: '0 auto' }}>
          <div style={{ background: '#1A1917', borderRadius: '20px 20px 0 0', padding: '24px 20px 32px', border: '1px solid #2A2825' }}>
            <p style={{ fontWeight: 900, fontSize: 17, color: 'white', margin: '0 0 4px' }}>Assign Runner</p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: 600, margin: '0 0 16px' }}>{assigningOrder.order_ref}</p>
            {availableRunners.length === 0 ? (
              <p style={{ color: '#FF3B30', fontWeight: 700, fontSize: 14, margin: '0 0 16px' }}>No runners available right now.</p>
            ) : (
              <select value={selectedRunner} onChange={e => setSelectedRunner(e.target.value)} style={{ width: '100%', background: '#0C0B09', border: '1px solid #2A2825', borderRadius: 10, padding: '12px', color: 'white', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', marginBottom: 14, outline: 'none' }}>
                {availableRunners.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setAssigningOrder(null)} style={{ flex: 1, background: '#2A2825', color: 'rgba(255,255,255,0.5)', fontWeight: 700, fontSize: 15, padding: '13px', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={confirmAssign} disabled={!selectedRunner || assigning || availableRunners.length === 0} style={{ flex: 2, background: selectedRunner ? '#FF6B2B' : '#2A2825', color: 'white', fontWeight: 900, fontSize: 15, padding: '13px', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: assigning ? 0.7 : 1 }}>
                {assigning ? 'Assigning\u2026' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background: '#0C0B09', padding: '56px 20px 20px', borderBottom: '1px solid #2A2825' }}>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: 600, margin: '0 0 2px' }}>
          {new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <h1 style={{ color: 'white', fontSize: 24, fontWeight: 900, margin: 0, fontFamily: "'Syne', sans-serif" }}>
            Admin <span style={{ color: '#FF6B2B' }}>Dashboard</span>
          </h1>
          <button onClick={async () => { const { createClient } = await import('@/lib/supabase/client'); await createClient().auth.signOut(); router.push('/login') }}
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>
            Sign out
          </button>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '16px 16px 0' }}>
        {[
          { val: `${N}${todayRevenue.toLocaleString()}`, lbl: "TODAY'S REVENUE", color: '#FF6B2B' },
          { val: String(activeOrders.length),            lbl: 'ACTIVE ORDERS',   color: '#4DA3FF' },
          { val: String(onlineRunners),                  lbl: 'RUNNERS ONLINE',  color: '#1DB954' },
          { val: String(needsAttention.length),          lbl: 'NEEDS ATTENTION', color: '#FF3B30', urgent: needsAttention.length > 0 },
        ].map(stat => (
          <div key={stat.lbl} style={{ background: '#1A1917', borderRadius: 14, padding: '14px', border: (stat as { urgent?: boolean }).urgent ? '2px solid #FF3B30' : '1px solid #2A2825' }}>
            <p style={{ fontSize: 22, fontWeight: 900, color: stat.color, margin: 0 }}>{stat.val}</p>
            <p style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.3)', margin: '2px 0 0', letterSpacing: 0.5 }}>{stat.lbl}</p>
          </div>
        ))}
      </div>

      {/* Daily order cap */}
      <div style={{ padding: '10px 16px 0' }}>
        <div style={{ background: '#1A1917', borderRadius: 14, padding: '12px 14px', border: '1px solid #2A2825', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.3)', margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>Daily order cap</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              {dailyCap > 0 ? (
                <p style={{ fontSize: 18, fontWeight: 900, color: todayCount >= dailyCap ? '#FF3B30' : '#1DB954', margin: 0 }}>{todayCount} / {dailyCap}</p>
              ) : (
                <p style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.3)', margin: 0 }}>No cap set</p>
              )}
            </div>
          </div>
          <input type="number" value={dailyCap || ''} placeholder="Set cap"
            onChange={e => setDailyCap(parseInt(e.target.value) || 0)}
            onBlur={e => saveDailyCap(parseInt(e.target.value) || 0)}
            style={{ width: 72, background: '#0C0B09', border: '1px solid #2A2825', borderRadius: 8, padding: '6px 8px', color: 'white', fontSize: 14, fontFamily: 'inherit', outline: 'none', textAlign: 'center' }} />
          <span style={{ fontSize: 11, color: savingCap ? '#FF6B2B' : 'rgba(255,255,255,0.2)', fontWeight: 700 }}>{savingCap ? 'Saving...' : 'orders/day'}</span>
        </div>
      </div>

      {/* Growth signals */}
      {analytics && (
        <div style={{ padding: '16px 16px 0' }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.3)', letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 10px' }}>Growth Signals</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* Repurchase rate */}
            <div style={{ background: '#1A1917', border: `1px solid ${rSig.color}30`, borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>7-Day Repurchase</p>
                    <span style={{ background: rSig.bg, color: rSig.color, fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 100, letterSpacing: 0.5 }}>{rSig.label}</span>
                  </div>
                  <p style={{ fontSize: 28, fontWeight: 900, color: rSig.color, margin: '2px 0 0', fontFamily: "'Syne', sans-serif", lineHeight: 1 }}>{analytics.repurchaseRate}%</p>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 600, margin: '4px 0 0' }}>
                    {analytics.repurchaseRepeaters} of {analytics.repurchaseTotal} customers reordered within 7 days
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                  <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontWeight: 600, margin: 0, lineHeight: 1.6 }}>
                    {rSig.label === 'ACT'   && 'Fix retention first'}
                    {rSig.label === 'WATCH' && 'Getting there'}
                    {rSig.label === 'GOOD'  && '\u2713 Build group orders'}
                  </p>
                </div>
              </div>
              <div style={{ position: 'relative', height: 3, background: '#2A2825', borderRadius: 2, marginTop: 10 }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(analytics.repurchaseRate, 100)}%`, background: rSig.color, borderRadius: 2, transition: 'width 0.4s' }} />
                <div style={{ position: 'absolute', left: '40%', top: -2, width: 1, height: 7, background: '#FFB800', opacity: 0.5 }} />
                <div style={{ position: 'absolute', left: '60%', top: -2, width: 1, height: 7, background: '#1DB954', opacity: 0.5 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: 'rgba(255,255,255,0.2)', fontWeight: 600 }}>
                <span>0%</span>
                <span style={{ color: '#FFB800', opacity: 0.6 }}>40%</span>
                <span style={{ color: '#1DB954', opacity: 0.6 }}>60%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Payment health + clusters */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ background: '#1A1917', border: `1px solid ${pSig.color}30`, borderRadius: 14, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', margin: 0, textTransform: 'uppercase', letterSpacing: 0.8 }}>Payment Health</p>
                  <span style={{ background: pSig.bg, color: pSig.color, fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 100 }}>{pSig.label}</span>
                </div>
                <p style={{ fontSize: 26, fontWeight: 900, color: pSig.color, margin: '0 0 2px', fontFamily: "'Syne', sans-serif", lineHeight: 1 }}>{analytics.paymentHealth}%</p>
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontWeight: 600, margin: 0, lineHeight: 1.4 }}>
                  {analytics.unpaidDelivered > 0
                    ? `${analytics.unpaidDelivered} unpaid transfers · 7d`
                    : `All restaurants paid · 7d`}
                </p>
              </div>

              <div style={{ background: '#1A1917', border: `1px solid ${cSig.color}30`, borderRadius: 14, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', margin: 0, textTransform: 'uppercase', letterSpacing: 0.8 }}>Address Clusters</p>
                  <span style={{ background: cSig.bg, color: cSig.color, fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 100 }}>{cSig.label}</span>
                </div>
                <p style={{ fontSize: 26, fontWeight: 900, color: cSig.color, margin: '0 0 2px', fontFamily: "'Syne', sans-serif", lineHeight: 1 }}>{analytics.clusterRate}%</p>
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontWeight: 600, margin: 0, lineHeight: 1.4 }}>
                  {analytics.clusteredOrders}/{analytics.totalRecentDelivered} share an addr · 30d
                  {cSig.label === 'GOOD' ? ' · Build group orders' : ''}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Nav links */}
      <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {NAV.map(link => (
          <Link
            key={link.href}
            href={link.href}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1A1917', borderRadius: 14, padding: '12px 16px', textDecoration: 'none', border: link.urgent ? '2px solid #FF6B2B' : '1px solid #2A2825' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: link.urgent ? 'rgba(255,107,43,0.15)' : '#2A2825', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                {link.icon}
              </div>
              <div>
                <p style={{ fontWeight: 800, fontSize: 13, color: 'white', margin: 0 }}>{link.label}</p>
                <p style={{ fontSize: 11, color: link.urgent ? '#FF6B2B' : 'rgba(255,255,255,0.3)', fontWeight: 700, margin: '1px 0 0' }}>{link.sub}</p>
              </div>
            </div>
            <span style={{ fontSize: 18, color: '#555' }}>&#8250;</span>
          </Link>
        ))}
      </div>

      {/* Refund alert */}
      {pendingRefunds > 0 && (
        <div style={{ margin: '10px 16px 0', background: 'rgba(255,107,43,0.08)', borderRadius: 12, padding: '10px 14px', border: '1px solid rgba(255,107,43,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ color: '#FF6B2B', fontWeight: 800, fontSize: 13, margin: 0 }}>
            {'\u23F3'} {pendingRefunds} refund{pendingRefunds !== 1 ? 's' : ''} pending
          </p>
          <button onClick={() => setTab('all')} style={{ background: 'none', border: 'none', color: '#FF6B2B', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            View {'\u2192'}
          </button>
        </div>
      )}

      {/* Needs attention alert */}
      {needsAttention.length > 0 && (
        <div style={{ margin: '10px 16px 0', background: 'rgba(255,59,48,0.08)', borderRadius: 12, padding: '10px 14px', border: '1px solid rgba(255,59,48,0.2)' }}>
          <p style={{ fontWeight: 800, fontSize: 13, color: '#FF3B30', margin: '0 0 4px' }}>
            {'\u26A0\uFE0F'} {needsAttention.length} order{needsAttention.length !== 1 ? 's' : ''} need attention
          </p>
          {needsAttention.map(o => (
            <p key={o.id} style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,59,48,0.6)', margin: '2px 0' }}>
              {o.order_ref} {'\u2014'} no runner found
            </p>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', margin: '12px 16px 0', background: '#1A1917', borderRadius: 12, padding: 4, border: '1px solid #2A2825' }}>
        {(['active', 'all'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{ flex: 1, padding: '8px', borderRadius: 9, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13, fontFamily: "'Nunito', system-ui, sans-serif", background: tab === t ? '#FF6B2B' : 'transparent', color: tab === t ? 'white' : 'rgba(255,255,255,0.3)' }}
          >
            {t === 'active' ? `Active (${activeOrders.length})` : `All (${orders.length})`}
          </button>
        ))}
      </div>

      {/* Orders list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {displayOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.2)', fontWeight: 600 }}>No orders yet</div>
        ) : displayOrders.map(order => {
          const sc         = STATUS_COLORS[order.status] ?? { bg: 'rgba(255,255,255,0.06)', color: '#555' }
          const customer   = order.customer   as { full_name: string; phone: string } | null
          const runner     = order.runner     as { full_name: string } | null
          const restaurant = order.restaurant as { name: string } | null
          const isUrgent   = order.status === 'needs_attention'
          const isStuck    = ['needs_attention', 'awaiting_runner'].includes(order.status)
          const isCancelled = order.status === 'cancelled'
          const refundStatus = (order as Order & { refund_status?: string }).refund_status

          return (
            <div key={order.id} style={{ background: '#1A1917', borderRadius: 14, padding: '14px 16px', marginBottom: 10, border: isUrgent ? '2px solid #FF3B30' : '1px solid #2A2825' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 14, color: 'white' }}>{order.order_ref}</span>
                  <Link href={`/receipt/${order.id}`} style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 700, textDecoration: 'none' }}>receipt {'\u203A'}</Link>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {(order as Order & { is_pre_order?: boolean }).is_pre_order && (
                    <span style={{ background: 'rgba(255,107,43,0.15)', color: '#FF6B2B', fontSize: 9, fontWeight: 900, padding: '3px 7px', borderRadius: 5, letterSpacing: '0.06em', border: '1px solid rgba(255,107,43,0.3)' }}>
                      ⚡ PRE-ORDER
                    </span>
                  )}
                  <span style={{ background: sc.bg, color: sc.color, fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6 }}>
                    {order.status.replace(/_/g, ' ').toUpperCase()}
                  </span>
                </div>
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', margin: '0 0 3px' }}>
                {restaurant?.name} {'\u2192'} {order.delivery_address}
              </p>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontWeight: 600, margin: 0 }}>
                {'\uD83D\uDC64'} {customer?.full_name} {'\u00B7'} {'\uD83D\uDEF5'} {runner?.full_name ?? 'Unassigned'}
              </p>
              {Array.isArray(order.items) && order.items.length > 0 && (
                <div style={{ marginTop: 6, padding: '6px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                  <OrderItemList items={order.items} theme="admin" showPrices={false} />
                </div>
              )}
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontWeight: 600, margin: '3px 0 0' }}>
                {N}{((order.food_total ?? 0) + (order.delivery_fee ?? 0)).toLocaleString()} {'\u00B7'} {new Date(order.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
              </p>
              {isUrgent && customer?.phone && (
                <a href={`tel:${customer.phone}`} style={{ display: 'block', marginTop: 10, background: '#FF3B30', color: 'white', fontWeight: 800, fontSize: 13, padding: '10px', borderRadius: 10, textAlign: 'center', textDecoration: 'none' }}>
                  {'\uD83D\uDCDE'} Call Customer
                </a>
              )}
              {isStuck && (
                <button onClick={() => openAssignModal(order)} style={{ width: '100%', marginTop: 10, background: 'rgba(255,107,43,0.1)', border: '1px solid rgba(255,107,43,0.3)', color: '#FF6B2B', fontWeight: 800, fontSize: 13, padding: '10px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {'\uD83D\uDEF5'} Assign Runner
                </button>
              )}
              {isCancelled && refundStatus === 'pending' && (
                <button onClick={() => markRefund(order.id)} disabled={markingRefund === order.id} style={{ width: '100%', marginTop: 10, background: 'rgba(255,107,43,0.1)', border: '1px solid rgba(255,107,43,0.3)', color: '#FF6B2B', fontWeight: 800, fontSize: 13, padding: '10px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', opacity: markingRefund === order.id ? 0.7 : 1 }}>
                  {markingRefund === order.id ? 'Marking...' : `${'\u23F3'} Mark refund as processed`}
                </button>
              )}
              {isCancelled && refundStatus === 'processed' && (
                <p style={{ fontSize: 12, color: '#1DB954', fontWeight: 700, margin: '8px 0 0' }}>{'\u2713'} Refund processed</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}