'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCartStore } from '@/store/cart'
import { monogram } from '@/lib/utils'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import type { Restaurant, MenuItem } from '@/types'
import { ChevronLeft, Heart } from 'lucide-react'

const SWALLOW_KEYWORDS = ['swallow', 'eba', 'fufu', 'garri', 'amala', 'pounded yam', 'semovita', 'tuwo']
function isSwallowItem(item: MenuItem) {
  const lower = item.name.toLowerCase() + ' ' + (item.category ?? '').toLowerCase()
  return SWALLOW_KEYWORDS.some(k => lower.includes(k))
}

export default function RestaurantPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const { addItem, items, restaurantId: cartRestaurantId, totalItems, foodTotal, updateQuantity } = useCartStore()
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [activeCategory, setActiveCategory] = useState('All')
  const [loading, setLoading] = useState(true)
  const [confirmSwitch, setConfirmSwitch] = useState<MenuItem | null>(null)
  const [swallowPicker, setSwallowPicker] = useState<MenuItem | null>(null)
  const [portionPicker, setPortionPicker] = useState<MenuItem | null>(null)
  const chipRowRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    async function load() {
      const [{ data: rest }, { data: its }] = await Promise.all([
        supabase.from('restaurants').select('*').eq('id', id).single(),
        supabase.from('menu_items').select('*').eq('restaurant_id', id).eq('is_available', true).order('category'),
      ])
      setRestaurant(rest)
      setMenuItems(its ?? [])
      setLoading(false)
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
    if (cartRestaurantId && cartRestaurantId !== id) {
      setConfirmSwitch(item)
      return
    }
    if (isSwallowItem(item)) {
      setSwallowPicker(item)
      return
    }
    if (item.portion_min_price || item.portion_max_price) {
      setPortionPicker(item)
      return
    }
    addItem(item, id, restaurant?.name ?? '')
  }

  function confirmSwallowChoice(choice: 'garri' | 'fufu') {
    if (!swallowPicker) return
    addItem(swallowPicker, id, restaurant?.name ?? '', { swallow: choice })
    setSwallowPicker(null)
  }

