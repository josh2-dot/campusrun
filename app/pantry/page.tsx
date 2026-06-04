'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ShoppingBag, Plus, Minus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCartStore } from '@/store/cart'
import type { MenuItem, Restaurant } from '@/types'

export default function PantryPage() {
  const router = useRouter()
  const supabase = createClient()
  const { items, addItem, updateQuantity, totalItems, foodTotal } = useCartStore()

  const [pantry, setPantry] = useState<Restaurant | null>(null)
  const [pantryItems, setPantryItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: rest } = await supabase
        .from('restaurants')
        .select('*')
        .eq('is_pantry', true)
        .single()

      if (!rest) { setLoading(false); return }
      setPantry(rest)

      const { data: menu } = await supabase
        .from('menu_items')
        .select('*')
        .eq('restaurant_id', rest.id)
        .eq('is_available', true)
        .order('category', { ascending: true })
        .order('name')

      setPantryItems(menu ?? [])
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function inCart(itemId: string) {
    return items.find(i => i.menu_item_id === itemId)?.quantity ?? 0
  }

  function handleAdd(item: MenuItem) {
    if (!pantry) return
    addItem(item, pantry.id, pantry.name, { is_pantry: true })
  }

  function handleDecrement(item: MenuItem) {
  const current = inCart(item.id)
  const newQty = Math.max(0, current - 1)
  updateQuantity(item.id, newQty)
}

  // Group items by category for cleaner display
  const grouped = pantryItems.reduce((acc, item) => {
    const cat = item.category || 'Other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {} as Record<string, MenuItem[]>)

  const cartCount = totalItems()
  const cartAmount = foodTotal()

  return (
    <div className="mobile-container" style={{ display: 'flex', flexDirection: 'column', fontFamily: "'Nunito', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ padding: '52px 20px 14px', borderBottom: '1px solid var(--line-soft, #1F1D1B)', background: 'var(--bg-0, #0C0B09)' }}>
        <button onClick={() => router.back()} className="press" aria-label="Back"
          style={{ width: 36, height: 36, borderRadius: 999, background: 'var(--bg-1, #1A1917)', border: '1px solid var(--line, #2A2825)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10, cursor: 'pointer' }}>
          <ChevronLeft size={18} />
        </button>
        <p className="label-cap" style={{ color: 'var(--accent, #FF6B2B)', margin: 0, fontSize: 10 }}>🥤 Snacks &amp; Drinks</p>
        <h1 className="font-display" style={{ fontSize: 28, margin: '4px 0 6px', color: 'white', lineHeight: 1.05 }}>
          The Pantry.
        </h1>
        <p style={{ fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: 0, lineHeight: 1.5 }}>
          Add anything here to your order — runner grabs them from the nearest shop. Same price as the shop, plus ₦500 delivery.
        </p>
      </div>

      {/* Body */}
      <div className="scroll-hide" style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 24px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🛒</div>
            <p style={{ color: 'var(--ink-3, #6B6660)', fontSize: 13, fontWeight: 600 }}>Loading pantry...</p>
          </div>
        ) : pantryItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📦</div>
            <p style={{ color: 'white', fontWeight: 800, fontSize: 16 }}>Pantry coming soon</p>
            <p style={{ color: 'var(--ink-3, #6B6660)', fontSize: 13, fontWeight: 600, marginTop: 4 }}>
              Snacks and drinks will be stocked here shortly.
            </p>
          </div>
        ) : (
          Object.entries(grouped).map(([category, items]) => (
            <div key={category} style={{ marginBottom: 20 }}>
              <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', fontSize: 10, marginBottom: 10 }}>
                {category}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map(item => {
                  const qty = inCart(item.id)
                  return (
                    <div key={item.id}
                      style={{ background: 'var(--bg-1, #1A1917)', border: `1px solid ${qty > 0 ? 'rgba(255,107,43,0.3)' : 'var(--line, #2A2825)'}`, borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, transition: 'border-color 0.15s' }}>

                      {/* Thumbnail */}
                      <div style={{ width: 50, height: 50, borderRadius: 10, background: 'var(--bg-2, #26241F)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                        {item.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <span style={{ fontSize: 22 }}>{categoryEmoji(category)}</span>
                        )}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 800, fontSize: 13, color: 'white', margin: 0 }}>{item.name}</p>
                        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent, #FF6B2B)', margin: '2px 0 0' }}>
                          ₦{item.price.toLocaleString()}
                        </p>
                      </div>

                      {/* Add / qty controls */}
                      {qty === 0 ? (
                        <button onClick={() => handleAdd(item)} className="press"
                          aria-label={`Add ${item.name}`}
                          style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent, #FF6B2B)', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Plus size={18} strokeWidth={2.5} />
                        </button>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <button onClick={() => handleDecrement(item)} className="press"
                            aria-label={`Remove one ${item.name}`}
                            style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--bg-2, #26241F)', color: 'white', border: '1px solid var(--line, #2A2825)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Minus size={14} strokeWidth={2.5} />
                          </button>
                          <span className="font-display" style={{ fontSize: 16, color: 'white', minWidth: 16, textAlign: 'center' }}>{qty}</span>
                          <button onClick={() => handleAdd(item)} className="press"
                            aria-label={`Add another ${item.name}`}
                            style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent, #FF6B2B)', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Plus size={14} strokeWidth={2.5} />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Cart bar */}
      {cartCount > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, padding: '12px 16px 28px', background: 'linear-gradient(to top, var(--bg-0, #0C0B09) 65%, transparent)', zIndex: 40, pointerEvents: 'none' }}>
          <button onClick={() => router.push('/checkout')} className="press"
            style={{ width: '100%', background: 'var(--accent, #FF6B2B)', color: 'white', border: 'none', borderRadius: 16, padding: '14px 16px', display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center', cursor: 'pointer', fontFamily: 'inherit', pointerEvents: 'auto', boxShadow: '0 4px 24px rgba(255,107,43,0.35)' }}>
            <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: '4px 9px', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4 }}>
              <ShoppingBag size={13} />{cartCount}
            </div>
            <span style={{ textAlign: 'left', fontWeight: 800, fontSize: 14 }}>Checkout</span>
            <span className="font-display" style={{ fontSize: 15 }}>₦{cartAmount.toLocaleString()}</span>
          </button>
        </div>
      )}
    </div>
  )
}

function categoryEmoji(category: string): string {
  const c = category.toLowerCase()
  if (c.includes('drink') || c.includes('beverage') || c.includes('juice')) return '🥤'
  if (c.includes('water'))   return '💧'
  if (c.includes('snack') || c.includes('biscuit')) return '🍪'
  if (c.includes('chip') || c.includes('crisp'))    return '🥨'
  if (c.includes('chocolate') || c.includes('candy') || c.includes('sweet')) return '🍫'
  return '🛒'
}
