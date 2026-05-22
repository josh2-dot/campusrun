'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface DailyRevenue { day: string; total_orders: number; delivered_orders: number; revenue: number; gmv: number }
interface RestaurantStat { restaurant_name: string; emoji: string; total_orders: number; delivered: number; food_revenue: number }
interface RunnerStat { full_name: string; total_deliveries: number; total_earnings: number; rating: number }

const RANK_COLORS = [
  { bg: 'rgba(255,184,0,0.12)', color: '#FFB800' },
  { bg: 'rgba(160,160,160,0.12)', color: '#A0A0A0' },
  { bg: 'rgba(180,100,50,0.12)', color: '#B46432' },
]

export default function AdminAnalyticsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [daily, setDaily] = useState<DailyRevenue[]>([])
  const [restaurants, setRestaurants] = useState<RestaurantStat[]>([])
  const [runners, setRunners] = useState<RunnerStat[]>([])
  const [avgDeliveryMins, setAvgDeliveryMins] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') { router.push('/home'); return }

    const [{ data: dailyData }, { data: restData }, { data: runnerData }, { data: deliveryTimes }] = await Promise.all([
      supabase.from('analytics_daily_revenue').select('*').limit(14),
      supabase.from('analytics_by_restaurant').select('*'),
      supabase.from('analytics_runner_leaderboard').select('*').limit(10),
      supabase.from('orders').select('created_at, delivered_at').eq('status', 'delivered').not('delivered_at', 'is', null).limit(50),
    ])

    setDaily(dailyData ?? [])
    setRestaurants(restData ?? [])
    setRunners(runnerData ?? [])

    if (deliveryTimes?.length) {
      const avgMs = deliveryTimes.reduce((sum, o) => {
        return sum + (new Date(o.delivered_at).getTime() - new Date(o.created_at).getTime())
      }, 0) / deliveryTimes.length
      setAvgDeliveryMins(Math.round(avgMs / 60000))
    }

    setLoading(false)
  }, [router, supabase])

  useEffect(() => { load() }, [load])

  const totalRevenue = daily.reduce((sum, d) => sum + (d.revenue ?? 0), 0)
  const totalOrders  = daily.reduce((sum, d) => sum + (d.total_orders ?? 0), 0)
  const maxRevenue   = Math.max(...daily.map(d => d.revenue ?? 0), 1)

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-0, #0C0B09)', fontSize: 40 }}>📊</div>
  )

  return (
    <div className="mobile-container" style={{ fontFamily: "'Nunito', system-ui, sans-serif" }}>

      {/* Header */}
      <div className="dot-texture" style={{ padding: '52px 20px 20px', borderBottom: '1px solid var(--line, #2A2825)' }}>
        <Link href="/admin/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--ink-2, #A09A8E)', textDecoration: 'none', marginBottom: 12 }}>
          ← Dashboard
        </Link>
        <h1 className="font-display" style={{ color: 'white', fontSize: 24, margin: 0 }}>Analytics</h1>
        <p style={{ color: 'var(--ink-3, #6B6660)', fontSize: 12, fontWeight: 600, margin: '4px 0 0' }}>Last 14 days</p>
      </div>

      <div style={{ padding: '14px 14px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { val: `₦${totalRevenue.toLocaleString()}`, lbl: 'Revenue (14d)',     color: 'var(--accent, #FF6B2B)', icon: '💰' },
            { val: String(totalOrders),                 lbl: 'Orders (14d)',      color: 'var(--info, #4A9EFF)',   icon: '📦' },
            { val: avgDeliveryMins != null ? `${avgDeliveryMins}m` : '—', lbl: 'Avg delivery',  color: 'var(--ok, #1DB954)',     icon: '⏱️' },
            { val: String(runners[0]?.total_deliveries ?? 0), lbl: 'Top runner drops', color: 'var(--warn, #FFB800)',   icon: '🏆' },
          ].map(s => (
            <div key={s.lbl} style={{ background: 'var(--bg-1, #1A1917)', borderRadius: 14, padding: '14px 14px 12px', border: '1px solid var(--line, #2A2825)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 20 }}>{s.icon}</span>
              </div>
              <p className="font-display" style={{ fontSize: 22, fontWeight: 900, color: s.color, margin: 0, lineHeight: 1 }}>{s.val}</p>
              <p className="label-cap" style={{ fontSize: 9, color: 'var(--ink-3, #6B6660)', margin: '4px 0 0' }}>{s.lbl.toUpperCase()}</p>
            </div>
          ))}
        </div>

        {/* Revenue bar chart */}
        <div style={{ background: 'var(--bg-1, #1A1917)', borderRadius: 16, padding: 16, border: '1px solid var(--line, #2A2825)' }}>
          <p style={{ fontWeight: 800, fontSize: 14, color: 'white', margin: '0 0 4px' }}>Revenue by day</p>
          <p style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '0 0 16px' }}>Tap bar to see amount</p>
          {daily.length === 0 ? (
            <p style={{ color: 'var(--ink-3, #6B6660)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No data yet</p>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
              {[...daily].reverse().map(d => {
                const height = maxRevenue > 0 ? Math.max(4, ((d.revenue ?? 0) / maxRevenue) * 72) : 4
                return (
                  <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div
                      title={`₦${(d.revenue ?? 0).toLocaleString()}`}
                      style={{ width: '100%', maxWidth: 20, height, background: d.revenue ? 'var(--accent, #FF6B2B)' : 'var(--bg-2, #26241F)', borderRadius: '3px 3px 0 0', cursor: 'default' }}
                    />
                    <p style={{ fontSize: 8, color: 'var(--ink-3, #6B6660)', margin: 0, fontWeight: 700, textAlign: 'center' }}>
                      {new Date(d.day).toLocaleDateString('en-NG', { day: 'numeric', month: 'numeric' })}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Orders by restaurant */}
        <div style={{ background: 'var(--bg-1, #1A1917)', borderRadius: 16, padding: 16, border: '1px solid var(--line, #2A2825)' }}>
          <p style={{ fontWeight: 800, fontSize: 14, color: 'white', margin: '0 0 14px' }}>By restaurant</p>
          {restaurants.length === 0 ? (
            <p style={{ color: 'var(--ink-3, #6B6660)', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>No data yet</p>
          ) : restaurants.map((r, i) => {
            const maxDelivered = Math.max(...restaurants.map(x => x.delivered), 1)
            const pct = (r.delivered / maxDelivered) * 100
            return (
              <div key={i} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{r.emoji} {r.restaurant_name}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent, #FF6B2B)' }}>{r.delivered} orders</span>
                </div>
                <div style={{ height: 5, background: 'var(--bg-0, #0C0B09)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent, #FF6B2B)', borderRadius: 999, transition: 'width 0.5s' }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* Runner leaderboard */}
        <div style={{ background: 'var(--bg-1, #1A1917)', borderRadius: 16, padding: 16, border: '1px solid var(--line, #2A2825)' }}>
          <p style={{ fontWeight: 800, fontSize: 14, color: 'white', margin: '0 0 14px' }}>Runner leaderboard 🏆</p>
          {runners.length === 0 ? (
            <p style={{ color: 'var(--ink-3, #6B6660)', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>No runners yet</p>
          ) : runners.map((r, i) => {
            const rank = RANK_COLORS[i] ?? { bg: 'var(--bg-0, #0C0B09)', color: 'var(--ink-3, #6B6660)' }
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < runners.length - 1 ? '1px solid var(--line-2, #1F1D1B)' : 'none' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: rank.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: rank.color, flexShrink: 0 }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 800, fontSize: 13, color: 'white', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.full_name}</p>
                  <p style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '2px 0 0' }}>
                    ⭐{(r.rating ?? 5).toFixed(1)} · ₦{(r.total_earnings ?? 0).toLocaleString()} earned
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p className="font-display" style={{ fontSize: 16, color: 'var(--accent, #FF6B2B)', margin: 0 }}>{r.total_deliveries}</p>
                  <p className="label-cap" style={{ fontSize: 9, color: 'var(--ink-3, #6B6660)', margin: 0 }}>drops</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
