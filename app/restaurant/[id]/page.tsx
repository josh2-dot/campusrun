'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCartStore } from '@/store/cart'
import { monogram } from '@/lib/utils'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import type { Restaurant, MenuItem } from '@/types'
import { ChevronLeft, Heart } from 'lucide-react'

export default function RestaurantPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const { addItem, items, restaurantId: cartRestaurantId, totalItems, foodTotal, updateQuantity } = useCartStore()
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [pantryItems, setPantryItems] = useState<MenuItem[]>([])
  const [pantryRestId, setPantryRestId] = useState<string | null>(null)
  const [pantryRestName, setPantryRestName] = useState<string>('')
  const [showPantry, setShowPantry] = useState(false)
  const [activeCategory, setActiveCategory] = useState('All')
  const [loading, setLoading] = useState(true)
  const [confirmSwitch, setConfirmSwitch] = useState<MenuItem | null>(null)
  const [notifySubscribed, setNotifySubscribed] = useState(false)
  const [notifyLoading,    setNotifyLoading]    = useState(false)

  // Check if user is subscribed to pre-order notifications for this restaurant
  useEffect(() => {
    if (!id) return
    fetch(`/api/preorder-subscribe?restaurantId=${id}`)
      .then(r => r.json())
      .then(d => setNotifySubscribed(!!d.subscribed))
      .catch(() => {})
  }, [id])

  async function toggleNotify() {
    if (notifyLoading) return
    setNotifyLoading(true)
    const res = await fetch('/api/preorder-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantId: id }),
    })
    const d = await res.json()
    setNotifySubscribed(!!d.subscribed)
    setNotifyLoading(false)
  }
  const [swallowPicker, setSwallowPicker] = useState<MenuItem | null>(null)
  const [portionPicker, setPortionPicker] = useState<MenuItem | null>(null)
  const [preOrderPhase, setPreOrderPhase] = useState<{ phase: string; peakAt?: string; postPeakUntil?: string } | null>(null)
  const chipRowRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    async function load() {
      const [{ data: rest }, { data: its }] = await Promise.all([
        supabase.from('restaurants').select('*').eq('id', id).single(),
        supabase.from('menu_items').select('*').eq('restaurant_id', id).eq('is_available', true).order('category'),
      ])
      if (rest?.is_pantry) {
        router.replace('/pantry')
        return
      }
      setRestaurant(rest)
      setMenuItems(its ?? [])
      setLoading(false)

      // Load pantry items for the inline 'Add drinks?' section
      const { data: pantryRest } = await supabase
        .from('restaurants').select('id, name').eq('is_pantry', true).limit(1).maybeSingle()
      if (pantryRest) {
        setPantryRestId(pantryRest.id)
        setPantryRestName(pantryRest.name)
        const { data: pItems } = await supabase
          .from('menu_items').select('*')
          .eq('restaurant_id', pantryRest.id).eq('is_available', true).order('category')
        setPantryItems(pItems ?? [])
      }
      fetch(`/api/restaurants/pre-order-window?restaurant_id=${id}`)
        .then(r => r.json()).then(setPreOrderPhase).catch(() => {})
    }
    load()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(menuItems.map(i => i.category)))],
    [menuItems]
  )

  const grouped = useMemo(() => {
    if (activeCategory !== 'All') {
      return [{ category: activeCategory, items: menuItems.filter(i => i.category === activeCategory) }]
    }
    const map = new Map<string, MenuItem[]>()
    for (const it of menuItems) {
      if (!map.has(it.category)) map.set(it.category, [])
      map.get(it.category)!.push(it)
    }
    return Array.from(map, ([category, items]) => ({ category, items }))
  }, [menuItems, activeCategory])

  function getQty(itemId: string) {
    return items.find(i => i.menu_item_id === itemId)?.quantity ?? 0
  }

