import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CartItem, MenuItem } from '@/types'

export const PLATE_FEE = 200

interface CartStore {
  restaurantId: string | null
  restaurantName: string | null
  items: CartItem[]
  deliveryAddress: string
  wantPlate: boolean  // default true, ₦200 extra

  addItem: (item: MenuItem, restaurantId: string, restaurantName: string, options?: CartItem['options']) => void
  removeItem: (menuItemId: string) => void
  updateQuantity: (menuItemId: string, quantity: number, price?: number) => void
  setDeliveryAddress: (address: string) => void
  lastAddress: string
  setWantPlate: (want: boolean) => void
  clearCart: () => void

  // Computed
  totalItems: () => number
  foodTotal: () => number
  plateFeeTotal: () => number
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      restaurantId: null,
      restaurantName: null,
      items: [],
      deliveryAddress: '',
      lastAddress: '',
      wantPlate: true,

      addItem: (menuItem, restaurantId, restaurantName, options) => {
       const { items, restaurantId: currentRestaurantId } = get()

       // Clear cart if switching restaurants
        if (currentRestaurantId && currentRestaurantId !== restaurantId) {
          set({
            restaurantId,
            restaurantName,
            wantPlate: true,
            items: [{
              menu_item_id: menuItem.id,
              name: menuItem.name,
              price: menuItem.price,
              quantity: 1,
              options,
            }],
          })
          return
        }
      
        // For portion items, match by both menu_item_id AND price
        const existing = items.find(i => 
          i.menu_item_id === menuItem.id && 
          i.price === menuItem.price &&
          JSON.stringify(i.options?.portions) === JSON.stringify(options?.portions)
        )

        if (existing) {
         set({
            items: items.map(i =>
                    (i.menu_item_id === menuItem.id && i.price === menuItem.price)
                ? { ...i, quantity: i.quantity + 1 }
                : i
            ),
          })
        } else {
          set({
            restaurantId,
            restaurantName,
            items: [...items, {
              menu_item_id: menuItem.id,
              name: menuItem.name,
              price: menuItem.price,
              quantity: 1,
              options,
            }],
          })
        }
      },

      removeItem: (menuItemId) => {
        set({ items: get().items.filter(i => i.menu_item_id !== menuItemId) })
      },

      updateQuantity: (menuItemId, quantity, price?: number) => {
        if (quantity <= 0) {
          get().removeItem(menuItemId)
          return
        }
        set({
          items: get().items.map(i =>
            (i.menu_item_id === menuItemId && (price === undefined || i.price === price))
              ? { ...i, quantity } : i
          ),
        })
      },

      setDeliveryAddress: (address) => set({ deliveryAddress: address, lastAddress: address }),

      clearCart: () => set(s => ({
  restaurantId: null,
  restaurantName: null,
  items: [],
  deliveryAddress: '',
  wantPlate: true,
  lastAddress: s.lastAddress, // keep last address across orders
})),

      totalItems: () => get().items.reduce((sum, i) => {
    if (i.options?.portions && Array.isArray(i.options.portions)) {
    return sum + (i.options.portions as Array<{price: number; quantity: number}>).reduce((s, p) => s + p.quantity, 0)
    }
     return sum + i.quantity
    }, 0),


      foodTotal: () => get().items.reduce((sum, i) => {
        // Base price from portions or regular price
        let base = 0
        if (i.options?.portions && Array.isArray(i.options.portions)) {
          base = (i.options.portions as Array<{price: number; quantity: number}>)
            .reduce((s, p) => s + p.price * p.quantity, 0)
        } else {
          base = i.price * i.quantity
        }
        // Add bundled addons — handle portioned addons (e.g. half/full chicken)
        const addonTotal = (i.options?.addons ?? []).reduce((s, a) => {
          if (a.portions && a.portions.length > 0) {
            return s + a.portions.reduce((ps, p) => ps + p.price * p.quantity, 0)
          }
          return s + a.price * a.quantity
        }, 0)
        return sum + base + addonTotal
      }, 0),
      plateFeeTotal: () => {
      const { wantPlate, items } = get()
      if (!wantPlate) return 0
      return items.reduce((sum, i) => sum + i.quantity, 0) * PLATE_FEE
      },
      setWantPlate: (want) => set({ wantPlate: want }),
    }),
    { name: 'campusrun-cart' }
  )
)
/* ── Favorites (localStorage) ─────────────────────────── */
const FAV_KEY = 'campusrun-favorites'

export function getFavorites(): string[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') } catch { return [] }
}

export function toggleFavorite(restaurantId: string): boolean {
  const current = getFavorites()
  const isFav = current.includes(restaurantId)
  const next = isFav
    ? current.filter(id => id !== restaurantId)
    : [...current, restaurantId]
  localStorage.setItem(FAV_KEY, JSON.stringify(next))
  return !isFav
}

export function isFavorite(restaurantId: string): boolean {
  return getFavorites().includes(restaurantId)
}