function confirmPortionChoice(selections: { price: number; quantity: number }[]) {
  if (!portionPicker) return
  
  // Clear any existing items with same menu_item_id first
  const { items, removeItem } = useCartStore.getState()
  items
    .filter(i => i.menu_item_id === portionPicker.id)
    .forEach(i => removeItem(i.menu_item_id))
  
  // Add each portion as a separate cart item with unique identifier
  selections.forEach((selection, index) => {
    if (selection.quantity > 0) {
      addItem(
        { 
          ...portionPicker, 
          id: `${portionPicker.id}_portion_${index}`, // Unique ID for each portion
          price: selection.price 
        },
        id, 
        restaurant?.name ?? '',
        { portions: selections }
      )
    }
  })
  setPortionPicker(null)
}

  function confirmSwitchRestaurant() {
    if (!confirmSwitch) return
    // Clear cart and add new item
    const { clearCart } = useCartStore.getState()
    clearCart()
    addItem(confirmSwitch, id, restaurant?.name ?? '')
    setConfirmSwitch(null)
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

      {/* Cart bar */}
      {totalItems() > 0 && (
        <div style={{ padding: '12px 16px 24px', background: 'linear-gradient(to top, var(--bg-0, #0C0B09) 72%, transparent)' }}>
          <button
            onClick={() => router.push('/checkout')}
            className="press"
            style={{ width: '100%', background: 'var(--accent, #FF6B2B)', color: 'white', border: 'none', borderRadius: 16, padding: '14px 16px', display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <span style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: '4px 9px', fontSize: 12, fontWeight: 800, color: 'white' }}>
              {totalItems()}
            </span>
            <span style={{ textAlign: 'left', fontWeight: 800, fontSize: 14 }}>Checkout</span>
            <span className="font-display" style={{ fontSize: 15 }}>₦{foodTotal().toLocaleString()}</span>
          </button>
        </div>
      )}

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

function MenuItemRow({ item, qty, onAdd, onDec }: {
  item: MenuItem; qty: number; onAdd: () => void; onDec: () => void
}) {
  const hasPortions = item.portion_min_price || item.portion_max_price
  
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
          <p style={{ fontWeight: 800, fontSize: 14, margin: 0, color: 'white' }}>
            {item.name}
            {hasPortions && (
              <span style={{ marginLeft: 6, background: 'rgba(255,107,43,0.12)', color: 'var(--accent, #FF6B2B)', fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4 }}>
                SIZES
              </span>
            )}
          </p>
          {item.description && (
            <p style={{ fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 500, margin: '2px 0 0', lineHeight: 1.4 }}>
              {item.description}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 14, color: 'white' }}>
            {hasPortions ? `From ₦${(item.portion_min_price || item.price).toLocaleString()}` : `₦${item.price.toLocaleString()}`}
          </span>
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

function PortionPickerSheet({ item, onConfirm, onClose }: {
  item: MenuItem
  onConfirm: (selections: { price: number; quantity: number }[]) => void
  onClose: () => void
}) {
  const N = '\u20A6'
  const minPrice  = item.portion_min_price  ?? item.price
  const firstStep = item.portion_first_step ?? 200
  const step      = item.portion_step       ?? 100
  const maxPrice  = item.portion_max_price  ?? item.price

  // Build all price steps
  const steps: number[] = [minPrice]
  if (maxPrice > minPrice && firstStep > 0) {
    const second = minPrice + firstStep
    if (second <= maxPrice) {
      steps.push(second)
      if (step > 0) {
        let current = second + step
        while (current <= maxPrice) {
          steps.push(current)
          current += step
        }
      }
    }
  }

  // qty per price step — default all 0 except first
  const [qtys, setQtys] = useState<Record<number, number>>(() => {
    const init: Record<number, number> = {}
    steps.forEach(s => init[s] = 0)
    init[steps[0]] = 1 // Default: 1 plate at cheapest price
    return init
  })

  function inc(price: number) { 
    setQtys(q => ({ ...q, [price]: (q[price] ?? 0) + 1 })) 
  }
  
  function dec(price: number) {
    setQtys(q => {
      const next = (q[price] ?? 0) - 1
      if (next <= 0) { 
        const { [price]: _, ...rest } = q
        return rest 
      }
      return { ...q, [price]: next }
    })
  }

  const selections = Object.entries(qtys)
    .map(([price, quantity]) => ({ price: Number(price), quantity }))
    .filter(s => s.quantity > 0)
  
  const totalPlates = selections.reduce((s, x) => s + x.quantity, 0)
  const totalAmount = selections.reduce((s, x) => s + x.price * x.quantity, 0)
  const canAdd = totalPlates > 0

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', maxWidth: 430, margin: '0 auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ width: '100%', background: 'var(--bg-1, #1A1917)', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: '20px 20px 36px', border: '1px solid var(--line, #2A2825)', borderBottom: 'none' }}>
        <div style={{ width: 36, height: 4, background: 'var(--line, #2A2825)', borderRadius: 2, margin: '0 auto 18px' }} />
        <p style={{ fontWeight: 900, fontSize: 17, color: 'white', margin: '0 0 2px' }}>{item.name}</p>
        <p style={{ fontSize: 13, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '0 0 20px' }}>
          Each row is a separate portion size. Mix and match plates.
        </p>

        {/* One row per price step */}
        {steps.map(p => {
          const qty = qtys[p] ?? 0
          const rowTotal = p * qty
          return (
            <div key={p} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--line-soft, #1F1D1B)' }}>
              <div>
                <p style={{ fontWeight: 900, fontSize: 16, color: qty > 0 ? 'var(--accent, #FF6B2B)' : 'white', margin: 0 }}>
                  {N}{p.toLocaleString()}
                </p>
                {qty > 0 && (
                  <p style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '2px 0 0' }}>
                    {qty} plate{qty !== 1 ? 's' : ''} = {N}{rowTotal.toLocaleString()}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={() => dec(p)}
                  className="press"
                  style={{ width: 34, height: 34, borderRadius: '50%', background: qty > 0 ? 'rgba(255,107,43,0.15)' : 'var(--bg-0, #0C0B09)', border: `1px solid ${qty > 0 ? 'rgba(255,107,43,0.4)' : 'var(--line, #2A2825)'}`, color: qty > 0 ? 'var(--accent, #FF6B2B)' : 'var(--ink-3, #6B6660)', fontSize: 18, fontWeight: 900, cursor: qty > 0 ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>
                  −
                </button>
                <span style={{ fontSize: 16, fontWeight: 900, color: 'white', minWidth: 20, textAlign: 'center' }}>{qty}</span>
                <button onClick={() => inc(p)}
                  className="press"
                  style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--accent, #FF6B2B)', border: 'none', color: 'white', fontSize: 18, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>
                  +
                </button>
              </div>
            </div>
          )
        })}

        {/* Summary */}
        {totalPlates > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '16px 0 14px' }}>
            <span style={{ fontSize: 13, color: 'var(--ink-3, #6B6660)', fontWeight: 600 }}>
              {totalPlates} plate{totalPlates !== 1 ? 's' : ''} total
            </span>
            <span className="font-display" style={{ fontSize: 22, color: 'var(--accent, #FF6B2B)' }}>
              {N}{totalAmount.toLocaleString()}
            </span>
          </div>
        )}

        <button onClick={() => canAdd && onConfirm(selections)} 
          className="press"
          style={{ width: '100%', background: canAdd ? 'var(--accent, #FF6B2B)' : 'var(--bg-2, #26241F)', color: canAdd ? 'white' : 'var(--ink-3, #6B6660)', border: 'none', borderRadius: 14, padding: '14px', fontWeight: 900, fontSize: 16, cursor: canAdd ? 'pointer' : 'not-allowed', fontFamily: 'inherit', marginTop: totalPlates === 0 ? 20 : 0 }}>
          {canAdd ? `Add to cart — ${N}${totalAmount.toLocaleString()}` : 'Select at least 1 plate'}
        </button>
        <button onClick={onClose} style={{ width: '100%', marginTop: 8, background: 'transparent', border: 'none', color: 'var(--ink-3, #6B6660)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: '8px 0' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}