function handleAdd(item: MenuItem) {
  console.log('handleAdd called', item.name)
  console.log('cartRestaurantId:', cartRestaurantId, 'current id:', id)
  console.log('has_portions:', item.has_portions, 'portion_min:', item.portion_min_price, 'portion_max:', item.portion_max_price)
  console.log('isSwallow:', isSwallowItem(item))
  
  if (cartRestaurantId && cartRestaurantId !== id) {
    console.log('Different restaurant - showing confirm')
    setConfirmSwitch(item)
    return
  }
  if (isSwallowItem(item) || item.has_portions || item.portion_min_price || item.portion_max_price) {
    setPortionPicker(item)
    return
  }
  console.log('Regular item - adding directly')
  addItem(item, id, restaurant?.name ?? '')
}

  function confirmSwallowChoice(choice: 'garri' | 'fufu') {
    if (!swallowPicker) return
    if (cartRestaurantId && cartRestaurantId !== id) {
      const { clearCart } = useCartStore.getState()
      clearCart()
    }
    addItem(swallowPicker, id, restaurant?.name ?? '', { swallow: choice })
    setSwallowPicker(null)
  }

  function confirmPortionChoice(
    selections: { price: number; quantity: number }[],
    addons: { menu_item_id: string; name: string; price: number; quantity: number; portions?: Array<{ price: number; quantity: number }> }[],
    swallow?: 'garri' | 'fufu'
  ) {
    if (!portionPicker) return
    // If cart has items from a different restaurant, clear it first
    if (cartRestaurantId && cartRestaurantId !== id) {
      const { clearCart } = useCartStore.getState()
      clearCart()
    }
    addItem(portionPicker, id, restaurant?.name ?? '', { portions: selections, addons: addons.filter(a => a.quantity > 0 || (a.portions?.length ?? 0) > 0), swallow })
    setPortionPicker(null)
  }

  function confirmSwitchRestaurant() {
    if (!confirmSwitch) return
    const { clearCart } = useCartStore.getState()
    clearCart()
    const item = confirmSwitch
    setConfirmSwitch(null)
    // After clearing, route through the picker — not directly to addItem
    // so build-your-plate / swallow sheets still show up
    if (isSwallowItem(item) || item.has_portions || item.portion_min_price || item.portion_max_price) {
      setPortionPicker(item)
    } else {
      addItem(item, id, restaurant?.name ?? '')
    }
  }

  function selectCategory(cat: string, el: HTMLButtonElement | null) {
    setActiveCategory(cat)
    if (el && chipRowRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }

  if (loading) return <MenuSkeleton />
  if (!restaurant) return null

  return (
    <div
      className="mobile-container"
      style={{ display: 'flex', flexDirection: 'column', fontFamily: "'Nunito', system-ui, sans-serif" }}
    >
      {/* Hero banner */}
      <div style={{ position: 'relative' }}>
        <div className="stripe-placeholder" style={{ height: 140 }}>
          {restaurant.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={restaurant.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          )}
        </div>
        <button
          onClick={() => router.back()}
          className="press"
          aria-label="Back"
          style={{ position: 'absolute', top: 48, left: 16, width: 36, height: 36, borderRadius: 999, background: 'rgba(12,11,9,0.7)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          <ChevronLeft size={18} />
        </button>
        <button
          className="press"
          aria-label="Save restaurant"
          style={{ position: 'absolute', top: 48, right: 16, width: 36, height: 36, borderRadius: 999, background: 'rgba(12,11,9,0.7)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          <Heart size={16} />
        </button>
      </div>

      {/* Restaurant identity */}
      <div style={{ padding: '0 16px 4px', marginTop: -28, position: 'relative' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--bg-0, #0C0B09)', border: '3px solid var(--bg-0, #0C0B09)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 1px var(--line, #2A2825)' }}>
            <span className="font-display" style={{ color: 'var(--accent, #FF6B2B)', fontSize: 18 }}>
              {monogram(restaurant.name)}
            </span>
          </div>
          <div style={{ flex: 1, paddingBottom: 4 }}>
            <h1 className="font-display" style={{ fontSize: 22, margin: 0, color: 'white', lineHeight: 1.1 }}>
              {restaurant.name}
            </h1>
            <p style={{ fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '2px 0 0' }}>
              {restaurant.location || 'Campus'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: 12, color: 'var(--ink-2, #A09A8E)', fontWeight: 600, flexWrap: 'wrap' }}>
          <span><b style={{ color: 'white', fontWeight: 800 }}>★ 4.8</b> · 220 reviews</span>
          <span>
            <b style={{ color: restaurant.is_open ? 'var(--ok, #1DB954)' : 'var(--danger, #FF3B30)', fontWeight: 800 }}>●</b>{' '}
            {restaurant.is_open ? 'Open' : 'Closed'} · {restaurant.avg_prep_time}–{restaurant.avg_prep_time + 5} min
          </span>
          <span>₦500 fee</span>
        </div>
      </div>


      {/* Pre-order banner */}
      {preOrderPhase?.phase === 'pre_order_open' && preOrderPhase.peakAt && restaurant?.is_open && (
        <div style={{ margin: '12px 16px 0', padding: '12px 14px', background: 'linear-gradient(135deg, rgba(255,107,43,0.14), rgba(255,138,79,0.06))', border: '1px solid rgba(255,107,43,0.35)', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent, #FF6B2B)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 18, color: 'white' }}>{'\u26A1'}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 900, fontSize: 13, color: 'var(--accent, #FF6B2B)', margin: 0 }}>Skip the line {'\u2014'} pre-order open</p>
            <p style={{ fontSize: 11, color: 'var(--ink-2, #A09A8E)', fontWeight: 600, margin: '2px 0 0' }}>
              Order now, food ready at {new Date(preOrderPhase.peakAt).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit', hour12: true })}. No queue.
            </p>
          </div>
        </div>
      )}
      {preOrderPhase?.phase === 'post_peak' && (
        <div style={{ margin: '12px 16px 0', padding: '12px 14px', background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.3)', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,184,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 18 }}>{'\u23F3'}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 900, fontSize: 13, color: 'var(--warn, #FFB800)', margin: 0 }}>Peak hours {'\u2014'} expect longer wait</p>
            <p style={{ fontSize: 11, color: 'var(--ink-2, #A09A8E)', fontWeight: 600, margin: '2px 0 0' }}>
              Lines are long right now. Your order may take 30+ minutes.
            </p>
          </div>
        </div>
      )}
      {preOrderPhase?.phase === 'closed_today' && restaurant?.pre_order_enabled && (
        <div style={{ margin: '12px 16px 0', padding: '12px 14px', background: 'var(--bg-1, #1A1917)', border: '1px solid var(--line, #2A2825)', borderRadius: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 18 }}>{'\u2714'}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 900, fontSize: 13, color: 'var(--ink-2, #A09A8E)', margin: 0 }}>Pre-order window closed</p>
              <p style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '2px 0 0' }}>
                Today{'\u2019'}s pre-orders are done. Come back tomorrow at the same time.
              </p>
            </div>
          </div>
          <button onClick={toggleNotify} disabled={notifyLoading} className="press"
            style={{ width: '100%', marginTop: 10, padding: '10px 12px', background: notifySubscribed ? 'rgba(29,185,84,0.1)' : 'var(--accent, #FF6B2B)', border: notifySubscribed ? '1px solid rgba(29,185,84,0.25)' : 'none', borderRadius: 10, color: notifySubscribed ? 'var(--ok, #1DB954)' : 'white', fontWeight: 800, fontSize: 12, cursor: notifyLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: notifyLoading ? 0.6 : 1 }}>
            {notifySubscribed ? '\u2713 Notifications on \u2014 we\u2019ll remind you' : '\uD83D\uDD14 Notify me when it opens tomorrow'}
          </button>
        </div>
      )}

      {/* Category chip row */}
      <div className="h-fade-right" style={{ marginTop: 14, borderBottom: '1px solid var(--line-soft, #1F1D1B)' }}>
        <div ref={chipRowRef} className="scroll-hide" style={{ display: 'flex', gap: 6, padding: '10px 16px', overflowX: 'auto' }}>
          {categories.map(cat => {
            const on = activeCategory === cat
            return (
              <button
                key={cat}
                onClick={e => selectCategory(cat, e.currentTarget)}
                className="press"
                aria-pressed={on}
                style={{ padding: '6px 14px', borderRadius: 999, border: on ? 'none' : '1px solid var(--line, #2A2825)', cursor: 'pointer', fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap', background: on ? 'white' : 'var(--bg-1, #1A1917)', color: on ? 'var(--bg-0, #0C0B09)' : 'var(--ink-2, #A09A8E)', fontFamily: 'inherit' }}
              >
                {cat}
              </button>
            )
          })}
        </div>
      </div>

      {/* Menu items */}
      <div className="scroll-hide" style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 16px' }}>
        {grouped.map(group => (
          <section key={group.category}>
            <h2 className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', margin: '14px 0 4px', fontSize: 10 }}>
              {group.category}
            </h2>
            {group.items.map(item => (
              <MenuItemRow
                key={item.id}
                item={item}
                qty={getQty(item.id)}
                onAdd={() => handleAdd(item)}
                onDec={() => updateQuantity(item.id, getQty(item.id) - 1)}
              />
            ))}
          </section>
        ))}
        {menuItems.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-3, #6B6660)', fontWeight: 600 }}>
            No items available right now.
          </div>
        )}
      </div>


        {/* "Add drinks?" inline pantry */}
        {pantryRestId && pantryItems.length > 0 && (
          <div style={{ marginTop: 24, marginBottom: 100 }}>
            <button onClick={() => setShowPantry((s: boolean) => !s)}
              style={{ width: '100%', background: 'var(--bg-1, #1A1917)', border: '1px solid var(--line, #2A2825)', borderRadius: 14, padding: '14px 16px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 12, color: 'white' }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,107,43,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}>+</div>
              <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                <p style={{ fontWeight: 800, fontSize: 14, margin: 0 }}>Add drinks or snacks?</p>
                <p style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '2px 0 0' }}>{pantryItems.length} items · runner picks up from a nearby shop</p>
              </div>
              <span style={{ color: 'var(--ink-3, #6B6660)', fontSize: 16, transform: showPantry ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>v</span>
            </button>

            {showPantry && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pantryItems.map(p => {
                  const inCart = items.find(i => i.menu_item_id === p.id)
                  const qty = inCart?.quantity ?? 0
                  return (
                    <div key={p.id}
                      style={{ background: 'var(--bg-1, #1A1917)', border: `1px solid ${qty > 0 ? 'rgba(255,107,43,0.3)' : 'var(--line, #2A2825)'}`, borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 42, height: 42, borderRadius: 8, background: 'var(--bg-2, #26241F)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                        {p.image_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={p.image_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <span style={{ fontSize: 18 }}>{p.category?.toLowerCase().includes('water') ? '~' : p.category?.toLowerCase().includes('drink') ? '*' : '#'}</span>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 800, fontSize: 12, color: 'white', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent, #FF6B2B)', margin: '2px 0 0' }}>₦{p.price.toLocaleString()}</p>
                      </div>
                      {qty === 0 ? (
                        <button onClick={() => addItem(p, pantryRestId, pantryRestName, { is_pantry: true })} className="press"
                          style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent, #FF6B2B)', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16, fontWeight: 900 }}>+</button>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <button onClick={() => updateQuantity(p.id, qty - 1)}
                            style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--bg-2, #26241F)', color: 'white', border: '1px solid var(--line, #2A2825)', cursor: 'pointer', fontSize: 14, fontWeight: 900 }}>-</button>
                          <span style={{ fontSize: 14, color: 'white', minWidth: 14, textAlign: 'center', fontWeight: 800 }}>{qty}</span>
                          <button onClick={() => addItem(p, pantryRestId, pantryRestName, { is_pantry: true })}
                            style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent, #FF6B2B)', color: 'white', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 900 }}>+</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

      {/* Cart bar — fixed floating at bottom */}
      {totalItems() > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, padding: '12px 16px 28px', background: 'linear-gradient(to top, var(--bg-0, #0C0B09) 65%, transparent)', zIndex: 40, pointerEvents: 'none' }}>
          <button
            onClick={() => router.push('/checkout')}
            className="press"
            style={{ width: '100%', background: 'var(--accent, #FF6B2B)', color: 'white', border: 'none', borderRadius: 16, padding: '14px 16px', display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center', cursor: 'pointer', fontFamily: 'inherit', pointerEvents: 'auto', boxShadow: '0 4px 24px rgba(255,107,43,0.35)' }}
          >
            <span style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: '4px 9px', fontSize: 12, fontWeight: 800, color: 'white' }}>
              {totalItems()}
            </span>
            <span style={{ textAlign: 'left', fontWeight: 800, fontSize: 14 }}>Checkout</span>
            <span className="font-display" style={{ fontSize: 15 }}>₦{foodTotal().toLocaleString()}</span>
          </button>
        </div>
      )}
      {/* Bottom padding so last item isn't hidden behind fixed cart bar */}
      {totalItems() > 0 && <div style={{ height: 88 }} />}

      {/* Swallow picker sheet */}
      {swallowPicker && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', maxWidth: 430, margin: '0 auto' }}>
          <div style={{ width: '100%', background: 'var(--bg-1, #1A1917)', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: '20px 20px 36px', border: '1px solid var(--line, #2A2825)', borderBottom: 'none' }}>
            <div style={{ width: 36, height: 4, background: 'var(--line, #2A2825)', borderRadius: 2, margin: '0 auto 18px' }} />
            <p style={{ fontWeight: 900, fontSize: 17, color: 'white', margin: '0 0 4px' }}>{swallowPicker.name}</p>
            <p style={{ fontSize: 13, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '0 0 18px' }}>Choose your swallow</p>
            <div style={{ display: 'flex', gap: 10 }}>
              {([['garri', '🫙', 'Garri (Eba)'], ['fufu', '🥣', 'Fufu']] as const).map(([val, emoji, label]) => (
                <button
                  key={val}
                  onClick={() => confirmSwallowChoice(val)}
                  className="press"
                  style={{ flex: 1, background: 'var(--bg-0, #0C0B09)', border: '2px solid var(--line, #2A2825)', borderRadius: 16, padding: '18px 12px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
                >
                  <span style={{ fontSize: 36 }}>{emoji}</span>
                  <span style={{ fontWeight: 800, fontSize: 14, color: 'white' }}>{label}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setSwallowPicker(null)} style={{ width: '100%', marginTop: 12, background: 'transparent', border: 'none', color: 'var(--ink-3, #6B6660)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: '8px 0' }}>Cancel</button>
          </div>
        </div>
      )}

            {/* Portion picker sheet */}
      {portionPicker && (
        <PortionPickerSheet
          item={portionPicker}
          extras={menuItems.filter(i =>
            i.is_available &&
            i.id !== portionPicker.id &&
            ['protein', 'proteins', 'side', 'sides', 'extra', 'extras', 'snack']
              .includes(i.category?.toLowerCase() ?? '')
          )}
          onConfirm={confirmPortionChoice}
          onClose={() => setPortionPicker(null)}
        />
      )}

      {/* Switch-restaurant confirm sheet */}
      {confirmSwitch && (
        <ConfirmSheet
          title="Start a new order?"
          body="You have items from another restaurant in your cart. Starting this order will clear it."
          confirmLabel="Start new order"
          onConfirm={confirmSwitchRestaurant}
          onCancel={() => setConfirmSwitch(null)}
        />
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────────────── */


const SWALLOW_KEYWORDS = ['swallow', 'eba', 'fufu', 'garri', 'amala', 'pounded yam', 'semovita', 'tuwo']
function isSwallowItem(item: MenuItem) {
  const lower = item.name.toLowerCase() + ' ' + (item.category ?? '').toLowerCase()
  return SWALLOW_KEYWORDS.some(k => lower.includes(k))
}

function MenuItemRow({ item, qty, onAdd, onDec }: {
  item: MenuItem; qty: number; onAdd: () => void; onDec: () => void
  }) {
  const hasPortions = item.has_portions || item.portion_min_price || item.portion_max_price
  return (
    <div style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--line-soft, #1F1D1B)' }}>
      <div
        className="stripe-placeholder-soft"
        style={{ width: 64, height: 64, borderRadius: 12, flexShrink: 0, backgroundColor: 'var(--bg-1, #1A1917)', overflow: 'hidden' }}
      >
        {item.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontWeight: 800, fontSize: 14, margin: 0, color: 'white' }}>{item.name}</p>
          {item.description && (
            <p style={{ fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 500, margin: '2px 0 0', lineHeight: 1.4 }}>
              {item.description}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 14, color: 'white' }}>₦{item.price.toLocaleString()}</span>
          {qty > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-1, #1A1917)', border: '1px solid var(--line, #2A2825)', borderRadius: 999, padding: 2 }}>
              <button onClick={onDec} aria-label={`Remove one ${item.name}`} style={{ width: 26, height: 26, borderRadius: '50%', background: 'transparent', color: 'var(--accent, #FF6B2B)', border: 'none', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>−</button>
              <span style={{ fontSize: 13, fontWeight: 800, minWidth: 16, textAlign: 'center', color: 'white' }}>{qty}</span>
              <button onClick={onAdd} aria-label={`Add one ${item.name}`} style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent, #FF6B2B)', color: 'white', border: 'none', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>+</button>
            </div>
          ) : (
            <button
              onClick={onAdd}
              className="press"
              aria-label={`Add ${item.name}`}
              style={{ height: 30, padding: '0 16px', borderRadius: 999, background: 'var(--accent, #FF6B2B)', color: 'white', border: 'none', fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Add
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function MenuSkeleton() {
  return (
    <div className="mobile-container">
      <div style={{ height: 140, background: 'var(--bg-1, #1A1917)' }} />
      <div style={{ padding: '16px' }}>
        <div style={{ height: 22, width: 180, background: 'var(--bg-1, #1A1917)', borderRadius: 8 }} />
        <div style={{ height: 12, width: 220, background: 'var(--bg-1, #1A1917)', borderRadius: 6, marginTop: 8 }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          {[60, 60, 70, 50].map((w, i) => (
            <div key={i} style={{ height: 28, width: w, background: 'var(--bg-1, #1A1917)', borderRadius: 999 }} />
          ))}
        </div>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <div style={{ width: 64, height: 64, background: 'var(--bg-1, #1A1917)', borderRadius: 12 }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 12, width: '60%', background: 'var(--bg-1, #1A1917)', borderRadius: 6 }} />
              <div style={{ height: 10, width: '80%', background: 'var(--bg-1, #1A1917)', borderRadius: 5, marginTop: 6 }} />
              <div style={{ height: 12, width: '30%', background: 'var(--bg-1, #1A1917)', borderRadius: 6, marginTop: 12 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}


const ADDON_CATS = ['protein', 'side', 'sides', 'extra', 'extras', 'snack']

function PortionPickerSheet({ item, extras = [], onConfirm, onClose }: {
  item: MenuItem
  extras?: MenuItem[]
  onConfirm: (
    selections: { price: number; quantity: number }[],
    addons: { menu_item_id: string; name: string; price: number; quantity: number; portions?: Array<{price: number; quantity: number}> }[],
    swallow?: 'garri' | 'fufu'
  ) => void
  onClose: () => void
}) {
  const N = '\u20A6'
  const SWALLOW_KW = ['swallow', 'eba', 'fufu', 'garri', 'amala', 'pounded yam', 'semovita', 'tuwo']
  const isSwallow  = SWALLOW_KW.some(k => (item.name + ' ' + (item.category ?? '')).toLowerCase().includes(k))
  const minPrice  = item.portion_min_price  ?? item.price
  const firstStep = item.portion_first_step ?? 200
  const step      = item.portion_step       ?? 100
  const maxPrice  = item.portion_max_price  ?? item.price
  const steps: number[] = [minPrice]
  if (maxPrice > minPrice && firstStep > 0) {
    const second = minPrice + firstStep
    if (second <= maxPrice) {
      steps.push(second)
      if (step > 0) { let c = second + step; while (c <= maxPrice) { steps.push(c); c += step } }
    }
  }
  const [selectedPrice, setSelectedPrice] = useState(steps[0])
  const [swallowChoice, setSwallowChoice] = useState<'garri' | 'fufu' | null>(null)
  const [addonQtys, setAddonQtys] = useState<Record<string, number>>({})
  const [addonPortionQtys, setAddonPortionQtys] = useState<Record<string, Record<number, number>>>({})
  function incA(id: string) { setAddonQtys(q => ({ ...q, [id]: (q[id] ?? 0) + 1 })) }
  function decA(id: string) {
    setAddonQtys(q => { const next = (q[id] ?? 0) - 1; if (next <= 0) { const { [id]: _, ...rest } = q; return rest }; return { ...q, [id]: next } })
  }
  function incAP(id: string, price: number) {
    setAddonPortionQtys(q => ({ ...q, [id]: { ...(q[id] ?? {}), [price]: ((q[id] ?? {})[price] ?? 0) + 1 } }))
  }
  function decAP(id: string, price: number) {
    setAddonPortionQtys(q => { const tier = { ...(q[id] ?? {}) }; tier[price] = (tier[price] ?? 0) - 1; if (tier[price] <= 0) delete tier[price]; return { ...q, [id]: tier } })
  }
  function pickSize(price: number) { setSelectedPrice(price); setAddonQtys({}); setAddonPortionQtys({}) }
  const addonSelections = extras
    .filter(e => { if (e.has_portions) return Object.values(addonPortionQtys[e.id] ?? {}).some(qty => qty > 0); return (addonQtys[e.id] ?? 0) > 0 })
    .map(e => {
      if (e.has_portions) {
        const portionList = Object.entries(addonPortionQtys[e.id] ?? {}).map(([p, q]) => ({ price: Number(p), quantity: q })).filter(p => p.quantity > 0)
        return { menu_item_id: e.id, name: e.name, price: 0, quantity: 0, portions: portionList }
      }
      return { menu_item_id: e.id, name: e.name, price: e.price, quantity: addonQtys[e.id], portions: undefined }
    })
  const addonAmount = addonSelections.reduce((s, a) => {
    if (a.portions && a.portions.length > 0) return s + a.portions.reduce((ps, p) => ps + p.price * p.quantity, 0)
    return s + a.price * a.quantity
  }, 0)
  const selections  = [{ price: selectedPrice, quantity: 1 }]
  const totalAmount = selectedPrice + addonAmount
  const canAdd      = !isSwallow || swallowChoice !== null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', maxWidth: 430, margin: '0 auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', background: 'var(--bg-1, #1A1917)', borderTopLeftRadius: 24, borderTopRightRadius: 24, border: '1px solid var(--line, #2A2825)', borderBottom: 'none', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 20px 0', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, background: 'var(--line, #2A2825)', borderRadius: 2, margin: '0 auto 18px' }} />
          <p style={{ fontWeight: 900, fontSize: 17, color: 'white', margin: '0 0 2px' }}>{item.name}</p>
          <p style={{ fontSize: 13, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '0 0 20px' }}>
            {isSwallow ? 'Build your plate.' : 'Pick a size, then build your plate.'}
          </p>
        </div>
        <div className="scroll-hide" style={{ overflowY: 'auto', padding: '0 20px', flex: 1 }}>
          {steps.length > 1 && (
            <>
              <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-3, #6B6660)', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 10px' }}>Size</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
                {steps.map(p => { const on = selectedPrice === p; return (
                  <button key={p} onClick={() => pickSize(p)} className="press"
                    style={{ padding: '8px 18px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: 14, background: on ? 'var(--accent, #FF6B2B)' : 'var(--bg-0, #0C0B09)', color: on ? 'white' : 'var(--ink-2, #A09A8E)', border: on ? 'none' : '1px solid var(--line, #2A2825)', boxShadow: on ? '0 2px 8px rgba(255,107,43,0.35)' : 'none' }}>
                    {N}{p.toLocaleString()}
                  </button>
                )})}
              </div>
            </>
          )}
          {isSwallow && (
            <div style={{ marginBottom: 22 }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-3, #6B6660)', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 10px' }}>
                Swallow <span style={{ color: 'var(--danger, #FF3B30)', fontWeight: 900 }}>*</span>
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                {(['garri', 'fufu'] as const).map(val => {
                  const label = val === 'garri' ? 'Garri (Eba)' : 'Fufu'
                  const emoji = val === 'garri' ? '🫙' : '🥣'
                  const on = swallowChoice === val
                  return (
                    <button key={val} onClick={() => setSwallowChoice(val)} className="press"
                      style={{ flex: 1, background: on ? 'rgba(255,107,43,0.12)' : 'var(--bg-0, #0C0B09)', border: `2px solid ${on ? 'var(--accent, #FF6B2B)' : 'var(--line, #2A2825)'}`, borderRadius: 16, padding: '16px 12px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 32 }}>{emoji}</span>
                      <span style={{ fontWeight: 800, fontSize: 13, color: on ? 'var(--accent, #FF6B2B)' : 'white' }}>{label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {extras.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-3, #6B6660)', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 4px' }}>
                Add to plate <span style={{ fontWeight: 600, textTransform: 'none', letterSpacing: 0, fontSize: 10 }}>(optional)</span>
              </p>
              {extras.map(e => {
                if (e.has_portions) {
                  const aMin = e.portion_min_price ?? e.price; const aFst = e.portion_first_step ?? 200
                  const aStp = e.portion_step ?? 100; const aMax = e.portion_max_price ?? e.price
                  const aSteps: number[] = [aMin]
                  if (aMax > aMin && aFst > 0) { const sec = aMin + aFst; if (sec <= aMax) { aSteps.push(sec); if (aStp > 0) { let c = sec + aStp; while (c <= aMax) { aSteps.push(c); c += aStp } } } }
                  const tiers = addonPortionQtys[e.id] ?? {}; const anySelected = Object.values(tiers).some(q => q > 0)
                  return (
                    <div key={e.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--line-soft, #1F1D1B)' }}>
                      <p style={{ fontWeight: 700, fontSize: 14, color: anySelected ? 'var(--accent, #FF6B2B)' : 'white', margin: '0 0 8px' }}>{e.name}</p>
                      {aSteps.map(p => { const qty = tiers[p] ?? 0; return (
                        <div key={p} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0 5px 12px' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: qty > 0 ? 'var(--accent, #FF6B2B)' : 'var(--ink-2, #A09A8E)' }}>+{N}{p.toLocaleString()}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <button onClick={() => decAP(e.id, p)} className="press"
                              style={{ width: 28, height: 28, borderRadius: '50%', background: qty > 0 ? 'rgba(255,107,43,0.15)' : 'var(--bg-0, #0C0B09)', border: `1px solid ${qty > 0 ? 'rgba(255,107,43,0.4)' : 'var(--line, #2A2825)'}`, color: qty > 0 ? 'var(--accent, #FF6B2B)' : 'var(--ink-3, #6B6660)', fontSize: 16, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', opacity: qty === 0 ? 0.35 : 1 }}>-</button>
                            <span style={{ fontSize: 14, fontWeight: 900, color: 'white', minWidth: 16, textAlign: 'center' }}>{qty}</span>
                            <button onClick={() => incAP(e.id, p)} className="press"
                              style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent, #FF6B2B)', border: 'none', color: 'white', fontSize: 16, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>+</button>
                          </div>
                        </div>
                      )})}
                    </div>
                  )
                }
                const qty = addonQtys[e.id] ?? 0
                return (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--line-soft, #1F1D1B)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 700, fontSize: 14, color: qty > 0 ? 'var(--accent, #FF6B2B)' : 'white', margin: 0 }}>{e.name}</p>
                      <p style={{ fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '2px 0 0' }}>+{N}{e.price.toLocaleString()}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                      <button onClick={() => decA(e.id)} className="press"
                        style={{ width: 34, height: 34, borderRadius: '50%', background: qty > 0 ? 'rgba(255,107,43,0.15)' : 'var(--bg-0, #0C0B09)', border: `1px solid ${qty > 0 ? 'rgba(255,107,43,0.4)' : 'var(--line, #2A2825)'}`, color: qty > 0 ? 'var(--accent, #FF6B2B)' : 'var(--ink-3, #6B6660)', fontSize: 18, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', opacity: qty === 0 ? 0.35 : 1 }}>-</button>
                      <span style={{ fontSize: 16, fontWeight: 900, color: 'white', minWidth: 20, textAlign: 'center' }}>{qty}</span>
                      <button onClick={() => incA(e.id)} className="press"
                        style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--accent, #FF6B2B)', border: 'none', color: 'white', fontSize: 18, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>+</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div style={{ height: 20 }} />
        </div>
        <div style={{ padding: '12px 20px 32px', borderTop: '1px solid var(--line, #2A2825)', flexShrink: 0, background: 'var(--bg-1, #1A1917)' }}>
          {isSwallow && !swallowChoice && (
            <p style={{ fontSize: 12, color: 'var(--danger, #FF3B30)', fontWeight: 700, margin: '0 0 8px', textAlign: 'center' }}>
              Choose your swallow to continue
            </p>
          )}
          {totalAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 600 }}>
                {N}{selectedPrice.toLocaleString()} plate
                {swallowChoice && ` \u00B7 ${swallowChoice === 'garri' ? 'Garri (Eba)' : 'Fufu'}`}
                {addonSelections.length > 0 && ` + ${addonSelections.length} extra${addonSelections.length !== 1 ? 's' : ''}`}
              </span>
              <span className="font-display" style={{ fontSize: 22, color: 'var(--accent, #FF6B2B)' }}>{N}{totalAmount.toLocaleString()}</span>
            </div>
          )}
          <button onClick={() => canAdd && onConfirm(selections, addonSelections, swallowChoice ?? undefined)} className="press"
            style={{ width: '100%', background: canAdd ? 'var(--accent, #FF6B2B)' : 'var(--bg-2, #26241F)', color: canAdd ? 'white' : 'var(--ink-3, #6B6660)', border: 'none', borderRadius: 14, padding: '14px', fontWeight: 900, fontSize: 16, cursor: canAdd ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
            Add plate {'—'} {N}{totalAmount.toLocaleString()}
          </button>
          <button onClick={onClose} style={{ width: '100%', marginTop: 8, background: 'transparent', border: 'none', color: 'var(--ink-3, #6B6660)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: '8px 0' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
