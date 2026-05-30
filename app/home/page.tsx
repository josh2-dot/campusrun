'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { initPush } from '@/lib/push'
import { monogram } from '@/lib/utils'
import { BottomNav } from '@/components/ui/BottomNav'
import { InstallPrompt } from '@/components/ui/InstallPrompt'
import { AppTutorial } from '@/components/ui/AppTutorial'
import type { Restaurant, MenuItem, Order } from '@/types'
import { Search, ShoppingBag, X } from 'lucide-react'
import { useCartStore, getFavorites, toggleFavorite } from '@/store/cart'

type Filter = 'all' | 'fast' | 'favorites'

interface SearchResult {
  item: MenuItem
  restaurant: Restaurant
}

export default function HomePage() {
  const router = useRouter()

  // First-time customers: auto-show the tutorial after onboarding
  useEffect(() => {
    try {
      if (localStorage.getItem('campusrun_show_tutorial') === '1') {
        localStorage.removeItem('campusrun_show_tutorial')
        // Slight delay so the home page renders first
        setTimeout(() => setShowTutorial(true), 400)
      }
    } catch {}
  }, [])
  const supabase = createClient()
  const [firstName, setFirstName] = useState('there')
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [allItems, setAllItems] = useState<SearchResult[]>([])
  const [lastOrder, setLastOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [favIds, setFavIds] = useState<string[]>([])
  const [fullyBooked,  setFullyBooked]  = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  const [featuredItems, setFeaturedItems] = useState<(ReturnType<typeof Object.values>[0] & { restaurant_name?: string })[]>([])
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const initial = firstName?.[0]?.toUpperCase() ?? 'U'

  // Cart — subscribe to items array directly for reactivity
  const { items: cartItems, restaurantName: cartRestaurantName, addItem, clearCart } = useCartStore()
  const cartCount  = cartItems.reduce((s, i) => s + i.quantity, 0)
  const cartAmount = cartItems.reduce((s, i) => s + i.price * i.quantity, 0)
  const [reordering, setReordering] = useState(false)

  async function handleReorder(order: Order) {
    const restaurant = order.restaurant as { id: string; name: string } | null
    if (!restaurant?.id || !order.items?.length || reordering) return
    setReordering(true)
    const itemIds = order.items.map((i: { menu_item_id: string }) => i.menu_item_id)
    const { data: mItems } = await supabase.from('menu_items').select('id, name, price, is_available').in('id', itemIds)
    const available = (mItems ?? []).filter(m => m.is_available)
    if (!available.length) { alert('None of these items are available anymore.'); setReordering(false); return }
    clearCart()
    for (const prev of order.items) {
      const cur = available.find(m => m.id === prev.menu_item_id)
      if (!cur) continue
      for (let i = 0; i < prev.quantity; i++) {
        addItem({ id: cur.id, name: cur.name, price: cur.price, is_available: true,
          restaurant_id: restaurant.id, category: '', description: '' },
          restaurant.id, restaurant.name)
      }
    }
    setReordering(false)
    router.push('/checkout')
  }

  function handleToggleFav(e: React.MouseEvent, id: string) {
    e.preventDefault(); e.stopPropagation()
    const next = toggleFavorite(id)
    setFavIds(prev => next ? [...prev, id] : prev.filter(x => x !== id))
  }

  useEffect(() => { setFavIds(getFavorites()) }, [])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [{ data: profile }, { data: rests }, { data: orders }, { data: items }] = await Promise.all([
        supabase.from('users').select('full_name, onboarding_done').eq('id', user.id).single(),
        supabase.from('restaurants').select('*').order('is_open', { ascending: false }).order('name'),
        supabase.from('orders')
          .select('*, restaurant:restaurants(name, emoji, id)')
          .eq('customer_id', user.id)
          .eq('status', 'delivered')
          .order('delivered_at', { ascending: false })
          .limit(1),
        supabase.from('menu_items').select('*').eq('is_available', true),
      ])

      if (profile && !profile.onboarding_done) {
        router.replace('/onboarding')
        return
      }

      setFirstName(profile?.full_name?.split(' ')[0] ?? 'there')
      setRestaurants(rests ?? [])
      setLastOrder(orders?.[0] ?? null)

      const restMap = Object.fromEntries((rests ?? []).map(r => [r.id, r]))
      setAllItems(
        (items ?? [])
          .map(item => ({ item, restaurant: restMap[item.restaurant_id] }))
          .filter(r => r.restaurant)
      )

      // Featured dishes — filter is_featured, reuse restMap
      setFeaturedItems(
        (items ?? [])
          .filter((i: { is_featured?: boolean; is_available: boolean }) => i.is_featured && i.is_available)
          .slice(0, 6)
          .map((i: { restaurant_id: string; [key: string]: unknown }) => ({
            ...i,
            restaurant_name: (restMap[i.restaurant_id] as { name?: string } | undefined)?.name,
          }))
      )

      setLoading(false)
      // Defer push prompt — only ask after they've placed at least one order
      if ((orders ?? []).length > 0) initPush().catch(() => {})
      try {
        const { data: capRow } = await supabase.from('app_config').select('value').eq('key', 'daily_order_cap').single()
        const cap = parseInt(capRow?.value ?? '0')
        if (cap > 0) {
          const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
          const { count } = await supabase.from('orders').select('*', { count: 'exact', head: true })
            .neq('status', 'cancelled').gte('created_at', todayStart.toISOString())
          if ((count ?? 0) >= cap) setFullyBooked(true)
        }
      } catch { /* app_config may not exist yet */ }
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus()
  }, [searchOpen])

  // ── Search results, optionally narrowed by the active filter ──
  const searchResults: SearchResult[] = useMemo(() => {
    if (query.trim().length < 2) return []
    const q = query.toLowerCase()
    return allItems
      .filter(r =>
        r.item.name.toLowerCase().includes(q) ||
        r.restaurant?.name.toLowerCase().includes(q) ||
        r.item.category?.toLowerCase().includes(q)
      )
      .filter(r => filter === 'fast' ? (r.restaurant?.avg_prep_time ?? 99) <= 15 : true)
      .slice(0, 20)
  }, [query, allItems, filter])

  // ── Restaurant list, narrowed by filter ──
  const openRestaurants = useMemo(() => restaurants.filter(r => r.is_open), [restaurants])
  const closedRestaurants = useMemo(() => restaurants.filter(r => !r.is_open), [restaurants])
  const visible = useMemo(() => {
    if (filter === 'fast')      return openRestaurants.filter(r => r.avg_prep_time <= 15)
    if (filter === 'favorites') return openRestaurants.filter(r => favIds.includes(r.id))
    return openRestaurants
  }, [openRestaurants, filter, favIds])

  const isSearching = searchOpen || query.length > 0

  if (loading) return <HomeSkeleton />

  return (
    <div
      className="mobile-container"
      style={{ display: 'flex', flexDirection: 'column', fontFamily: "'Nunito', system-ui, sans-serif" }}
    >
      {/* ── HEADER ── */}
      <div
        className="dot-texture"
        style={{ padding: '56px 20px 14px', borderBottom: '1px solid var(--line-soft, #1F1D1B)' }}
      >
        {/* Greeting — hidden while typing */}
        {!isSearching && (
          <div className="fade-up-1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', margin: 0, fontSize: 10 }}>
                {greeting}
              </p>
              <h1 className="font-display" style={{ color: 'white', fontSize: 28, margin: '4px 0 0', lineHeight: 1.05 }}>
                Hey {firstName},<span style={{ color: 'var(--accent, #FF6B2B)' }}> hungry?</span>
              </h1>
            </div>
            <Link
              href="/profile"
              className="press"
              aria-label="Go to profile"
              style={{ width: 40, height: 40, borderRadius: 999, background: 'var(--bg-2, #26241F)', border: '1px solid var(--line, #2A2825)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
            >
              <span className="font-display" style={{ color: 'var(--accent, #FF6B2B)', fontSize: 14 }}>{initial}</span>
            </Link>
          </div>
        )}

        {/* Search bar — toggles between visual button and live input */}
        <div className="fade-up-2">
          {isSearching ? (
            <div style={{ background: 'var(--bg-1, #1A1917)', border: '1px solid var(--accent, #FF6B2B)', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Search size={16} strokeWidth={2.4} color="var(--accent, #FF6B2B)" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onBlur={() => { if (!query) setSearchOpen(false) }}
                placeholder="Search restaurants or food..."
                aria-label="Search restaurants and food"
                style={{ flex: 1, background: 'none', border: 'none', color: 'white', fontSize: 14, fontWeight: 600, outline: 'none', fontFamily: "'Nunito', sans-serif" }}
              />
              <button
                onClick={() => { setQuery(''); setSearchOpen(false) }}
                aria-label="Clear search"
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <button
              className="press"
              aria-label="Search restaurants and food"
              onClick={() => setSearchOpen(true)}
              style={{ width: '100%', textAlign: 'left', background: 'var(--bg-1, #1A1917)', border: '1px solid var(--line, #2A2825)', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink-3, #6B6660)', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}
            >
              <Search size={16} strokeWidth={2.4} />
              <span>Search Buka, jollof, suya...</span>
            </button>
          )}
        </div>

        {/* Filter chips — always visible so they apply to search results too */}
        <div
          className="scroll-hide h-fade-right fade-up-3"
          style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 12 }}
        >
          {([
            { id: 'all'       as const, label: 'All' },
            { id: 'fast'      as const, label: 'Fast (≤15 min)' },
            { id: 'favorites' as const, label: '♥ Saved' },
          ]).map(c => (
            <button
              key={c.id}
              onClick={() => setFilter(c.id)}
              className="press"
              aria-pressed={filter === c.id}
              style={{ padding: '6px 14px', borderRadius: 999, background: filter === c.id ? 'white' : 'var(--bg-1, #1A1917)', color: filter === c.id ? 'var(--bg-0, #0C0B09)' : 'var(--ink-2, #A09A8E)', border: filter === c.id ? 'none' : '1px solid var(--line, #2A2825)', fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap', fontFamily: 'inherit', cursor: 'pointer' }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="scroll-hide" style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 24px' }}>

        {/* ─ Search results ─ */}
        {isSearching && query.trim().length > 1 ? (
          <>
            <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', margin: '0 0 12px', fontSize: 10 }}>
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for &quot;{query}&quot;
              {filter === 'fast' ? ' · Fast only' : ''}
            </p>
            {searchResults.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
                <p className="font-display" style={{ color: 'white', fontSize: 16, margin: 0 }}>No results found</p>
                <p style={{ color: 'var(--ink-3, #6B6660)', fontSize: 13, margin: '4px 0 0' }}>
                  {filter === 'fast' ? 'Try switching to All' : 'Try a different search'}
                </p>
              </div>
            ) : searchResults.map(({ item, restaurant }) => (
              <Link key={item.id} href={`/restaurant/${restaurant.id}`} style={{ textDecoration: 'none' }}>
                <div
                  className="press"
                  style={{ background: 'var(--bg-1, #1A1917)', border: '1px solid var(--line, #2A2825)', borderRadius: 14, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, opacity: restaurant.is_open ? 1 : 0.5 }}
                >
                  <div
                    className="stripe-placeholder-soft"
                    style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  >
                    <span className="font-display" style={{ color: 'var(--accent, #FF6B2B)', fontSize: 13 }}>
                      {monogram(restaurant.name)}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 800, fontSize: 14, color: 'white', margin: 0 }}>{item.name}</p>
                    <p style={{ fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '2px 0 0' }}>
                      {restaurant.name} · {item.category}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontWeight: 900, fontSize: 14, color: 'var(--accent, #FF6B2B)', margin: 0 }}>
                      ₦{item.price.toLocaleString()}
                    </p>
                    {!restaurant.is_open && (
                      <p style={{ fontSize: 10, color: 'var(--danger, #FF3B30)', fontWeight: 700, margin: '2px 0 0' }}>Closed</p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </>
        ) : (
          <>
            {/* ── Featured dishes ── */}
            {featuredItems.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                  <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', fontSize: 10, margin: 0 }}>Popular dishes</p>
                  <span style={{ fontSize: 10, color: 'var(--accent, #FF6B2B)', fontWeight: 800 }}>{featuredItems.length} dish{featuredItems.length !== 1 ? 'es' : ''}</span>
                </div>
                <div className="scroll-hide" style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
                  {featuredItems.map((item: { id: string; name: string; price: number; image_url?: string; restaurant_id: string; restaurant_name?: string }) => (
                    <button
                      key={item.id}
                      onClick={() => router.push(`/restaurant/${item.restaurant_id}`)}
                      className="press"
                      style={{ flexShrink: 0, width: 148, background: 'var(--bg-1, #1A1917)', border: '1px solid var(--line, #2A2825)', borderRadius: 16, overflow: 'hidden', cursor: 'pointer', fontFamily: 'inherit', padding: 0, textAlign: 'left' as const }}
                    >
                      <div style={{ width: '100%', height: 96, background: 'var(--bg-2, #26241F)', position: 'relative', overflow: 'hidden' }}>
                        {item.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 36 }}>&#127869;&#65039;</span>
                          </div>
                        )}
                        <div style={{ position: 'absolute', bottom: 7, left: 7, background: 'rgba(12,11,9,0.85)', borderRadius: 20, padding: '3px 8px', backdropFilter: 'blur(4px)' }}>
                          <span className="font-display" style={{ fontSize: 12, color: 'white' }}>₦{item.price.toLocaleString()}</span>
                        </div>
                      </div>
                      <div style={{ padding: '10px 10px 12px' }}>
                        <p style={{ fontWeight: 800, fontSize: 13, color: 'white', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                        <p style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.restaurant_name ?? ''}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Fully booked banner */}
            {fullyBooked && (
              <div style={{ background: 'rgba(255,107,43,0.08)', border: '1px solid rgba(255,107,43,0.25)', borderRadius: 14, padding: '14px 16px', marginBottom: 14 }}>
                <p style={{ fontWeight: 900, fontSize: 14, color: '#FF6B2B', margin: '0 0 3px' }}>We&apos;re fully booked for today</p>
                <p style={{ fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: 0 }}>We&apos;ve hit our daily limit. Check back tomorrow or follow our WhatsApp for updates.</p>
              </div>
            )}

            {/* Reorder strip */}
            {lastOrder && !isSearching && (
              <ReorderStrip
                order={lastOrder}
                onReorder={() => handleReorder(lastOrder)}
              />
            )}

            {/* Section header */}
            <div className="fade-up-3" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <span className="label-cap" style={{ color: 'var(--ink-2, #A09A8E)', fontSize: 11 }}>
                Open now · {visible.length}
              </span>
              <span className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', fontSize: 10, letterSpacing: '0.12em' }}>
                Sort: Fastest
              </span>
            </div>

            {/* Restaurant cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {visible.map(r => <RestaurantCard key={r.id} r={r} isFav={favIds.includes(r.id)} onToggleFav={e => handleToggleFav(e, r.id)} />)}
              {visible.length === 0 && (
                <p style={{ color: 'var(--ink-3, #6B6660)', fontWeight: 600, fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
                  No restaurants match this filter.
                </p>
              )}
            </div>

            {/* Closed — collapsed */}
            {closedRestaurants.length > 0 && (
              <details className="fade-up-5" style={{ marginTop: 16 }}>
                <summary style={{ listStyle: 'none', cursor: 'pointer', border: '1px dashed var(--line, #2A2825)', borderRadius: 12, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    <span className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', fontSize: 10, display: 'block' }}>Opens later</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2, #A09A8E)' }}>
                      {closedRestaurants.length} {closedRestaurants.length === 1 ? 'place' : 'places'} · {closedRestaurants.slice(0, 2).map(r => r.name).join(', ')}{closedRestaurants.length > 2 ? '…' : ''}
                    </span>
                  </span>
                  <span style={{ color: 'var(--ink-3, #6B6660)', fontSize: 16 }}>▾</span>
                </summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                  {closedRestaurants.map(r => <RestaurantCard key={r.id} r={r} dim isFav={favIds.includes(r.id)} onToggleFav={e => handleToggleFav(e, r.id)} />)}
                </div>
              </details>
            )}
          </>
        )}
      </div>

      {cartItems.length > 0 && (
        <div style={{ padding: '8px 16px', background: 'var(--bg-0, #0C0B09)', borderTop: '1px solid var(--line-soft, #1F1D1B)' }}>
          <button onClick={() => router.push('/checkout')} className="press"
            style={{ width: '100%', background: 'var(--accent, #FF6B2B)', color: 'white', border: 'none', borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, flexShrink: 0 }}>
              <ShoppingBag size={13} color="white" />
              <span style={{ fontSize: 12, fontWeight: 900, color: 'white' }}>{cartCount}</span>
            </div>
            <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
              <p style={{ fontWeight: 800, fontSize: 13, margin: 0, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cartRestaurantName ?? 'Your order'}</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: 600, margin: '1px 0 0' }}>{cartCount} item{cartCount !== 1 ? 's' : ''} · tap to checkout</p>
            </div>
            <span className="font-display" style={{ fontSize: 15, color: 'white', flexShrink: 0 }}>₦{cartAmount.toLocaleString()} &gt;</span>
          </button>
        </div>
      )}
      <InstallPrompt />
      {showTutorial && <AppTutorial onClose={() => setShowTutorial(false)} />}
      <BottomNav active="home" />
    </div>
  )
}

/* ────────────────────────────────────────────────────────── */

function RestaurantCard({ r, dim, isFav, onToggleFav }: {
  r: Restaurant & { pre_order_enabled?: boolean; peak_open_time?: string | null; pre_order_window_minutes?: number; post_peak_delay_minutes?: number }
  dim?: boolean
  isFav?: boolean
  onToggleFav?: (e: React.MouseEvent) => void
}) {
  // Compute pre-order window inline (cheap math, no fetch needed per card)
  let preOrderBadge: 'open' | 'post' | null = null
  if (r.pre_order_enabled && r.peak_open_time) {
    const [hh, mm] = r.peak_open_time.split(':').map(Number)
    const now = new Date()
    const peak = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh - 1, mm))
    const opens = new Date(peak.getTime() - (r.pre_order_window_minutes ?? 120) * 60_000)
    const postEnd = new Date(peak.getTime() + (r.post_peak_delay_minutes ?? 30) * 60_000)
    if (now >= opens && now < peak)      preOrderBadge = 'open'
    else if (now >= peak && now < postEnd) preOrderBadge = 'post'
  }
  return (
    <Link
      href={`/restaurant/${r.id}`}
      className="press"
      style={{ textDecoration: 'none', color: 'inherit', background: 'var(--bg-1, #1A1917)', border: '1px solid var(--line, #2A2825)', borderRadius: 16, overflow: 'hidden', opacity: dim ? 0.55 : 1 }}
    >
      <div className="stripe-placeholder" style={{ height: 88, position: 'relative' }}>
        {r.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        )}
        <div style={{ position: 'absolute', left: 10, bottom: 10, display: 'flex', gap: 6 }}>
          {r.is_open ? (
            <span className="pill pill-ok"><span className="dot" />OPEN</span>
          ) : (
            <span className="pill pill-mute">CLOSED</span>
          )}
          {r.is_open && (
            <span className="pill" style={{ background: 'rgba(12,11,9,0.85)', color: 'white', borderColor: 'rgba(255,255,255,0.08)' }}>
              {r.avg_prep_time}–{r.avg_prep_time + 5} min
            </span>
          )}
          {preOrderBadge === 'open' && (
            <span className="pill" style={{ background: 'var(--accent, #FF6B2B)', color: 'white', border: 'none', fontWeight: 900 }}>
              ⚡ PRE-ORDER
            </span>
          )}
          {preOrderBadge === 'post' && (
            <span className="pill" style={{ background: 'rgba(255,184,0,0.18)', color: 'var(--warn, #FFB800)', border: '1px solid rgba(255,184,0,0.3)', fontWeight: 800 }}>
              ⏳ PEAK
            </span>
          )}
        </div>
        <div style={{ position: 'absolute', right: 10, top: 10, width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-0, #0C0B09)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--line, #2A2825)' }}>
          <span className="font-display" style={{ color: 'var(--accent, #FF6B2B)', fontSize: 13 }}>{monogram(r.name)}</span>
        </div>
        {onToggleFav && (
          <button onClick={onToggleFav} aria-label={isFav ? 'Remove from saved' : 'Save restaurant'}
            style={{ position: 'absolute', left: 10, top: 10, width: 30, height: 30, borderRadius: '50%', background: isFav ? 'rgba(255,59,48,0.85)' : 'rgba(12,11,9,0.65)', border: isFav ? '1px solid rgba(255,59,48,0.4)' : '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 14, color: isFav ? 'white' : 'rgba(255,255,255,0.7)' }}>
            {isFav ? '♥' : '♡'}
          </button>
        )}
      </div>
      <div style={{ padding: '10px 14px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <p style={{ fontWeight: 800, fontSize: 14, margin: 0, color: 'white' }}>{r.name}</p>
          <span style={{ fontSize: 11, color: 'var(--ink-2, #A09A8E)', fontWeight: 700, flexShrink: 0 }}>{r.avg_restaurant_rating && (r as Restaurant & { restaurant_rating_count?: number }).restaurant_rating_count ? `★ ${r.avg_restaurant_rating}` : ''}</span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '2px 0 0' }}>
          {r.location || 'Campus'} · ₦500 delivery
        </p>
      </div>
    </Link>
  )
}

function ReorderStrip({ order, onReorder }: { order: Order; onReorder: () => void }) {
  const rest = order.restaurant as { name: string; emoji?: string } | null
  const total = (order.food_total ?? 0) + (order.delivery_fee ?? 0)
  const first = Array.isArray(order.items) && order.items[0]
  const summary = first
    ? `${first.name}${order.items.length > 1 ? ` +${order.items.length - 1}` : ''}`
    : 'Your last order'

  return (
    <div className="fade-up-2" style={{ background: 'var(--bg-1, #1A1917)', border: '1px solid var(--line, #2A2825)', borderRadius: 16, padding: 12, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <div className="stripe-placeholder-soft" style={{ width: 42, height: 42, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span className="font-display" style={{ color: 'var(--accent, #FF6B2B)', fontSize: 13 }}>
          {monogram(rest?.name ?? '')}
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="label-cap" style={{ color: 'var(--accent, #FF6B2B)', margin: 0, fontSize: 9 }}>Order again</p>
        <p style={{ fontWeight: 800, fontSize: 13, margin: '2px 0 0', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {summary} · {rest?.name}
        </p>
        <p style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '2px 0 0' }}>
          ₦{total.toLocaleString()}
        </p>
      </div>
      <button
        onClick={onReorder}
        className="press"
        style={{ background: 'var(--accent, #FF6B2B)', color: 'white', fontWeight: 800, fontSize: 12, borderRadius: 8, padding: '8px 12px', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
      >
        Reorder
      </button>
    </div>
  )
}

function HomeSkeleton() {
  const Card = () => (
    <div style={{ background: 'var(--bg-1, #1A1917)', border: '1px solid var(--line, #2A2825)', borderRadius: 16, overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ height: 88, background: 'linear-gradient(90deg, #1A1917, #26241F, #1A1917)', backgroundSize: '200% 100%', animation: 'shine 1.6s linear infinite' }} />
      <div style={{ padding: '12px 14px' }}>
        <div style={{ height: 12, width: '60%', background: '#26241F', borderRadius: 6, marginBottom: 6 }} />
        <div style={{ height: 10, width: '40%', background: '#1F1D1B', borderRadius: 5 }} />
      </div>
    </div>
  )
  return (
    <div className="mobile-container" style={{ padding: '56px 16px 16px' }}>
      <style>{`@keyframes shine{0%{background-position:0 0}100%{background-position:-200% 0}}`}</style>
      <div style={{ height: 16, width: 80, background: '#1A1917', borderRadius: 6, marginBottom: 8 }} />
      <div style={{ height: 26, width: 220, background: '#1A1917', borderRadius: 8, marginBottom: 24 }} />
      <Card /><Card /><Card />
    </div>
  )
}
